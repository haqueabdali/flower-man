'use client';

import { type AdminUser, CAPABILITIES } from '@flower-man/contracts';
import { useState } from 'react';

import { Badge, ErrorNote, Section, Table } from '../../components/ui';
import { api, when } from '../../lib/api';
import { act, useLoad } from '../../lib/use-load';

export default function UsersPage() {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const { data, error, reload } = useLoad<{ items: AdminUser[] }>(`admin/users${search ? `?q=${encodeURIComponent(search)}` : ''}`);

  const setStatus = (user: AdminUser, status: 'ACTIVE' | 'SUSPENDED') => {
    const reason = window.prompt(`Reason for ${status === 'SUSPENDED' ? 'suspending' : 'reactivating'} ${user.email}`);
    if (reason) void act(() => api(`admin/users/${user.id}/status`, { method: 'POST', body: { status, reason } }), reload);
  };
  const capability = (user: AdminUser, grant: boolean) => {
    const value = window.prompt(`Capability to ${grant ? 'grant' : 'remove'} (${CAPABILITIES.join(', ')})`);
    if (value) void act(() => api(`admin/users/${user.id}/capabilities/${grant ? 'grant' : 'remove'}`, { method: 'POST', body: { capability: value.trim().toUpperCase() } }), reload);
  };

  return (
    <Section
      title="Users"
      actions={
        <form className="row" onSubmit={(event) => { event.preventDefault(); setSearch(query); }}>
          <input placeholder="Search email or name" value={query} onChange={(event) => setQuery(event.target.value)} />
          <button className="secondary">Search</button>
        </form>
      }
    >
      <ErrorNote error={error} />
      <Table
        rows={data?.items}
        columns={[
          { header: 'User', cell: (u) => <><b>{u.fullName}</b><div className="muted">{u.email}</div></> },
          { header: 'Status', cell: (u) => <Badge value={u.status} /> },
          { header: 'Email', cell: (u) => (u.emailVerified ? 'verified' : 'not verified') },
          { header: 'Capabilities', cell: (u) => u.capabilities.join(', ') || '—' },
          { header: 'Created', cell: (u) => when(u.createdAt) },
          {
            header: 'Actions',
            cell: (u) => (
              <div className="row">
                {u.status === 'ACTIVE' ? <button className="danger" onClick={() => setStatus(u, 'SUSPENDED')}>Suspend</button> : u.status === 'SUSPENDED' && <button onClick={() => setStatus(u, 'ACTIVE')}>Reactivate</button>}
                <button className="secondary" onClick={() => capability(u, true)}>Grant…</button>
                <button className="secondary" onClick={() => capability(u, false)}>Remove…</button>
              </div>
            ),
          },
        ]}
      />
    </Section>
  );
}
