import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

import type { StorageConfig } from '../config/app-config.js';

/**
 * Where uploaded files (delivery proof photos) live. The local driver is for development;
 * an S3-compatible driver implements the same interface for production (ADR-012).
 */
export interface ObjectStorage {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

const SAFE_KEY = /^[a-z0-9-]+(\/[A-Za-z0-9._-]+)+$/;

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
    if (!SAFE_KEY.test(key) || key.includes('..')) {
      throw new Error('Invalid storage key');
    }
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) {
      throw new Error('Invalid storage key');
    }
    return path;
  }
}

export function createObjectStorage(config: StorageConfig): ObjectStorage {
  return new LocalDiskStorage(config.localDir);
}

/** Identifies JPEG / PNG / WebP by their magic bytes (never trust the Content-Type alone). */
export function detectImageType(bytes: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length > 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}
