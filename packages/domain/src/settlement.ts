import { assertTransition, type Transition } from './state-machine.js';

export const SETTLEMENT_STATUSES = ['CREATED', 'PROCESSING', 'PAID', 'FAILED'] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export const SETTLEMENT_TRANSITIONS: readonly Transition<SettlementStatus>[] = [
  { from: 'CREATED', to: 'PROCESSING', actors: ['ADMIN'] },
  { from: 'CREATED', to: 'FAILED', actors: ['ADMIN'] },
  { from: 'PROCESSING', to: 'PAID', actors: ['ADMIN'] },
  { from: 'PROCESSING', to: 'FAILED', actors: ['ADMIN'] },
];

export function assertSettlementTransition(from: SettlementStatus, to: SettlementStatus): void {
  assertTransition('Settlement', SETTLEMENT_TRANSITIONS, from, to, 'ADMIN');
}

export const LEDGER_ENTRY_TYPES = [
  'ORDER_REVENUE',
  'DELIVERY_FEE',
  'PLATFORM_COMMISSION',
  'REFUND_ADJUSTMENT',
  'PAYOUT_ADJUSTMENT',
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];
