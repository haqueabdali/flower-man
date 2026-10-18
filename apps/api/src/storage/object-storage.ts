import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

import type { S3StorageConfig, StorageConfig } from '../config/app-config.js';
import { EMPTY_PAYLOAD_SHA256, sha256Hex, signS3Request } from './s3-signer.js';

/**
 * Where uploaded files (delivery proof photos) live. The local driver is for development;
 * the S3-compatible driver is for production (ADR-015).
 */
export interface ObjectStorage {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

const SAFE_KEY = /^[a-z0-9-]+(\/[A-Za-z0-9._-]+)+$/;

function assertSafeKey(key: string): void {
  if (!SAFE_KEY.test(key) || key.includes('..')) {
    throw new Error('Invalid storage key');
  }
}

export class LocalDiskStorage implements ObjectStorage {
  private readonly root: string;

  constructor(directory: string) {
    this.root = resolve(directory);
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  private pathFor(key: string): string {
    assertSafeKey(key);
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) {
      throw new Error('Invalid storage key');
    }
    return path;
  }
}

const S3_TIMEOUT_MS = 15_000;

/**
 * Any S3-compatible bucket (AWS S3, Cloudflare R2, MinIO…), signed with SigV4. The bucket stays private:
 * files are only served through the API, which checks who may see them.
 */
export class S3Storage implements ObjectStorage {
  constructor(
    private readonly config: S3StorageConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    const response = await this.send('PUT', key, bytes, { 'content-type': contentType });
    if (!response.ok) {
      throw new Error(`Object storage PUT failed with HTTP ${response.status}`);
    }
  }

  async get(key: string): Promise<Buffer> {
    const response = await this.send('GET', key, null, {});
    if (!response.ok) {
      throw new Error(`Object storage GET failed with HTTP ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private urlFor(key: string): URL {
    assertSafeKey(key);
    const path = key.split('/').map(encodeURIComponent).join('/');
    const { endpoint, bucket, region } = this.config;
    // Custom endpoints are addressed path-style; AWS itself virtual-hosted style.
    return endpoint ? new URL(`${endpoint}/${bucket}/${path}`) : new URL(`https://${bucket}.s3.${region}.amazonaws.com/${path}`);
  }

  private async send(method: 'GET' | 'PUT', key: string, body: Buffer | null, headers: Record<string, string>): Promise<Response> {
    const url = this.urlFor(key);
    const signed = signS3Request(
      { method, url, headers, payloadSha256: body ? sha256Hex(body) : EMPTY_PAYLOAD_SHA256 },
      this.config,
      this.now(),
    );
    // The response body of a failed request is drained but never logged (it may echo request details).
    const response = await fetch(url, { method, headers: signed, body, signal: AbortSignal.timeout(S3_TIMEOUT_MS) });
    if (!response.ok) {
      await response.arrayBuffer().catch(() => undefined);
    }
    return response;
  }
}

export function createObjectStorage(config: StorageConfig): ObjectStorage {
  if (config.driver === 's3') {
    if (!config.s3) {
      throw new Error('STORAGE_DRIVER=s3 without S3 settings');
    }
    return new S3Storage(config.s3);
  }
  return new LocalDiskStorage(config.localDir);
}

/** Identifies JPEG / PNG / WebP by their magic bytes (never trust the Content-Type alone). */
export function detectImageType(bytes: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length > 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}
