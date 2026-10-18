'use client';

import type { MarketplaceHealth } from '@flower-man/contracts';

import { ErrorNote, Section } from '../components/ui';
import { euro } from '../lib/api';
import { useLoad } from '../lib/use-load';

export default function Dashboard() {
  const { data, error } = useLoad<MarketplaceHealth>('admin/health');
  const stats: [string, string | number][] = data
    ? [
        ['Users', data.users],
        ['Approved sellers', data.approvedSellers],
        ['Approved couriers', data.approvedCouriers],
        ['Couriers online', data.availableCouriers],
        ['Partner reviews pending', data.pendingPartnerReviews],
        ['Open custom requests', data.openCustomRequests],
        ['Deliveries waiting for a courier', data.offeredDeliveries],
        ['Unsettled earnings', euro(data.unsettledMinor)],
      ]
    : [];
  return (
    <>
      <h1>Marketplace health</h1>
      <ErrorNote error={error} />
      <div className="grid">
        {stats.map(([label, value]) => (
          <div className="stat" key={label}><span className="muted">{label}</span><b>{value}</b></div>
        ))}
      </div>
      <Section title="Orders by status">
        <div className="grid">
          {data && Object.entries(data.ordersByStatus).map(([status, count]) => (
            <div className="stat" key={status}><span className="muted">{status.replaceAll('_', ' ')}</span><b>{count}</b></div>
          ))}
        </div>
      </Section>
    </>
  );
}
