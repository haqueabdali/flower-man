import { type Actor, assertTransition, type Transition } from './state-machine.js';

export const DELIVERY_STATUSES = ['OFFERED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

const t = (from: DeliveryStatus, to: DeliveryStatus, ...actors: Actor[]): Transition<DeliveryStatus> => ({ from, to, actors });

export const DELIVERY_TRANSITIONS: readonly Transition<DeliveryStatus>[] = [
  t('OFFERED', 'ASSIGNED', 'COURIER'),
  t('OFFERED', 'CANCELLED', 'ADMIN', 'SYSTEM'),
  t('ASSIGNED', 'OFFERED', 'COURIER', 'ADMIN'),
  t('ASSIGNED', 'PICKED_UP', 'COURIER'),
  t('ASSIGNED', 'CANCELLED', 'ADMIN', 'SYSTEM'),
  t('PICKED_UP', 'IN_TRANSIT', 'COURIER'),
  t('IN_TRANSIT', 'DELIVERED', 'COURIER'),
];

export function assertDeliveryTransition(from: DeliveryStatus, to: DeliveryStatus, actor: Actor): void {
  assertTransition('Delivery', DELIVERY_TRANSITIONS, from, to, actor);
}

/** GPS is accepted only while the courier is actively working the delivery. */
export const TRACKABLE_DELIVERY_STATUSES: readonly DeliveryStatus[] = ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'];
