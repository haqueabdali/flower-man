'use client';

import type { CustomRequestView } from '@flower-man/contracts';
import { useState } from 'react';

import { Badge, ErrorNote, Section, StatusFilter, Table } from '../../components/ui';
import { euro, when } from '../../lib/api';
import { useLoad } from '../../lib/use-load';

export default function CustomRequestsPage() {
  const [status, setStatus] = useState('');
  const { data, error } = useLoad<{ items: (CustomRequestView & { customerEmail: string })[] }>(`admin/custom-requests${status ? `?status=${status}` : ''}`);
  return (
    <Section title="Custom bouquet requests" actions={<StatusFilter value={status} options={['OPEN', 'OFFER_SELECTED', 'CANCELLED', 'EXPIRED']} onChange={setStatus} />}>
      <ErrorNote error={error} />
      <Table
        rows={data?.items}
        columns={[
          { header: 'Occasion', cell: (r) => <><b>{r.occasion}</b><div className="muted">{[r.flowerPreferences, r.colourPreferences].filter(Boolean).join(' · ')}</div></> },
          { header: 'Customer', cell: (r) => r.customerEmail },
          { header: 'Budget', cell: (r) => euro(r.budgetMinor) },
          { header: 'Window', cell: (r) => when(r.deliveryWindowStart) },
          { header: 'Offers', cell: (r) => r.offers.map((o) => `${o.sellerName}: ${euro(o.priceMinor)} (${o.status})`).join(', ') || '—' },
          { header: 'Status', cell: (r) => <Badge value={r.status} /> },
        ]}
      />
    </Section>
  );
}
