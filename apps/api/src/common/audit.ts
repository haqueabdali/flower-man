import type pg from 'pg';

/** Appends an administrative action to audit_log (append-only). Never put secrets in details. */
export async function recordAudit(
  db: pg.ClientBase | pg.Pool,
  actorUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  await db.query(
    'INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
    [actorUserId, action, entityType, entityId, JSON.stringify(details)],
  );
}
