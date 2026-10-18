'use client';

import type { PartnerAccount } from '@flower-man/contracts';
import { VERIFICATION_STATUSES } from '@flower-man/domain';
import { useState } from 'react';

import { Badge, ErrorNote, Section, StatusFilter, Table } from '../../components/ui';
import { api } from '../../lib/api';
import { act, useLoad } from '../../lib/use-load';

type Row = PartnerAccount & { ownerEmail: string };

export default function PartnersPage() {
  const [status, setStatus] = useState('SUBMITTED');
  const { data, error, reload } = useLoad<{ items: Row[] }>(`admin/partners${status ? `?status=${status}` : ''}`);
  const review = (row: Row, next: string) => {
    const notes = window.prompt(`${next} ${row.displayName}: notes (optional)`) ?? undefined;
    return act(() => api(`admin/partners/${row.id}/review`, { method: 'POST', body: { status: next, ...(notes ? { notes } : {}) } }), reload);
  };
  return (
    <Section title="Partner verification" actions={<StatusFilter value={status} options={VERIFICATION_STATUSES} onChange={setStatus} />}>
      <ErrorNote error={error} />
      <Table
        rows={data?.items}
        columns={[
          { header: 'Partner', cell: (r) => <><b>{r.displayName}</b><div className="muted">{r.kind.replaceAll('_', ' ')}</div></> },
          { header: 'Owner', cell: (r) => r.ownerEmail },
          { header: 'Legal', cell: (r) => <>{r.legalName ?? '—'}<div className="muted">{r.vatNumber ?? ''}</div></> },
          { header: 'Contact', cell: (r) => <>{r.phone}<div className="muted">{r.address}</div></> },
          { header: 'Status', cell: (r) => <Badge value={r.verificationStatus} /> },
          {
            header: 'Actions',
            cell: (r) => (
              <div className="row">
                {r.verificationStatus === 'SUBMITTED' && <button className="secondary" onClick={() => review(r, 'UNDER_REVIEW')}>Start review</button>}
                {['SUBMITTED', 'UNDER_REVIEW', 'SUSPENDED'].includes(r.verificationStatus) && <button onClick={() => review(r, 'APPROVED')}>Approve</button>}
                {['SUBMITTED', 'UNDER_REVIEW'].includes(r.verificationStatus) && <button className="danger" onClick={() => review(r, 'REJECTED')}>Reject</button>}
                {r.verificationStatus === 'APPROVED' && <button className="danger" onClick={() => review(r, 'SUSPENDED')}>Suspend</button>}
              </div>
            ),
          },
        ]}
      />
    </Section>
  );
}
