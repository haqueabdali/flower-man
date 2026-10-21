import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  type ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import type { Alerter } from './alerts.js';
import { ApiExceptionFilter, describeError } from './api-exception.filter.js';

describe('describeError', () => {
  it('keeps the status and message of client errors', () => {
    assert.deepEqual(describeError(new NotFoundException('Order not found.')), {
      status: 404,
      code: 'NOT_FOUND',
      message: 'Order not found.',
    });
    assert.deepEqual(describeError(new ForbiddenException()), { status: 403, code: 'FORBIDDEN', message: 'Forbidden' });
  });

  it('joins validation message lists', () => {
    const error = new BadRequestException({ message: ['email is required', 'password is too short'] });
    assert.equal(describeError(error).message, 'email is required; password is too short');
  });

  it('maps unlisted 4xx statuses to BAD_REQUEST', () => {
    assert.equal(describeError(new HttpException('I am a teapot', 418)).code, 'BAD_REQUEST');
  });

  it('keeps an explicit 503 message', () => {
    assert.deepEqual(describeError(new ServiceUnavailableException('Payments are temporarily unavailable.')), {
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Payments are temporarily unavailable.',
    });
  });

  it('never exposes the message of unexpected errors', () => {
    const leaked = 'password authentication failed for user "flower_man" at 10.0.0.5';
    for (const exception of [new Error(leaked), new InternalServerErrorException(leaked), new TypeError(leaked), leaked, null]) {
      const described = describeError(exception);
      assert.equal(described.status, 500);
      assert.equal(described.code, 'INTERNAL_ERROR');
      assert.equal(described.message, 'Internal server error.');
    }
  });

  it('exposes Express middleware errors only when they are marked safe', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), { status: 413, expose: true });
    assert.deepEqual(describeError(tooLarge), { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'request entity too large' });

    const hidden = Object.assign(new Error('internal detail'), { status: 400, expose: false });
    assert.equal(describeError(hidden).message, 'Internal server error.');
  });
});

describe('ApiExceptionFilter alerts', () => {
  const run = (exception: unknown) => {
    const reports: [string, string][] = [];
    const alerter = { report: (key: string, message: string) => (reports.push([key, message]), true) } as unknown as Alerter;
    const response = { locals: { requestId: 'req-1' }, headersSent: false, status: () => response, json: () => response };
    const request = { method: 'GET', path: '/api/v1/orders/123?secret=x', route: { path: '/api/v1/orders/:id' }, headers: {} };
    const host = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }) } as unknown as ArgumentsHost;
    new ApiExceptionFilter(alerter).catch(exception, host);
    return reports;
  };

  it('alerts on internal errors with the route pattern and request id only', () => {
    assert.deepEqual(run(new TypeError('cannot read user.email')), [
      ['GET /api/v1/orders/:id 500', 'GET /api/v1/orders/:id → 500 TypeError [request req-1]'],
    ]);
  });

  it('stays quiet for client errors', () => {
    assert.deepEqual(run(new NotFoundException('Order not found.')), []);
  });
});
