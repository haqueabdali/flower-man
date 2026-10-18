'use client';

import type { OrderSummary } from '@flower-man/contracts';
import { ORDER_STATUSES } from '@flower-man/domain';
import Link from 'next/link';
import { useState } from 'react';

import { Badge, ErrorNote, Section, StatusFilter, Table } from '../../components/ui';
import { euro, when } from '../../lib/api';
import { useLoad } from '../../lib/use-load';

export default function OrdersPage() {
  const [status, setStatus] = useState('');
  const { data, error } = useLoad<{ items: OrderSummary[] }>(`admin/orders${status ? `?status=${status}` : ''}`);
  return (
    <Section title="Orders" actions={<StatusFilter value={status} options={ORDER_STATUSES} onChange={setStatus} />}>
      <ErrorNote error={error} />
      <Table
        rows={data?.items}
        columns={[
          { header: '#', cell: (o) => <Link href={`/orders/${o.id}`}>#{o.orderNumber}</Link> },
          { header: 'Status', cell: (o) => <Badge value={o.status} /> },
          { header: 'Seller', cell: (o) => o.sellerName },
          { header: 'Recipient', cell: (o) => <>{o.recipientName}<div className="muted">{o.deliveryAddress}</div></> },
          { header: 'Total', cell: (o) => euro(o.totalMinor) },
          { header: 'Type', cell: (o) => o.source.replace('_', ' ') },
          { header: 'Created', cell: (o) => when(o.createdAt) },
        ]}
      />
    </Section>
  );
}
