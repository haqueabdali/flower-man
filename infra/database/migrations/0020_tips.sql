-- Optional tip for the courier at checkout (ADR-026). The whole tip goes to the courier who delivers the order.
ALTER TABLE orders ADD COLUMN tip_minor integer NOT NULL DEFAULT 0 CHECK (tip_minor BETWEEN 0 AND 5000);
ALTER TABLE orders DROP CONSTRAINT orders_total_check;
ALTER TABLE orders ADD CONSTRAINT orders_total_check
  CHECK (total_minor = subtotal_minor + delivery_fee_minor - discount_minor + tip_minor AND total_minor > 0);

ALTER TABLE ledger_entries DROP CONSTRAINT ledger_entries_type_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_type_check
  CHECK (type IN ('ORDER_REVENUE', 'DELIVERY_FEE', 'COURIER_TIP', 'PLATFORM_COMMISSION', 'REFUND_ADJUSTMENT', 'PAYOUT_ADJUSTMENT'));
DROP INDEX ledger_entries_earning_once;
CREATE UNIQUE INDEX ledger_entries_earning_once ON ledger_entries (partner_id, type, order_id, delivery_id) NULLS NOT DISTINCT
  WHERE type IN ('ORDER_REVENUE', 'DELIVERY_FEE', 'COURIER_TIP', 'PLATFORM_COMMISSION');
