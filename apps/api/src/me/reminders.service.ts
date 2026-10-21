import { type CreateReminderRequest, MAX_REMINDERS, type OccasionReminder } from '@flower-man/contracts';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';

import { PG_POOL } from '../database/database.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';

const TODAY = `(now() AT TIME ZONE 'Europe/Rome')::date`;

/** Customers' occasion reminders (ADR-028): a notification `days_before` the date, once per occurrence. */
@Injectable()
export class RemindersService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly notifications: NotificationsService,
  ) {}

  async list(customerId: string): Promise<OccasionReminder[]> {
    const result = await this.pool.query<{ id: string; label: string; month: number; day: number; days_before: number; next_date: string }>(
      `SELECT id, label, month, day, days_before, to_char(occasion_next_date(month, day, ${TODAY}), 'YYYY-MM-DD') AS next_date
         FROM occasion_reminders WHERE customer_id = $1 ORDER BY occasion_next_date(month, day, ${TODAY})`,
      [customerId],
    );
    return result.rows.map((row) => ({ id: row.id, label: row.label, month: row.month, day: row.day, daysBefore: row.days_before, nextDate: row.next_date }));
  }

  async create(customerId: string, input: CreateReminderRequest): Promise<OccasionReminder[]> {
    const inserted = await this.pool.query(
      `INSERT INTO occasion_reminders (customer_id, label, month, day, days_before)
       SELECT $1, $2, $3, $4, $5 WHERE (SELECT count(*) FROM occasion_reminders WHERE customer_id = $1) < $6`,
      [customerId, input.label, input.month, input.day, input.daysBefore ?? 3, MAX_REMINDERS],
    );
    if (inserted.rowCount !== 1) {
      throw new ConflictException(`You can save up to ${MAX_REMINDERS} occasions.`);
    }
    return this.list(customerId);
  }

  async remove(customerId: string, reminderId: string): Promise<void> {
    const deleted = await this.pool.query('DELETE FROM occasion_reminders WHERE id = $1 AND customer_id = $2', [reminderId, customerId]);
    if (deleted.rowCount !== 1) {
      throw new NotFoundException('Reminder not found.');
    }
  }

  /** Called by the maintenance job: claims due reminders (so several API instances never send twice) and notifies. */
  async sendDue(): Promise<number> {
    const due = await this.pool.query<{ customer_id: string; label: string; next_date: Date; days_left: number }>(
      `UPDATE occasion_reminders r SET last_sent_for = n.next_date
         FROM (SELECT id, occasion_next_date(month, day, ${TODAY}) AS next_date FROM occasion_reminders) n
        WHERE r.id = n.id
          AND ${TODAY} >= n.next_date - r.days_before
          AND r.last_sent_for IS DISTINCT FROM n.next_date
        RETURNING r.customer_id, r.label, n.next_date, (n.next_date - ${TODAY}) AS days_left`,
    );
    for (const row of due.rows) {
      const when = row.days_left === 0 ? { it: 'oggi', en: 'today' } : row.days_left === 1 ? { it: 'domani', en: 'tomorrow' } : { it: `tra ${row.days_left} giorni`, en: `in ${row.days_left} days` };
      await this.notifications.safely(() =>
        this.notifications.notifyUser(row.customer_id, {
          type: 'OCCASION_REMINDER',
          title: { it: `${row.label}: ${when.it}`, en: `${row.label}: ${when.en}` },
          body: { it: 'Ordina ora i fiori, li consegniamo noi. 💐', en: 'Order the flowers now and we will deliver them. 💐' },
        }),
      );
    }
    return due.rows.length;
  }
}
