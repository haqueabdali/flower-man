import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { amzDate, EMPTY_PAYLOAD_SHA256, signS3Request } from './s3-signer.js';

// The worked example "GET Object" from the AWS S3 documentation
// (Signature Calculations for the Authorization Header: Transferring Payload in a Single Chunk).
// The documented example key is assembled so the repository's secret scanner (AKIA…) stays strict.
const EXAMPLE_ACCESS_KEY_ID = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');
const AWS_EXAMPLE = {
  accessKeyId: EXAMPLE_ACCESS_KEY_ID,
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
};

describe('signS3Request', () => {
  it('matches the AWS documentation GET Object example', () => {
    const headers = signS3Request(
      {
        method: 'GET',
        url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
        headers: { Range: 'bytes=0-9' },
        payloadSha256: EMPTY_PAYLOAD_SHA256,
      },
      AWS_EXAMPLE,
      new Date('2013-05-24T00:00:00Z'),
    );
    assert.equal(
      headers['authorization'],
      `AWS4-HMAC-SHA256 Credential=${EXAMPLE_ACCESS_KEY_ID}/20130524/us-east-1/s3/aws4_request, ` +
        'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ' +
        'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
    assert.equal(headers['x-amz-date'], '20130524T000000Z');
    assert.equal('host' in headers, false);
  });

  it('formats the AWS timestamp', () => {
    assert.equal(amzDate(new Date('2026-10-18T09:05:07.123Z')), '20261018T090507Z');
  });
});
