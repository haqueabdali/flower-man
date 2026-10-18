import { Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

import type { MailConfig } from '../config/app-config.js';

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/** Sends transactional email. Implementations must never log message bodies in production. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Injection token: @Inject(MAILER) mailer: Mailer */
export const MAILER = Symbol('MAILER');

/** Development only (refused in production by config): prints the email, including links, to the API log. */
export class LogMailer implements Mailer {
  private readonly logger = new Logger('Mail');

  async send(message: MailMessage): Promise<void> {
    this.logger.log(`To: ${message.to} | ${message.subject}\n${message.text}`);
  }
}

/** Tests only: keeps sent messages in memory. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
}

export class SmtpMailer implements Mailer {
  private readonly transporter;

  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.transporter = nodemailer.createTransport(smtpUrl);
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, to: message.to, subject: message.subject, text: message.text });
  }
}

export function createMailer(config: MailConfig): Mailer {
  switch (config.transport) {
    case 'smtp':
      if (!config.smtpUrl) {
        throw new Error('SMTP_URL missing');
      }
      return new SmtpMailer(config.smtpUrl, config.from);
    case 'memory':
      return new MemoryMailer();
    case 'log':
      return new LogMailer();
  }
}
