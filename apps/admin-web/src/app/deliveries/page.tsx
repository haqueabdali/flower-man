'use client';

import { DELIVERY_STATUSES } from '@flower-man/domain';
import { useState } from 'react';

import { Badge, ErrorNote, Section, StatusFilter, Table } from '../../components/ui';
import { euro, when } from '../../lib/api';
import { useLoad } from '../../lib/use-load';

interface Row { id: string; orderNumber: string; status: string; courierName: string | null; feeMinor: number; createdAt: string; deliveredAt: string | null; lastLocationAt: string | null; hasProof: boolean }

export default function DeliveriesPage() {
  const [status, setStatus] = useState('');
  const { data, error } = useLoad<{ items: Row[] }>(`admin/deliveries${status ? `?status=${status}` : ''}`);
  return (
    <Section title="Deliveries" actions={<StatusFilter value={status} options={DELIVERY_STATUSES} onChange={setStatus} />}>
      <ErrorNote error={error} />
      <Table
        rows={data?.items}
        columns={[
          { header: 'Order', cell: (d) => `#${d.orderNumber}` },
          { header: 'Status', cell: (d) => <Badge value={d.status} /> },
          { header: 'Courier', cell: (d) => d.courierName ?? '—' },
          { header: 'Fee', cell: (d) => euro(d.feeMinor) },
          { header: 'Last GPS', cell: (d) => when(d.lastLocationAt) },
          { header: 'Delivered', cell: (d) => when(d.deliveredAt) },
          { header: 'Proof', cell: (d) => (d.hasProof ? <a href={`/api/proxy/admin/deliveries/${d.id}/proof`} target="_blank" rel="noreferrer">View photo</a> : '—') },
        ]}
      />
    </Section>
  );
}
