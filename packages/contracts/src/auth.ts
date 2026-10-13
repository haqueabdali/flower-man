import { z } from 'zod';

/** Explicit capabilities (section 5). A user may hold several. Enforced by the API, never only by UI. */
export const CAPABILITIES = [
  'CUSTOMER',
  'SHOP_OWNER',
  'SHOP_STAFF',
  'FREELANCE_SELLER',
  'COURIER',
  'PLATFORM_OWNER',
  'PLATFORM_ADMIN',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

const email = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email({ message: 'Enter a valid email address.' }));

const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` })
  .max(PASSWORD_MAX_LENGTH, { message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters.` });

/** POST /api/v1/auth/register (customer self-registration). */
export const registerRequestSchema = z.strictObject({
  email,
  password,
  fullName: z.string().trim().min(2, { message: 'Enter your full name.' }).max(120),
  /** E.164, e.g. +393331234567. */
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{6,14}$/, { message: 'Enter the phone number in international format, e.g. +393331234567.' })
    .optional(),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/** POST /api/v1/auth/login */
export const loginRequestSchema = z.strictObject({
  email,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** POST /api/v1/auth/refresh */
export const refreshRequestSchema = z.strictObject({
  refreshToken: z.string().min(20).max(200),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly phone: string | null;
  readonly emailVerified: boolean;
  readonly capabilities: readonly Capability[];
}

/** Returned by register, login and refresh. Send the access token as `Authorization: Bearer <token>`. */
export interface AuthTokensResponse {
  readonly accessToken: string;
  /** ISO-8601 UTC. */
  readonly accessTokenExpiresAt: string;
  /** Single use: every refresh returns a new one. Store it securely (expo-secure-store). */
  readonly refreshToken: string;
  /** ISO-8601 UTC. The session ends at this time at the latest. */
  readonly refreshTokenExpiresAt: string;
  readonly user: AuthUser;
}

/** GET /api/v1/auth/me */
export interface MeResponse {
  readonly user: AuthUser;
}
