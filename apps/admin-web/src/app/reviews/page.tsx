'use client';

import type { AdminReview } from '@flower-man/contracts';

import { Badge, ErrorNote, Section, Table } from '../../components/ui';
import { api, when } from '../../lib/api';
import { act, useLoad } from '../../lib/use-load';

const stars = (rating: number) => '★'.repeat(rating) + '☆'.repeat(5 - rating);

export default function ReviewsPage() {
  const { data, error, reload } = useLoad<{ items: AdminReview[] }>('admin/reviews');
  const hide = (review: AdminReview) => {
    const reason = window.prompt(`Why hide the review of order #${review.orderNumber}? It leaves the public list and the ratings.`);
    if (reason) void act(() => api(`admin/reviews/${review.orderId}/hide`, { method: 'POST', body: { reason } }), reload);
  };
  return (
    <Section title="Reviews">
      <ErrorNote error={error} />
      <Table
        rows={data?.items}
        columns={[
          { header: 'Order', cell: (r) => <>#{r.orderNumber}<div className="muted">{when(r.createdAt)}</div></> },
          { header: 'Florist', cell: (r) => <>{r.sellerName}<div>{stars(r.sellerRating)}</div></> },
          { header: 'Courier', cell: (r) => (r.courierRating === null ? '—' : <>{r.courierName}<div>{stars(r.courierRating)}</div></>) },
          { header: 'Comment', cell: (r) => r.comment ?? '—' },
          { header: 'Customer', cell: (r) => r.customerEmail },
          { header: 'Status', cell: (r) => (r.hiddenAt ? <Badge value="HIDDEN" /> : <button type="button" onClick={() => hide(r)}>Hide</button>) },
        ]}
      />
    </Section>
  );
}
