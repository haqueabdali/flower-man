import type { ApiErrorCode, ApiErrorResponse } from '@flower-man/contracts';
import { TransitionError } from '@flower-man/domain';
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

import { getRequestId } from './request-context.js';

const CODES: Readonly<Partial<Record<number, ApiErrorCode>>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  503: 'SERVICE_UNAVAILABLE',
};

function codeFor(status: number): ApiErrorCode {
  return CODES[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
}

export interface DescribedError {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly message: string;
}

/** Errors from Express middleware (e.g. body-parser) follow the http-errors shape. */
interface HttpErrorLike {
  readonly status: number;
  readonly expose: boolean;
  readonly message: string;
}

function isHttpErrorLike(value: unknown): value is HttpErrorLike {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate['status'] === 'number' && typeof candidate['expose'] === 'boolean' && typeof candidate['message'] === 'string';
}

/** Maps any thrown value to what the client may see. Pure: no logging, no I/O. */
export function describeError(exception: unknown): DescribedError {
  const { status, message } = describeRaw(exception);
  return { status, code: codeFor(status), message };
}

function describeRaw(exception: unknown): { status: number; message: string } {
  // A state-machine rule refused the change (e.g. confirming an unpaid order): the request conflicts with current state.
  if (exception instanceof TransitionError) {
    return { status: HttpStatus.CONFLICT, message: exception.message };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    if (status >= 500 && status !== HttpStatus.SERVICE_UNAVAILABLE) {
      return { status, message: 'Internal server error.' };
    }
    const response = exception.getResponse();
    let message = exception.message;
    if (typeof response === 'object' && response !== null) {
      const raw = (response as Record<string, unknown>)['message'];
      if (typeof raw === 'string') {
        message = raw;
      } else if (Array.isArray(raw) && raw.every((item) => typeof item === 'string')) {
        message = raw.join('; ');
      }
    }
    return { status, message };
  }
  if (isHttpErrorLike(exception) && exception.expose && exception.status >= 400 && exception.status < 500) {
    return { status: exception.status, message: exception.message };
  }
  return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error.' };
}

/**
 * Turns every error into { error: { code, message, requestId } }.
 * Internal errors are logged with their stack server-side but never described to the client.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = getRequestId(response);
    const { status, code, message } = describeError(exception);

    if (status >= 500) {
      const detail = exception instanceof Error ? (exception.stack ?? exception.message) : String(exception);
      this.logger.error(`${request.method} ${request.path} failed [${requestId}]`, detail);
    }

    if (response.headersSent) {
      return;
    }
    const body: ApiErrorResponse = { error: { code, message, requestId } };
    response.status(status).json(body);
  }
}
