import type { ApiErrorCode, ApiErrorResponse } from '@flower-man/contracts';
import { TransitionError } from '@flower-man/domain';
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { locales, type core } from 'zod';

import { translateToItalian } from './messages-it.js';
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

/** The client's language from Accept-Language: Italian when its first choice is Italian. */
export function wantsItalian(acceptLanguage: string | undefined): boolean {
  return /^\s*it(-|;|,|\s|$)/i.test(acceptLanguage ?? '');
}

const zodEnglish = locales.en().localeError;
const zodItalian = locales.it().localeError;
const localeText = (render: typeof zodEnglish, issue: core.$ZodRawIssue): string | undefined => {
  const result = render?.(issue);
  return typeof result === 'string' ? result : result?.message;
};

/** Validation issues (ZodBodyPipe) in Italian: Zod's own Italian texts, or our dictionary for custom messages. */
function italianIssues(issues: readonly core.$ZodIssue[]): string {
  return issues
    .map((issue) => {
      const raw = issue as unknown as core.$ZodRawIssue;
      const custom = localeText(zodEnglish, raw) !== issue.message;
      const text = custom ? translateToItalian(issue.message) : (localeText(zodItalian, raw) ?? issue.message);
      return issue.path.length > 0 ? `${issue.path.join('.')}: ${text}` : text;
    })
    .join('; ');
}

function validationIssues(exception: unknown): readonly core.$ZodIssue[] | null {
  if (!(exception instanceof HttpException)) return null;
  const response = exception.getResponse();
  const issues = typeof response === 'object' && response !== null ? (response as Record<string, unknown>)['issues'] : undefined;
  return Array.isArray(issues) ? (issues as core.$ZodIssue[]) : null;
}

/** The message in the client's language (Italian or the original English). */
export function localizeError(exception: unknown, message: string, acceptLanguage: string | undefined): string {
  if (!wantsItalian(acceptLanguage)) return message;
  const issues = validationIssues(exception);
  return issues ? italianIssues(issues) : translateToItalian(message);
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
    const described = describeError(exception);
    const { status, code } = described;
    const message = localizeError(exception, described.message, request.headers['accept-language']);

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
