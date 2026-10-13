// Sends a real email over SMTP through nodemailer to a minimal in-process SMTP server.
import assert from 'node:assert/strict';
import { createServer, type Server, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

import { SmtpMailer } from './mailer.js';

interface Received {
  from: string;
  to: string[];
  data: string;
}

/** Just enough SMTP (EHLO/MAIL/RCPT/DATA/QUIT) to accept one message per connection. */
function startSmtpSink(received: Received[]): Promise<Server> {
  const server = createServer((socket: Socket) => {
    let current: Received = { from: '', to: [], data: '' };
    let inData = false;
    let buffer = '';
    socket.write('220 sink ESMTP\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let index: number;
      while ((index = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            received.push(current);
            current = { from: '', to: [], data: '' };
            socket.write('250 queued\r\n');
          } else {
            current.data += `${line}\n`;
          }
          continue;
        }
        const command = line.slice(0, 4).toUpperCase();
        if (command === 'EHLO' || command === 'HELO') socket.write('250 sink\r\n');
        else if (command === 'MAIL') { current.from = line; socket.write('250 ok\r\n'); }
        else if (command === 'RCPT') { current.to.push(line); socket.write('250 ok\r\n'); }
        else if (command === 'DATA') { inData = true; socket.write('354 go\r\n'); }
        else if (command === 'QUIT') { socket.end('221 bye\r\n'); }
        else socket.write('250 ok\r\n');
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

describe('SmtpMailer', () => {
  const received: Received[] = [];
  let server: Server;

  before(async () => {
    server = await startSmtpSink(received);
  });

  after(() => {
    server.close();
  });

  it('delivers the message over SMTP', async () => {
    const { port } = server.address() as AddressInfo;
    const mailer = new SmtpMailer(`smtp://127.0.0.1:${port}`, 'Flower Man <no-reply@flowerman.test>');
    await mailer.send({ to: 'cliente@example.com', subject: 'Test Città', text: 'Ciao!\nLink: https://app.test/x' });

    assert.equal(received.length, 1);
    const message = received[0];
    assert.ok(message);
    assert.match(message.from, /no-reply@flowerman\.test/);
    assert.match(message.to.join(), /cliente@example\.com/);
    assert.match(message.data, /^Subject: /m);
    assert.match(message.data, /https:\/\/app\.test\/x/);
  });
});
