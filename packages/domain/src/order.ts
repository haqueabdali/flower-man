import { type Actor, assertTransition, findTransition, type Transition } from './state-machine.js';

export const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PAID',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'COURIER_ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const t = (from: OrderStatus, to: OrderStatus, ...actors: Actor[]): Transition<OrderStatus> => ({ from, to, actors });

/** Every allowed order transition and who may request it. Anything else is rejected. */
export const ORDER_TRANSITIONS: readonly Transition<OrderStatus>[] = [
  t('PENDING_PAYMENT', 'PAID', 'SYSTEM'),
  t('PENDING_PAYMENT', 'CANCELLED', 'CUSTOMER', 'SYSTEM', 'ADMIN'),
  t('PAID', 'CONFIRMED', 'SELLER'),
  t('PAID', 'CANCELLED', 'CUSTOMER', 'SELLER', 'ADMIN'),
  t('CONFIRMED', 'PREPARING', 'SELLER'),
  t('CONFIRMED', 'CANCELLED', 'SELLER', 'ADMIN'),
  t('PREPARING', 'READY_FOR_PICKUP', 'SELLER'),
  t('PREPARING', 'CANCELLED', 'ADMIN'),
  t('READY_FOR_PICKUP', 'COURIER_ASSIGNED', 'SYSTEM'),
  t('READY_FOR_PICKUP', 'CANCELLED', 'ADMIN'),
  t('COURIER_ASSIGNED', 'READY_FOR_PICKUP', 'SYSTEM'),
  t('COURIER_ASSIGNED', 'PICKED_UP', 'SYSTEM'),
  t('COURIER_ASSIGNED', 'CANCELLED', 'ADMIN'),
  t('PICKED_UP', 'IN_TRANSIT', 'SYSTEM'),
  t('IN_TRANSIT', 'DELIVERED', 'SYSTEM'),
  t('DELIVERED', 'REFUNDED', 'ADMIN'),
  t('CANCELLED', 'REFUNDED', 'SYSTEM', 'ADMIN'),
];

export function canTransitionOrder(from: OrderStatus, to: OrderStatus, actor: Actor): boolean {
  return findTransition(ORDER_TRANSITIONS, from, to, actor) !== undefined;
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus, actor: Actor): void {
  assertTransition('Order', ORDER_TRANSITIONS, from, to, actor);
}

/** Statuses in which the customer has paid (money must be refunded if the order is cancelled). */
export const PAID_ORDER_STATUSES: readonly OrderStatus[] = [
  'PAID',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'COURIER_ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
];

export interface OrderAmounts {
  readonly subtotal: number;
  readonly deliveryFee: number;
  readonly total: number;
  readonly platformCommission: number;
  /** What the seller earns: subtotal minus commission. */
  readonly sellerNet: number;
}
