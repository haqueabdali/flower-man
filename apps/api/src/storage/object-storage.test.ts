import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

import type { S3StorageConfig } from '../config/app-config.js';
import { S3Storage } from './object-storage.js';
import { sha256Hex, signS3Request } from './s3-signer.js';

const NOW = new Date('2026-10-18T10:00:00Z');

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

describe('S3Storage', () => {
  const objects = new Map<string, { bytes: Buffer; contentType: string }>();
  let server: Server;
  let config: S3StorageConfig;

  before(async () => {
    // A minimal S3 stand-in: re-signs every request with the shared secret and rejects mismatches.
    server = createServer((request, response) => {
      void (async () => {
        const body = await readBody(request);
        const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
        const signedHeaderNames = /SignedHeaders=([^,]+)/.exec(request.headers.authorization ?? '')?.[1]?.split(';') ?? [];
        const toSign: Record<string, string> = {};
        for (const name of signedHeaderNames) {
          if (!['host', 'x-amz-date', 'x-amz-content-sha256'].includes(name)) {
            toSign[name] = String(request.headers[name]);
          }
        }
        const expected = signS3Request(
          { method: request.method ?? '', url, headers: toSign, payloadSha256: sha256Hex(body) },
          config,
          NOW,
        );
        if (expected['authorization'] !== request.headers.authorization || request.headers['x-amz-content-sha256'] !== sha256Hex(body)) {
          response.writeHead(403).end('<Error><Code>SignatureDoesNotMatch</Code></Error>');
          return;
        }
        if (request.method === 'PUT') {
          objects.set(url.pathname, { bytes: body, contentType: String(request.headers['content-type']) });
          response.writeHead(200).end();
          return;
        }
        const stored = objects.get(url.pathname);
        if (!stored) {
          response.writeHead(404).end('<Error><Code>NoSuchKey</Code></Error>');
          return;
        }
        response.writeHead(200, { 'content-type': stored.contentType }).end(stored.bytes);
      })();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    config = {
      endpoint: `http://127.0.0.1:${port}`,
      region: 'auto',
      bucket: 'proofs',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    };
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('stores and reads back an object path-style with a valid signature', async () => {
    const storage = new S3Storage(config, () => NOW);
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);
    await storage.put('proofs/abc-123.jpg', bytes, 'image/jpeg');
    assert.deepEqual(objects.get('/proofs/proofs/abc-123.jpg'), { bytes, contentType: 'image/jpeg' });
    assert.deepEqual(await storage.get('proofs/abc-123.jpg'), bytes);
  });

  it('fails without leaking the response body', async () => {
    const storage = new S3Storage(config, () => NOW);
    await assert.rejects(storage.get('proofs/missing.jpg'), /^Error: Object storage GET failed with HTTP 404$/);
    const wrongSecret = new S3Storage({ ...config, secretAccessKey: 'other' }, () => NOW);
    await assert.rejects(wrongSecret.put('proofs/x.jpg', Buffer.from('x'), 'image/jpeg'), /HTTP 403$/);
  });

  it('refuses unsafe keys before any request', async () => {
    const storage = new S3Storage(config, () => NOW);
    await assert.rejects(storage.get('../etc/passwd'), /Invalid storage key/);
  });
});
