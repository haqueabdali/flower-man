/**
 * @flower-man/security
 *
 * Shared security primitives. Never put secrets or environment values here.
 */

export const REDACTED = '[REDACTED]';

const SENSITIVE_KEY_FRAGMENTS = [
  'pass', // password, passwd, passphrase
  'pwd',
  'secret',
  'token',
  'apikey',
  'auth', // authorization, auth header
  'credential',
  'cookie',
  'session',
  'jwt',
  'privatekey',
  'cardnumber',
  'cvc',
  'cvv',
  'securitycode',
  'iban',
  'connectionstring',
  'databaseurl',
] as const;

/**
 * True when a field name looks like it holds a credential or payment secret
 * and must never be logged. Over-matching is intentional: redacting too much
 * is safe, leaking a secret is not.
 */
export function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}
