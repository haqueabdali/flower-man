import type { DeliveryStatus, OrderStatus, PartnerKind, SettlementStatus, VerificationStatus } from '@flower-man/domain';
import { z } from 'zod';

import type { Capability } from './auth.js';

export type { DeliveryStatus, OrderStatus, PartnerKind, SettlementStatus, VerificationStatus } from '@flower-man/domain';

const uuid = z.uuid();
const phone = z.string().trim().regex(/^\+[1-9]\d{6,14}$/, { message: 'Use international format, e.g. +393331234567.' });
const money = z.number().int().positive().max(10_000_000);
const isoDate = z.iso.datetime({ offset: true });

export const geoPointSchema = z.strictObject({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export type GeoPoint = z.infer<typeof geoPointSchema>;

// ---------------------------------------------------------------- service zones
export interface ServiceZone {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly city: string;
  readonly province: string;
  readonly active: boolean;
  readonly deliveryFeeMinor: number;
}

export interface ZoneCheckResponse {
  readonly served: boolean;
  readonly zone: ServiceZone | null;
}

/** GeoJSON Polygon or MultiPolygon (WGS84 lon/lat). */
const geoJsonArea = z.object({
  type: z.enum(['Polygon', 'MultiPolygon']),
  coordinates: z.array(z.any()).min(1),
});

export const createZoneSchema = z.strictObject({
  code: z.string().regex(/^[A-Z]{2}-[A-Z0-9-]{2,40}$/),
  name: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  province: z.string().regex(/^[A-Z]{2}$/),
  deliveryFeeMinor: z.number().int().min(0).max(100_000),
  area: geoJsonArea,
  active: z.boolean().default(true),
});
export type CreateZoneRequest = z.infer<typeof createZoneSchema>;

export const updateZoneSchema = z.strictObject({
  name: z.string().trim().min(2).max(80).optional(),
  deliveryFeeMinor: z.number().int().min(0).max(100_000).optional(),
  active: z.boolean().optional(),
  area: geoJsonArea.optional(),
});
export type UpdateZoneRequest = z.infer<typeof updateZoneSchema>;

// ---------------------------------------------------------------- partners
export const PARTNER_KIND_VALUES = ['SHOP', 'FREELANCE_SELLER', 'COURIER'] as const;

export const partnerApplicationSchema = z.strictObject({
  kind: z.enum(PARTNER_KIND_VALUES),
  displayName: z.string().trim().min(2).max(120),
  legalName: z.string().trim().min(2).max(200).optional(),
  vatNumber: z.string().trim().regex(/^[A-Z]{2}[0-9A-Z]{8,12}$/).optional(),
  phone,
  address: z.string().trim().min(5).max(300).optional(),
  location: geoPointSchema.optional(),
  description: z.string().trim().max(2000).optional(),
  operatingHours: z.record(z.string(), z.string().max(40)).optional(),
});
export type PartnerApplicationRequest = z.infer<typeof partnerApplicationSchema>;

export const updatePartnerSchema = partnerApplicationSchema.omit({ kind: true }).partial();
export type UpdatePartnerRequest = z.infer<typeof updatePartnerSchema>;

/** Average of the visible reviews (one decimal) and how many there are. */
export interface Rating {
  readonly average: number;
  readonly count: number;
}

export interface PartnerAccount {
  readonly id: string;
  readonly kind: PartnerKind;
  readonly displayName: string;
  readonly legalName: string | null;
  readonly vatNumber: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly location: GeoPoint | null;
  readonly serviceZoneId: string | null;
  readonly description: string | null;
  readonly verificationStatus: VerificationStatus;
  readonly verificationNotes: string | null;
  readonly courierAvailable: boolean;
  readonly role: 'OWNER' | 'STAFF';
  readonly rating: Rating | null;
}

export const reviewPartnerSchema = z.strictObject({
  status: z.enum(['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED']),
  notes: z.string().trim().max(2000).optional(),
});
export type ReviewPartnerRequest = z.infer<typeof reviewPartnerSchema>;

export const addStaffSchema = z.strictObject({ email: z.email() });

export const courierAvailabilitySchema = z.strictObject({ available: z.boolean() });

// ---------------------------------------------------------------- catalogue
export const PRODUCT_CATEGORIES = ['BOUQUET', 'ROSES', 'PLANTS', 'ARRANGEMENT', 'WEDDING', 'FUNERAL', 'GIFT', 'OTHER'] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const productSchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
  category: z.enum(PRODUCT_CATEGORIES),
  priceMinor: money,
  available: z.boolean().default(true),
  stock: z.number().int().min(0).max(100_000).nullable().optional(),
  imageUrl: z.url({ protocol: /^https$/ }).optional(),
});
export type ProductRequest = z.infer<typeof productSchema>;
export const updateProductSchema = productSchema.partial();
export type UpdateProductRequest = z.infer<typeof updateProductSchema>;

export interface Product {
  readonly id: string;
  readonly sellerId: string;
  readonly sellerName: string;
  readonly sellerKind: PartnerKind;
  readonly name: string;
  readonly description: string | null;
  readonly category: ProductCategory;
  readonly priceMinor: number;
  readonly currency: 'EUR';
  readonly available: boolean;
  readonly stock: number | null;
  readonly imageUrl: string | null;
  /** Uploaded photo, relative to the API base URL (`${client.baseUrl}/${imagePath}`); changes when the photo changes. */
  readonly imagePath: string | null;
  readonly sellerRating: Rating | null;
  readonly distanceMeters?: number;
}

export interface NearbySeller {
  readonly id: string;
  readonly kind: PartnerKind;
  readonly displayName: string;
  readonly description: string | null;
  readonly distanceMeters: number;
  readonly productCount: number;
  readonly rating: Rating | null;
}

// ---------------------------------------------------------------- cart & checkout
export const cartItemSchema = z.strictObject({ productId: uuid, quantity: z.number().int().min(1).max(20) });
export type CartItemRequest = z.infer<typeof cartItemSchema>;

export interface Cart {
  readonly sellerId: string | null;
  readonly items: readonly {
    readonly productId: string;
    readonly name: string;
    readonly quantity: number;
    readonly unitPriceMinor: number;
    readonly lineTotalMinor: number;
    readonly available: boolean;
  }[];
  readonly subtotalMinor: number;
}

/** "Order again": the cart now holds what is still available from a past order, at today's prices. */
export interface ReorderResponse {
  readonly cart: Cart;
  /** Names of items that could not be added (no longer sold, or not enough stock). */
  readonly unavailable: readonly string[];
}

const recipientAndDelivery = {
  recipientName: z.string().trim().min(2).max(120),
  recipientPhone: phone,
  deliveryAddress: z.string().trim().min(5).max(300),
  deliveryLocation: geoPointSchema,
  deliveryNotes: z.string().trim().max(500).optional(),
  giftMessage: z.string().trim().max(500).optional(),
};

export const checkoutSchema = z.strictObject({
  ...recipientAndDelivery,
  requestedDeliveryAt: isoDate.optional(),
  /** Optional: if given, checkout fails with 409 when the server total differs (the client shows the new total). */
  expectedTotalMinor: z.number().int().positive().optional(),
});
export type CheckoutRequest = z.infer<typeof checkoutSchema>;

export interface PaymentInstructions {
  readonly provider: 'SIMULATED' | 'STRIPE';
  readonly reference: string;
  /** Stripe PaymentIntent client secret (for the mobile Payment Sheet). Null for simulated payments. */
  readonly clientSecret: string | null;
  readonly amountMinor: number;
  readonly currency: 'EUR';
}

export interface CheckoutResponse {
  readonly order: OrderSummary;
  readonly payment: PaymentInstructions;
}

// ---------------------------------------------------------------- orders
export interface OrderSummary {
  readonly id: string;
  readonly orderNumber: number;
  readonly status: OrderStatus;
  readonly source: 'CATALOG' | 'CUSTOM_REQUEST';
  readonly sellerId: string;
  readonly sellerName: string;
  readonly subtotalMinor: number;
  readonly deliveryFeeMinor: number;
  readonly totalMinor: number;
  readonly currency: 'EUR';
  readonly recipientName: string;
  readonly deliveryAddress: string;
  readonly requestedDeliveryAt: string | null;
  readonly createdAt: string;
}

export interface OrderDetail extends OrderSummary {
  readonly recipientPhone: string;
  readonly deliveryNotes: string | null;
  readonly giftMessage: string | null;
  readonly items: readonly { readonly name: string; readonly quantity: number; readonly unitPriceMinor: number; readonly lineTotalMinor: number }[];
  readonly history: readonly { readonly from: OrderStatus | null; readonly to: OrderStatus; readonly actor: string; readonly at: string; readonly reason: string | null }[];
  readonly delivery: DeliveryTracking | null;
  readonly paymentStatus: string | null;
  readonly review: OrderReview | null;
  /** Delivered less than REVIEW_WINDOW_DAYS ago and not reviewed yet. */
  readonly canReview: boolean;
}

export const REVIEW_WINDOW_DAYS = 30;

export const reviewOrderSchema = z.strictObject({
  sellerRating: z.number().int().min(1).max(5),
  courierRating: z.number().int().min(1).max(5).optional(),
  comment: z.string().trim().min(1).max(1000).optional(),
});
export type ReviewOrderRequest = z.infer<typeof reviewOrderSchema>;

export interface OrderReview {
  readonly sellerRating: number;
  readonly courierRating: number | null;
  readonly comment: string | null;
  readonly createdAt: string;
}

/** Public review: no customer data. */
export interface PublicReview {
  readonly rating: number;
  readonly comment: string | null;
  readonly createdAt: string;
}

export interface AdminReview extends OrderReview {
  readonly orderId: string;
  readonly orderNumber: number;
  readonly sellerName: string;
  readonly courierName: string | null;
  readonly customerEmail: string;
  readonly hiddenAt: string | null;
}

export interface DeliveryTracking {
  readonly id: string;
  readonly status: DeliveryStatus;
  readonly courierName: string | null;
  readonly lastLocation: GeoPoint | null;
  readonly lastLocationAt: string | null;
  readonly etaAt: string | null;
  readonly arrivedAt: string | null;
  readonly deliveredAt: string | null;
}

export const cancelOrderSchema = z.strictObject({ reason: z.string().trim().min(3).max(500) });
export const sellerRejectSchema = cancelOrderSchema;

// ---------------------------------------------------------------- custom requests
export const createCustomRequestSchema = z
  .strictObject({
    occasion: z.string().trim().min(2).max(80),
    flowerPreferences: z.string().trim().max(500).optional(),
    colourPreferences: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(1000).optional(),
    budgetMinor: money,
    deliveryWindowStart: isoDate,
    deliveryWindowEnd: isoDate,
    ...recipientAndDelivery,
  })
  .refine((value) => Date.parse(value.deliveryWindowEnd) > Date.parse(value.deliveryWindowStart), {
    message: 'deliveryWindowEnd must be after deliveryWindowStart',
    path: ['deliveryWindowEnd'],
  });
export type CreateCustomRequest = z.infer<typeof createCustomRequestSchema>;

export const customOfferSchema = z.strictObject({
  description: z.string().trim().min(5).max(2000),
  priceMinor: money,
  preparationMinutes: z.number().int().min(10).max(4320),
  availableFrom: isoDate,
  notes: z.string().trim().max(1000).optional(),
});
export type CustomOfferRequest = z.infer<typeof customOfferSchema>;

export interface CustomOffer {
  readonly id: string;
  readonly sellerId: string;
  readonly sellerName: string;
  readonly sellerKind: PartnerKind;
  readonly description: string;
  readonly priceMinor: number;
  readonly preparationMinutes: number;
  readonly availableFrom: string;
  readonly notes: string | null;
  readonly status: 'SUBMITTED' | 'WITHDRAWN' | 'ACCEPTED' | 'REJECTED';
}

export interface CustomRequestView {
  readonly id: string;
  readonly occasion: string;
  readonly flowerPreferences: string | null;
  readonly colourPreferences: string | null;
  readonly notes: string | null;
  readonly budgetMinor: number;
  readonly deliveryWindowStart: string;
  readonly deliveryWindowEnd: string;
  readonly deliveryAddress: string;
  readonly status: 'OPEN' | 'OFFER_SELECTED' | 'CANCELLED' | 'EXPIRED';
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly offers: readonly CustomOffer[];
}

// ---------------------------------------------------------------- courier
export const locationUpdateSchema = z.strictObject({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().min(0).max(10_000).optional(),
  recordedAt: isoDate,
});
export type LocationUpdate = z.infer<typeof locationUpdateSchema>;

export const locationBatchSchema = z.strictObject({ points: z.array(locationUpdateSchema).min(1).max(100) });
export type LocationBatch = z.infer<typeof locationBatchSchema>;

export interface CourierJob {
  readonly deliveryId: string;
  readonly orderNumber: number;
  readonly status: DeliveryStatus;
  readonly feeMinor: number;
  readonly pickupName: string;
  readonly pickupAddress: string | null;
  readonly pickupLocation: GeoPoint | null;
  readonly dropoffAddress: string;
  readonly dropoffLocation: GeoPoint;
  readonly recipientName: string;
  /** Only once the courier holds the job. */
  readonly recipientPhone: string | null;
  readonly distanceMeters: number | null;
  /** Delivery slot start chosen by the customer; null = as soon as possible. */
  readonly requestedDeliveryAt: string | null;
}

// ---------------------------------------------------------------- notifications
export const LANGUAGES = ['it', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];
/** The apps report the device language; notifications are written in it. */
export const preferencesSchema = z.strictObject({ language: z.enum(LANGUAGES) });
export type PreferencesRequest = z.infer<typeof preferencesSchema>;

export const pushTokenSchema = z.strictObject({
  token: z.string().regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/, { message: 'Expected an Expo push token.' }),
  platform: z.enum(['ios', 'android']),
  app: z.enum(['customer', 'partner']),
});
export type PushTokenRequest = z.infer<typeof pushTokenSchema>;

export interface NotificationItem {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly body: string;
  readonly data: Record<string, string>;
  readonly createdAt: string;
  readonly readAt: string | null;
}

// ---------------------------------------------------------------- earnings & settlements
export interface PartnerBalance {
  readonly partnerId: string;
  readonly displayName: string;
  readonly kind: PartnerKind;
  readonly unsettledMinor: number;
  readonly unsettledEntries: number;
}

export interface LedgerEntryView {
  readonly id: number;
  readonly type: string;
  readonly amountMinor: number;
  readonly description: string;
  readonly orderId: string | null;
  readonly settlementId: string | null;
  readonly createdAt: string;
}

export const createSettlementSchema = z.strictObject({ partnerId: uuid });
export const settlementTransitionSchema = z.strictObject({
  status: z.enum(['PROCESSING', 'PAID', 'FAILED']),
  externalReference: z.string().trim().min(3).max(120).optional(),
  note: z.string().trim().max(500).optional(),
});
export type SettlementTransitionRequest = z.infer<typeof settlementTransitionSchema>;

export interface SettlementView {
  readonly id: string;
  readonly partnerId: string;
  readonly partnerName: string;
  readonly status: SettlementStatus;
  readonly totalMinor: number;
  readonly entryCount: number;
  readonly externalReference: string | null;
  readonly failureReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ---------------------------------------------------------------- admin
export interface AdminUser {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  readonly emailVerified: boolean;
  readonly capabilities: readonly Capability[];
  readonly createdAt: string;
}

export const userStatusSchema = z.strictObject({ status: z.enum(['ACTIVE', 'SUSPENDED']), reason: z.string().trim().min(3).max(500) });
export const capabilityChangeSchema = z.strictObject({
  capability: z.enum(['CUSTOMER', 'SHOP_OWNER', 'SHOP_STAFF', 'FREELANCE_SELLER', 'COURIER', 'PLATFORM_OWNER', 'PLATFORM_ADMIN']),
});
export const refundSchema = z.strictObject({
  amountMinor: z.number().int().positive().optional(),
  reason: z.string().trim().min(3).max(500),
});
export type RefundRequest = z.infer<typeof refundSchema>;

export const deletionRequestSchema = z.strictObject({ reason: z.string().trim().max(1000).optional() });

export interface MarketplaceHealth {
  readonly users: number;
  readonly approvedSellers: number;
  readonly approvedCouriers: number;
  readonly availableCouriers: number;
  readonly pendingPartnerReviews: number;
  readonly openCustomRequests: number;
  readonly ordersByStatus: Readonly<Record<string, number>>;
  readonly offeredDeliveries: number;
  readonly unsettledMinor: number;
}

export const ANALYTICS_PERIODS = [7, 30, 90] as const;

/** Sales overview for the admin dashboard. Days are calendar days in Europe/Rome. */
export interface MarketplaceAnalytics {
  readonly days: number;
  /** Paid orders whose payment fell in the period, excluding cancelled and refunded ones. */
  readonly orders: number;
  readonly revenueMinor: number;
  readonly averageOrderMinor: number;
  readonly commissionMinor: number;
  readonly deliveredOrders: number;
  readonly cancelledOrders: number;
  /** Payment → delivery, for orders delivered in the period. */
  readonly averageDeliveryMinutes: number | null;
  readonly averageRating: number | null;
  readonly reviews: number;
  readonly newCustomers: number;
  readonly daily: readonly { readonly date: string; readonly orders: number; readonly revenueMinor: number }[];
  readonly topSellers: readonly { readonly sellerId: string; readonly name: string; readonly orders: number; readonly revenueMinor: number; readonly rating: Rating | null }[];
}

export interface Page<T> {
  readonly items: readonly T[];
}
