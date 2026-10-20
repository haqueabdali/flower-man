'use client';

import { ANALYTICS_PERIODS, type MarketplaceAnalytics, type MarketplaceHealth } from '@flower-man/contracts';
import { useState } from 'react';

import { RevenueChart } from '../components/revenue-chart';
import { ErrorNote, Section, Table } from '../components/ui';
import { euro } from '../lib/api';
import { useLoad } from '../lib/use-load';

const duration = (minutes: number | null) => (minutes === null ? '—' : minutes < 120 ? `${minutes} min` : `${(minutes / 60).toFixed(1)} h`);

export default function Dashboard() {
  const [days, setDays] = useState<number>(30);
  const { data, error } = useLoad<MarketplaceHealth>('admin/health');
  const sales = useLoad<MarketplaceAnalytics>(`admin/analytics?days=${days}`);
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
  const a = sales.data;
  const kpis: [string, string | number][] = a
    ? [
        ['Revenue', euro(a.revenueMinor)],
        ['Paid orders', a.orders],
        ['Average order', euro(a.averageOrderMinor)],
        ['Platform commission', euro(a.commissionMinor)],
        ['Delivered', a.deliveredOrders],
        ['Cancelled / refunded', a.cancelledOrders],
        ['Payment → delivery', duration(a.averageDeliveryMinutes)],
        ['Florist rating', a.averageRating === null ? '—' : `${a.averageRating.toLocaleString('it-IT', { minimumFractionDigits: 1 })} ★ (${a.reviews})`],
        ['New customers', a.newCustomers],
      ]
    : [];
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Sales</h1>
        <div className="row" role="group" aria-label="Period">
          {ANALYTICS_PERIODS.map((period) => (
            <button key={period} type="button" className={period === days ? '' : 'secondary'} aria-pressed={period === days} onClick={() => setDays(period)}>
              Last {period} days
            </button>
          ))}
        </div>
      </div>
      <ErrorNote error={sales.error} />
      <div className="grid">
        {kpis.map(([label, value]) => (
          <div className="stat" key={label}><span className="muted">{label}</span><b>{value}</b></div>
        ))}
      </div>
      {a && (
        <div className="card">
          <RevenueChart days={a.daily} />
        </div>
      )}
      <Section title="Top florists">
        <Table
          rows={a?.topSellers}
          empty="No paid orders in this period."
          columns={[
            { header: 'Florist', cell: (s) => s.name },
            { header: 'Orders', cell: (s) => s.orders },
            { header: 'Revenue', cell: (s) => euro(s.revenueMinor) },
            { header: 'Rating', cell: (s) => (s.rating ? `${s.rating.average.toLocaleString('it-IT', { minimumFractionDigits: 1 })} ★ (${s.rating.count})` : '—') },
          ]}
        />
      </Section>
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
