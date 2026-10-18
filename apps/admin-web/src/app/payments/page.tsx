'use client';

import { useState } from 'react';

import { Badge, ErrorNote, Section, StatusFilter, Table } from '../../components/ui';
import { euro, when } from '../../lib/api';
import { useLoad } from '../../lib/use-load';

interface Row { id: string; orderNumber: string; provider: string; reference: string; amountMinor: number; refundedMinor: number; status: string; failureReason: string | null; createdAt: string }

export default function PaymentsPage() {
  const [status, setStatus] = useState('');
  const { data, error } = useLoad<{ items: Row[] }>(`admin/payments${status ? `?status=${status}` : ''}`);
  return (
    <Section title="Payments" actions={<StatusFilter value={status} options={['REQUIRES_PAYMENT', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED']} onChange={setStatus} />}>
      <ErrorNote error={error} />
      <Table
        rows={data?.items}
        columns={[
          { header: 'Order', cell: (p) => `#${p.orderNumber}` },
          { header: 'Provider', cell: (p) => <>{p.provider}<div className="muted">{p.reference}</div></> },
          { header: 'Amount', cell: (p) => euro(p.amountMinor) },
          { header: 'Refunded', cell: (p) => euro(p.refundedMinor) },
          { header: 'Status', cell: (p) => <><Badge value={p.status} />{p.failureReason && <div className="muted">{p.failureReason}</div>}</> },
          { header: 'Created', cell: (p) => when(p.createdAt) },
        ]}
      />
    </Section>
  );
}
