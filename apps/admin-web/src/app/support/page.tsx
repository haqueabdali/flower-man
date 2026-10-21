'use client';

import { type AdminSupportTicket, SUPPORT_STATUSES } from '@flower-man/contracts';
import { useState } from 'react';

import { Badge, ErrorNote, Section, StatusFilter } from '../../components/ui';
import { api, when } from '../../lib/api';
import { act, useLoad } from '../../lib/use-load';

export default function SupportPage() {
  const [status, setStatus] = useState('OPEN');
  const { data, error, reload } = useLoad<{ items: AdminSupportTicket[] }>(`admin/support${status ? `?status=${status}` : ''}`);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const reply = (ticket: AdminSupportTicket) => {
    const body = drafts[ticket.id]?.trim();
    if (!body) return;
    void act(() => api(`admin/support/${ticket.id}/reply`, { method: 'POST', body: { body } }), () => {
      setDrafts((current) => ({ ...current, [ticket.id]: '' }));
      reload();
    });
  };

  return (
    <Section title="Help & support" actions={<StatusFilter value={status} options={SUPPORT_STATUSES} onChange={setStatus} />}>
      <p className="muted">Open conversations are waiting for the team (oldest first). The user gets your reply in the app and by email.</p>
      <ErrorNote error={error} />
      {data?.items.length === 0 && <p className="muted">Nothing here.</p>}
      {data?.items.map((ticket) => (
        <div className="card" key={ticket.id} style={{ marginBottom: 12 }}>
          <div className="card-header">
            <div>
              <b>{ticket.subject}</b> {ticket.orderNumber !== null && <span className="muted">· order #{ticket.orderNumber}</span>}
              <div className="muted">{ticket.userName} · {ticket.userEmail} · {when(ticket.updatedAt)}</div>
            </div>
            <Badge value={ticket.status} />
          </div>
          {ticket.messages.map((message, index) => (
            <p key={index} style={{ margin: '6px 0', paddingLeft: 10, borderLeft: `3px solid ${message.author === 'TEAM' ? 'var(--brand)' : 'var(--line)'}`, whiteSpace: 'pre-wrap' }}>
              <span className="muted">{message.author === 'TEAM' ? 'Team' : 'User'} · {when(message.createdAt)}</span>
              <br />
              {message.body}
            </p>
          ))}
          <textarea
            style={{ minHeight: 70, fontFamily: 'inherit', fontSize: 14 }}
            placeholder="Reply…"
            maxLength={2000}
            value={drafts[ticket.id] ?? ''}
            onChange={(event) => setDrafts((current) => ({ ...current, [ticket.id]: event.target.value }))}
          />
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" onClick={() => reply(ticket)} disabled={!drafts[ticket.id]?.trim()}>Send reply</button>
            {ticket.status !== 'CLOSED' && <button type="button" className="secondary" onClick={() => void act(() => api(`admin/support/${ticket.id}/close`, { method: 'POST' }), reload)}>Close</button>}
          </div>
        </div>
      ))}
    </Section>
  );
}
