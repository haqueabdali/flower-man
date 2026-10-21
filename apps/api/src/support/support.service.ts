import { type AdminSupportTicket, type CreateTicketRequest, MAX_OPEN_TICKETS, type SupportStatus, type SupportTicket } from '@flower-man/contracts';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';

import { recordAudit } from '../common/audit.js';
import { PG_POOL } from '../database/database.module.js';
import { withTransaction } from '../database/transaction.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { NotificationsService } from '../notifications/notifications.service.js';

interface TicketRow {
  id: string;
  subject: string;
  status: SupportStatus;
  order_number: string | null;
  created_at: Date;
  updated_at: Date;
  user_email: string;
  user_name: string;
}

/** Users get their own tickets without the identity fields the team needs. */
const withoutUser = ({ userEmail: _email, userName: _name, ...ticket }: AdminSupportTicket): SupportTicket => ticket;

const TICKET_SELECT = `
  SELECT t.id, t.subject, t.status, o.order_number, t.created_at, t.updated_at, u.email AS user_email, u.full_name AS user_name
    FROM support_tickets t JOIN users u ON u.id = t.user_id LEFT JOIN orders o ON o.id = t.order_id`;

/** Help & support (ADR-030). Users see only their own tickets; the platform team sees all of them. */
@Injectable()
export class SupportService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, input: CreateTicketRequest): Promise<SupportTicket> {
    const id = await withTransaction(this.pool, async (client) => {
      // Serialises one user's concurrent requests, so the open-ticket limit holds.
      await client.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const open = await client.query<{ count: string }>(`SELECT count(*) FROM support_tickets WHERE user_id = $1 AND status <> 'CLOSED'`, [userId]);
      if (Number(open.rows[0]?.count ?? 0) >= MAX_OPEN_TICKETS) {
        throw new ConflictException(`You already have ${MAX_OPEN_TICKETS} open conversations. Reply in one of them.`);
      }
      if (input.orderId) {
        const order = await client.query('SELECT 1 FROM orders WHERE id = $1 AND customer_id = $2', [input.orderId, userId]);
        if (order.rowCount !== 1) throw new NotFoundException('Order not found.');
      }
      const ticket = await client.query<{ id: string }>('INSERT INTO support_tickets (user_id, order_id, subject) VALUES ($1, $2, $3) RETURNING id', [userId, input.orderId ?? null, input.subject]);
      const ticketId = ticket.rows[0]?.id as string;
      await client.query(`INSERT INTO support_messages (ticket_id, author, author_user_id, body) VALUES ($1, 'USER', $2, $3)`, [ticketId, userId, input.body]);
      return ticketId;
    });
    return this.getForUser(userId, id);
  }

  async listForUser(userId: string): Promise<SupportTicket[]> {
    const result = await this.pool.query<TicketRow>(`${TICKET_SELECT} WHERE t.user_id = $1 ORDER BY t.updated_at DESC LIMIT 50`, [userId]);
    return (await this.withMessages(result.rows)).map(withoutUser);
  }

  async getForUser(userId: string, ticketId: string): Promise<SupportTicket> {
    const result = await this.pool.query<TicketRow>(`${TICKET_SELECT} WHERE t.id = $1 AND t.user_id = $2`, [ticketId, userId]);
    const [ticket] = await this.withMessages(result.rows);
    if (!ticket) throw new NotFoundException('Conversation not found.');
    return withoutUser(ticket);
  }

  /** A user message (re)opens the conversation for the team. */
  async userReply(userId: string, ticketId: string, body: string): Promise<SupportTicket> {
    const updated = await this.pool.query(`UPDATE support_tickets SET status = 'OPEN', updated_at = now() WHERE id = $1 AND user_id = $2`, [ticketId, userId]);
    if (updated.rowCount !== 1) throw new NotFoundException('Conversation not found.');
    await this.pool.query(`INSERT INTO support_messages (ticket_id, author, author_user_id, body) VALUES ($1, 'USER', $2, $3)`, [ticketId, userId, body]);
    return this.getForUser(userId, ticketId);
  }

  // ---------------------------------------------------------------- platform team
  async listForAdmin(status?: SupportStatus): Promise<AdminSupportTicket[]> {
    const result = await this.pool.query<TicketRow>(
      `${TICKET_SELECT} WHERE ($1::text IS NULL OR t.status = $1)
        ORDER BY CASE t.status WHEN 'OPEN' THEN 0 WHEN 'ANSWERED' THEN 1 ELSE 2 END, t.updated_at ASC LIMIT 200`,
      [status ?? null],
    );
    return this.withMessages(result.rows);
  }

  /** Team answer: stored, then the user is notified in the app and by email. */
  async teamReply(adminId: string, ticketId: string, body: string): Promise<void> {
    const ticket = await this.pool.query<{ user_id: string; subject: string; email: string; language: string }>(
      `UPDATE support_tickets t SET status = 'ANSWERED', updated_at = now() FROM users u
        WHERE t.id = $1 AND u.id = t.user_id RETURNING t.user_id, t.subject, u.email, u.language`,
      [ticketId],
    );
    const row = ticket.rows[0];
    if (!row) throw new NotFoundException('Conversation not found.');
    await this.pool.query(`INSERT INTO support_messages (ticket_id, author, author_user_id, body) VALUES ($1, 'TEAM', $2, $3)`, [ticketId, adminId, body]);
    await recordAudit(this.pool, adminId, 'SUPPORT_REPLIED', 'support_ticket', ticketId);
    await this.notifications.safely(() =>
      this.notifications.notifyUser(row.user_id, {
        type: 'SUPPORT_REPLY',
        title: { it: 'Risposta dall’assistenza', en: 'Reply from support' },
        body: { it: `“${row.subject}”: apri l’app per leggerla.`, en: `“${row.subject}”: open the app to read it.` },
        data: { ticketId },
      }),
    );
    const italian = row.language !== 'en';
    await this.notifications.safely(() =>
      this.mailer.send({
        to: row.email,
        subject: italian ? `Flower Man – risposta: ${row.subject}` : `Flower Man – reply: ${row.subject}`,
        text: `${body}\n\n— ${italian ? 'Assistenza Flower Man (rispondi dall’app, sezione Assistenza)' : 'Flower Man support (reply in the app, Help & support)'}`,
      }),
    );
  }

  async close(adminId: string, ticketId: string): Promise<void> {
    const updated = await this.pool.query(`UPDATE support_tickets SET status = 'CLOSED', updated_at = now() WHERE id = $1`, [ticketId]);
    if (updated.rowCount !== 1) throw new NotFoundException('Conversation not found.');
    await recordAudit(this.pool, adminId, 'SUPPORT_CLOSED', 'support_ticket', ticketId);
  }

  private async withMessages(rows: TicketRow[]): Promise<AdminSupportTicket[]> {
    if (rows.length === 0) return [];
    const messages = await this.pool.query<{ ticket_id: string; author: 'USER' | 'TEAM'; body: string; created_at: Date }>(
      'SELECT ticket_id, author, body, created_at FROM support_messages WHERE ticket_id = ANY($1::uuid[]) ORDER BY id',
      [rows.map((row) => row.id)],
    );
    return rows.map((row) => ({
      id: row.id,
      subject: row.subject,
      status: row.status,
      orderNumber: row.order_number === null ? null : Number(row.order_number),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      messages: messages.rows.filter((m) => m.ticket_id === row.id).map((m) => ({ author: m.author, body: m.body, createdAt: m.created_at.toISOString() })),
      userEmail: row.user_email,
      userName: row.user_name,
    }));
  }
}
