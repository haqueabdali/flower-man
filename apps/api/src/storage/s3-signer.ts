import { createHash, createHmac } from 'node:crypto';

export interface S3Credentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly region: string;
}

export interface SignableRequest {
  readonly method: string;
  readonly url: URL;
  /** Headers to sign (names in any case). host, x-amz-date and x-amz-content-sha256 are added. */
  readonly headers: Readonly<Record<string, string>>;
  readonly payloadSha256: string;
}

export const EMPTY_PAYLOAD_SHA256 = createHash('sha256').update('').digest('hex');

export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

/** "20130524T000000Z" */
export function amzDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** RFC 3986 encoding as AWS expects it (encodeURIComponent leaves !'()* alone). */
function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalQuery(url: URL): string {
  return [...url.searchParams]
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)] as const)
    .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : x > y ? 1 : 0) : a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

/**
 * AWS Signature Version 4 for S3 (single-chunk payload). Returns every header the request must send,
 * including Authorization. Implemented on node:crypto so the API has no SDK dependency (ADR-015).
 */
export function signS3Request(request: SignableRequest, credentials: S3Credentials, now: Date): Record<string, string> {
  const timestamp = amzDate(now);
  const day = timestamp.slice(0, 8);
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(request.headers)) {
    headers[name.toLowerCase()] = value.trim().replace(/\s+/g, ' ');
  }
  const signed: Record<string, string> = {
    ...headers,
    host: request.url.host,
    'x-amz-date': timestamp,
    'x-amz-content-sha256': request.payloadSha256,
  };

  const names = Object.keys(signed).sort();
  const signedHeaders = names.join(';');
  const canonicalRequest = [
    request.method,
    request.url.pathname,
    canonicalQuery(request.url),
    names.map((name) => `${name}:${signed[name]}\n`).join(''),
    signedHeaders,
    request.payloadSha256,
  ].join('\n');

  const scope = `${day}/${credentials.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', timestamp, scope, sha256Hex(canonicalRequest)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${credentials.secretAccessKey}`, day), credentials.region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  // fetch() sets Host itself; sending it explicitly is not allowed.
  return {
    ...headers,
    'x-amz-date': timestamp,
    'x-amz-content-sha256': request.payloadSha256,
    authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
