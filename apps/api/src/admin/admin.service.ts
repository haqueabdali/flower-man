import type { AdminUser, Capability, MarketplaceHealth } from '@flower-man/contracts';
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';

import type { AuthenticatedContext } from '../auth/auth.guard.js';
import { recordAudit } from '../common/audit.js';
import { PG_POOL } from '../database/database.module.js';
import { withTransaction } from '../database/transaction.js';

const PLATFORM_ROLES: readonly Capability[] = ['PLATFORM_OWNER', 'PLATFORM_ADMIN'];

@Injectable()
export class AdminService {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async health(): Promise<MarketplaceHealth> {
    const counts = await this.pool.query<Record<string, string>>(`
      SELECT
        (SELECT count(*) FROM users WHERE status <> 'DELETED') AS users,
        (SELECT count(*) FROM partner_accounts WHERE kind IN ('SHOP', 'FREELANCE_SELLER') AND verification_status = 'APPROVED') AS sellers,
        (SELECT count(*) FROM partner_accounts WHERE kind = 'COURIER' AND verification_status = 'APPROVED') AS couriers,
        (SELECT count(*) FROM partner_accounts WHERE kind = 'COURIER' AND verification_status = 'APPROVED' AND courier_available) AS available_couriers,
        (SELECT count(*) FROM partner_accounts WHERE verification_status IN ('SUBMITTED', 'UNDER_REVIEW')) AS pending_reviews,
        (SELECT count(*) FROM custom_requests WHERE status = 'OPEN' AND expires_at > now()) AS open_requests,
        (SELECT count(*) FROM deliveries WHERE status = 'OFFERED') AS offered_deliveries,
        (SELECT COALESCE(sum(amount_minor), 0) FROM ledger_entries WHERE settlement_id IS NULL) AS unsettled`);
    const byStatus = await this.pool.query<{ status: string; count: string }>('SELECT status, count(*) FROM orders GROUP BY status');
    const row = counts.rows[0] ?? {};
    const n = (key: string) => Number(row[key] ?? 0);
    return {
      users: n('users'),
      approvedSellers: n('sellers'),
      approvedCouriers: n('couriers'),
      availableCouriers: n('available_couriers'),
      pendingPartnerReviews: n('pending_reviews'),
      openCustomRequests: n('open_requests'),
      ordersByStatus: Object.fromEntries(byStatus.rows.map((r) => [r.status, Number(r.count)])),
      offeredDeliveries: n('offered_deliveries'),
      unsettledMinor: n('unsettled'),
    };
  }

  async users(search?: string): Promise<AdminUser[]> {
    const result = await this.pool.query<{ id: string; email: string; full_name: string; status: AdminUser['status']; email_verified_at: Date | null; capabilities: Capability[]; created_at: Date }>(
      `SELECT u.id, u.email, u.full_name, u.status, u.email_verified_at, u.created_at,
              COALESCE((SELECT array_agg(c.capability ORDER BY c.capability) FROM user_capabilities c WHERE c.user_id = u.id), '{}') AS capabilities
         FROM users u
        WHERE $1::text IS NULL OR u.email_normalized LIKE '%' || lower($1) || '%' OR u.full_name ILIKE '%' || $1 || '%'
        ORDER BY u.created_at DESC LIMIT 200`,
      [search?.slice(0, 100) ?? null],
    );
    return result.rows.map((row) => ({
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      status: row.status,
      emailVerified: row.email_verified_at !== null,
      capabilities: row.capabilities,
      createdAt: row.created_at.toISOString(),
    }));
  }

  /** Suspending signs the user out everywhere. Platform owners cannot be suspended through the API. */
  async setUserStatus(admin: AuthenticatedContext, userId: string, status: 'ACTIVE' | 'SUSPENDED', reason: string): Promise<void> {
    if (userId === admin.userId) {
      throw new BadRequestException('You cannot change your own status.');
    }
    await withTransaction(this.pool, async (client) => {
      const target = await this.lockTarget(client, userId);
      if (target.capabilities.includes('PLATFORM_OWNER')) {
        throw new ForbiddenException('Platform owners cannot be suspended through the API.');
      }
      if (target.capabilities.includes('PLATFORM_ADMIN') && !admin.user.capabilities.includes('PLATFORM_OWNER')) {
        throw new ForbiddenException('Only the platform owner can change an administrator.');
      }
      await client.query(`UPDATE users SET status = $2, updated_at = now() WHERE id = $1 AND status <> 'DELETED'`, [userId, status]);
      if (status === 'SUSPENDED') {
        await client.query(`UPDATE auth_sessions SET revoked_at = now(), revoke_reason = 'ADMIN' WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
      }
      await recordAudit(client, admin.userId, `USER_${status}`, 'user', userId, { reason });
    });
  }

  /** Only a PLATFORM_OWNER may grant or remove platform roles. */
  async changeCapability(admin: AuthenticatedContext, userId: string, capability: Capability, grant: boolean): Promise<void> {
    if (PLATFORM_ROLES.includes(capability) && !admin.user.capabilities.includes('PLATFORM_OWNER')) {
      throw new ForbiddenException('Only the platform owner can change platform roles.');
    }
    if (!grant && userId === admin.userId && PLATFORM_ROLES.includes(capability)) {
      throw new BadRequestException('You cannot remove your own platform role.');
    }
    await withTransaction(this.pool, async (client) => {
      await this.lockTarget(client, userId);
      if (grant) {
        await client.query('INSERT INTO user_capabilities (user_id, capability, granted_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [userId, capability, admin.userId]);
      } else {
        await client.query('DELETE FROM user_capabilities WHERE user_id = $1 AND capability = $2', [userId, capability]);
      }
      await recordAudit(client, admin.userId, grant ? 'CAPABILITY_GRANTED' : 'CAPABILITY_REMOVED', 'user', userId, { capability });
    });
  }

  async payments(status?: string): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT p.id, p.order_id AS "orderId", o.order_number AS "orderNumber", p.provider, p.provider_ref AS "reference",
              p.amount_minor AS "amountMinor", p.refunded_minor AS "refundedMinor", p.status, p.failure_reason AS "failureReason",
              p.created_at AS "createdAt"
         FROM payments p JOIN orders o ON o.id = p.order_id
        WHERE $1::text IS NULL OR p.status = $1 ORDER BY p.created_at DESC LIMIT 300`,
      [status ?? null],
    );
    return result.rows;
  }

  async deliveries(status?: string): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT d.id, d.order_id AS "orderId", o.order_number AS "orderNumber", d.status, c.display_name AS "courierName",
              d.fee_minor AS "feeMinor", d.created_at AS "createdAt", d.assigned_at AS "assignedAt",
              d.delivered_at AS "deliveredAt", d.last_location_at AS "lastLocationAt", (d.proof_object_key IS NOT NULL) AS "hasProof"
         FROM deliveries d JOIN orders o ON o.id = d.order_id LEFT JOIN partner_accounts c ON c.id = d.courier_id
        WHERE $1::text IS NULL OR d.status = $1 ORDER BY d.created_at DESC LIMIT 300`,
      [status ?? null],
    );
    return result.rows;
  }

  async securityEvents(userId?: string): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT e.id, e.occurred_at AS "occurredAt", e.type, e.user_id AS "userId", u.email, host(e.ip) AS ip, e.user_agent AS "userAgent", e.details
         FROM security_events e LEFT JOIN users u ON u.id = e.user_id
        WHERE $1::uuid IS NULL OR e.user_id = $1 ORDER BY e.id DESC LIMIT 300`,
      [userId ?? null],
    );
    return result.rows;
  }

  async auditLog(entityType?: string): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT a.id, a.occurred_at AS "occurredAt", a.actor_user_id AS "actorUserId", u.email AS "actorEmail", a.action,
              a.entity_type AS "entityType", a.entity_id AS "entityId", a.details
         FROM audit_log a LEFT JOIN users u ON u.id = a.actor_user_id
        WHERE $1::text IS NULL OR a.entity_type = $1 ORDER BY a.id DESC LIMIT 300`,
      [entityType ?? null],
    );
    return result.rows;
  }

  async deletionRequests(): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT r.id, r.user_id AS "userId", u.email, r.requested_at AS "requestedAt", r.reason, r.status, r.processed_at AS "processedAt"
         FROM account_deletion_requests r JOIN users u ON u.id = r.user_id ORDER BY r.requested_at DESC LIMIT 300`,
    );
    return result.rows;
  }

  /**
   * Completes a deletion request: personal data is removed or anonymised, sessions and devices are dropped.
   * Orders, payments and the ledger are kept (legal bookkeeping), but no longer identify the person by name/email.
   */
  async completeDeletion(admin: AuthenticatedContext, requestId: string): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      const found = await client.query<{ user_id: string }>(
        `SELECT user_id FROM account_deletion_requests WHERE id = $1 AND status = 'PENDING' FOR UPDATE`,
        [requestId],
      );
      const userId = found.rows[0]?.user_id;
      if (!userId) {
        throw new NotFoundException('No pending deletion request with this id.');
      }
      const target = await this.lockTarget(client, userId);
      if (target.capabilities.some((capability) => PLATFORM_ROLES.includes(capability))) {
        throw new ForbiddenException('Remove platform roles before deleting this account.');
      }
      await client.query(
        `UPDATE users SET status = 'DELETED', email = 'deleted+' || id || '@invalid.flowerman',
           email_normalized = 'deleted+' || id || '@invalid.flowerman', full_name = 'Deleted user', phone = NULL, updated_at = now()
         WHERE id = $1`,
        [userId],
      );
      await client.query('DELETE FROM user_credentials WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM push_tokens WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM cart_items WHERE customer_id = $1', [userId]);
      await client.query(`UPDATE auth_sessions SET revoked_at = now(), revoke_reason = 'ADMIN' WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
      await client.query(`UPDATE account_deletion_requests SET status = 'COMPLETED', processed_at = now(), processed_by = $2 WHERE id = $1`, [requestId, admin.userId]);
      await recordAudit(client, admin.userId, 'ACCOUNT_DELETED', 'user', userId, { requestId });
    });
  }

  private async lockTarget(client: pg.PoolClient, userId: string): Promise<{ capabilities: Capability[] }> {
    const result = await client.query<{ capabilities: Capability[] }>(
      `SELECT COALESCE((SELECT array_agg(capability) FROM user_capabilities WHERE user_id = u.id), '{}') AS capabilities
         FROM users u WHERE u.id = $1 FOR UPDATE`,
      [userId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('User not found.');
    }
    return row;
  }
}
