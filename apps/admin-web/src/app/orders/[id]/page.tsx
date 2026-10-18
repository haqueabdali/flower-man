'use client';

import type { OrderDetail } from '@flower-man/contracts';
import { use } from 'react';

import { Badge, ErrorNote, Section, Table } from '../../../components/ui';
import { api, euro, when } from '../../../lib/api';
import { act, useLoad } from '../../../lib/use-load';

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: order, error, reload } = useLoad<OrderDetail>(`admin/orders/${id}`);
  if (!order) return <ErrorNote error={error ?? null} />;

  const cancel = () => {
    const reason = window.prompt('Cancellation reason (a paid order is refunded in full)');
    if (reason) void act(() => api(`admin/orders/${id}/cancel`, { method: 'POST', body: { reason } }), reload);
  };
  const refund = () => {
    const amount = window.prompt('Refund amount in euro (empty = full remaining amount)');
    if (amount === null) return;
    const reason = window.prompt('Refund reason');
    if (!reason) return;
    const amountMinor = amount.trim() ? Math.round(Number(amount.replace(',', '.')) * 100) : undefined;
    void act(() => api(`admin/orders/${id}/refund`, { method: 'POST', body: { reason, ...(amountMinor ? { amountMinor } : {}) } }), reload);
  };

  return (
    <>
      <Section
        title={`Order #${order.orderNumber}`}
        actions={
          <>
            <Badge value={order.status} />
            {!['DELIVERED', 'CANCELLED', 'REFUNDED', 'PICKED_UP', 'IN_TRANSIT'].includes(order.status) && <button className="danger" onClick={cancel}>Cancel</button>}
            {['DELIVERED', 'CANCELLED'].includes(order.status) && order.paymentStatus && ['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus) && <button className="secondary" onClick={refund}>Refund…</button>}
          </>
        }
      >
        <ErrorNote error={error} />
        <p>
          <b>{order.sellerName}</b> → {order.recipientName} ({order.recipientPhone}), {order.deliveryAddress}
          <br />
          Subtotal {euro(order.subtotalMinor)} + delivery {euro(order.deliveryFeeMinor)} = <b>{euro(order.totalMinor)}</b> · payment {order.paymentStatus ?? '—'}
          {order.giftMessage && <><br />Gift message: “{order.giftMessage}”</>}
        </p>
        <Table rows={order.items} columns={[{ header: 'Item', cell: (i) => i.name }, { header: 'Qty', cell: (i) => i.quantity }, { header: 'Price', cell: (i) => euro(i.unitPriceMinor) }, { header: 'Total', cell: (i) => euro(i.lineTotalMinor) }]} />
      </Section>
      {order.delivery && (
        <Section title="Delivery">
          <p>
            <Badge value={order.delivery.status} /> courier {order.delivery.courierName ?? '—'} · last position {order.delivery.lastLocation ? `${order.delivery.lastLocation.latitude.toFixed(5)}, ${order.delivery.lastLocation.longitude.toFixed(5)} (${when(order.delivery.lastLocationAt)})` : '—'} · ETA {when(order.delivery.etaAt)}
          </p>
          {order.delivery.status === 'DELIVERED' && <img alt="Delivery proof" src={`/api/proxy/admin/deliveries/${order.delivery.id}/proof`} style={{ maxWidth: 320, borderRadius: 8 }} />}
        </Section>
      )}
      <Section title="Status history">
        <Table rows={order.history} columns={[{ header: 'When', cell: (h) => when(h.at) }, { header: 'From', cell: (h) => h.from ?? '—' }, { header: 'To', cell: (h) => <Badge value={h.to} /> }, { header: 'By', cell: (h) => h.actor }, { header: 'Reason', cell: (h) => h.reason ?? '' }]} />
      </Section>
    </>
  );
}
