import { assertTransition, type Transition } from './state-machine.js';

export const PARTNER_KINDS = ['SHOP', 'FREELANCE_SELLER', 'COURIER'] as const;
export type PartnerKind = (typeof PARTNER_KINDS)[number];

export const VERIFICATION_STATUSES = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

const t = (from: VerificationStatus, to: VerificationStatus, partnerSide: boolean): Transition<VerificationStatus> => ({
  from,
  to,
  actors: partnerSide ? ['SELLER', 'COURIER'] : ['ADMIN'],
});

export const VERIFICATION_TRANSITIONS: readonly Transition<VerificationStatus>[] = [
  t('DRAFT', 'SUBMITTED', true),
  t('REJECTED', 'SUBMITTED', true),
  t('SUBMITTED', 'UNDER_REVIEW', false),
  t('SUBMITTED', 'APPROVED', false),
  t('SUBMITTED', 'REJECTED', false),
  t('UNDER_REVIEW', 'APPROVED', false),
  t('UNDER_REVIEW', 'REJECTED', false),
  t('APPROVED', 'SUSPENDED', false),
  t('SUSPENDED', 'APPROVED', false),
];

export function assertVerificationTransition(from: VerificationStatus, to: VerificationStatus, byPartner: boolean): void {
  assertTransition('Partner verification', VERIFICATION_TRANSITIONS, from, to, byPartner ? 'SELLER' : 'ADMIN');
}

/** The capability granted when a partner account of this kind is approved. */
export const CAPABILITY_FOR_PARTNER_KIND = {
  SHOP: 'SHOP_OWNER',
  FREELANCE_SELLER: 'FREELANCE_SELLER',
  COURIER: 'COURIER',
} as const satisfies Record<PartnerKind, string>;

export const SELLER_KINDS: readonly PartnerKind[] = ['SHOP', 'FREELANCE_SELLER'];
