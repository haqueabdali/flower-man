'use client';

import { Badge, ErrorNote, Section, Table } from '../../components/ui';
import { api, when } from '../../lib/api';
import { act, useLoad } from '../../lib/use-load';

interface Row { id: string; email: string; requestedAt: string; reason: string | null; status: string; processedAt: string | null }

export default function PrivacyPage() {
  const { data, error, reload } = useLoad<{ items: Row[] }>('admin/deletion-requests');
  const complete = (row: Row) => {
    if (window.confirm(`Delete and anonymise ${row.email}? Orders and payments are kept for bookkeeping without personal data. This cannot be undone.`)) {
      void act(() => api(`admin/deletion-requests/${row.id}/complete`, { method: 'POST', body: {} }), reload);
    }
  };
  return (
    <Section title="Account deletion requests">
      <ErrorNote error={error} />
      <Table rows={data?.items} columns={[
        { header: 'Account', cell: (r) => r.email },
        { header: 'Requested', cell: (r) => when(r.requestedAt) },
        { header: 'Reason', cell: (r) => r.reason ?? '—' },
        { header: 'Status', cell: (r) => <Badge value={r.status} /> },
        { header: '', cell: (r) => r.status === 'PENDING' && <button className="danger" onClick={() => complete(r)}>Complete deletion</button> },
      ]} />
    </Section>
  );
}
