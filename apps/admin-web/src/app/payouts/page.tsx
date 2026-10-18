'use client';

import type { PartnerBalance, SettlementView } from '@flower-man/contracts';

import { Badge, ErrorNote, Section, Table } from '../../components/ui';
import { api, euro, when } from '../../lib/api';
import { act, useLoad } from '../../lib/use-load';

export default function PayoutsPage() {
  const balances = useLoad<{ items: PartnerBalance[] }>('admin/balances');
  const settlements = useLoad<{ items: SettlementView[] }>('admin/settlements');
  const reload = () => { balances.reload(); settlements.reload(); };

  const create = (partner: PartnerBalance) => {
    if (window.confirm(`Create a settlement of ${euro(partner.unsettledMinor)} for ${partner.displayName}?`)) {
      void act(() => api('admin/settlements', { method: 'POST', body: { partnerId: partner.partnerId } }), reload);
    }
  };
  const move = (settlement: SettlementView, status: 'PROCESSING' | 'PAID' | 'FAILED') => {
    const body: Record<string, string> = { status };
    if (status === 'PAID') {
      const reference = window.prompt('Bank transfer / provider reference');
      if (!reference) return;
      body['externalReference'] = reference;
    }
    if (status === 'FAILED') {
      const note = window.prompt('Why did the payout fail?');
      if (!note) return;
      body['note'] = note;
    }
    void act(() => api(`admin/settlements/${settlement.id}/status`, { method: 'POST', body }), reload);
  };

  return (
    <>
      <Section title="Payable partners (unsettled earnings)">
        <ErrorNote error={balances.error} />
        <Table
          rows={balances.data?.items}
          columns={[
            { header: 'Partner', cell: (b) => <><b>{b.displayName}</b><div className="muted">{b.kind.replaceAll('_', ' ')}</div></> },
            { header: 'Entries', cell: (b) => b.unsettledEntries },
            { header: 'Balance', cell: (b) => euro(b.unsettledMinor) },
            { header: '', cell: (b) => b.unsettledMinor > 0 && <button onClick={() => create(b)}>Create settlement</button> },
          ]}
        />
      </Section>
      <Section title="Settlements">
        <ErrorNote error={settlements.error} />
        <Table
          rows={settlements.data?.items}
          columns={[
            { header: 'Partner', cell: (s) => s.partnerName },
            { header: 'Total', cell: (s) => euro(s.totalMinor) },
            { header: 'Entries', cell: (s) => s.entryCount },
            { header: 'Status', cell: (s) => <><Badge value={s.status} />{s.failureReason && <div className="muted">{s.failureReason}</div>}</> },
            { header: 'Reference', cell: (s) => s.externalReference ?? '—' },
            { header: 'Updated', cell: (s) => when(s.updatedAt) },
            {
              header: 'Actions',
              cell: (s) => (
                <div className="row">
                  {s.status === 'CREATED' && <button className="secondary" onClick={() => move(s, 'PROCESSING')}>Mark processing</button>}
                  {s.status === 'PROCESSING' && <button onClick={() => move(s, 'PAID')}>Mark paid</button>}
                  {(s.status === 'CREATED' || s.status === 'PROCESSING') && <button className="danger" onClick={() => move(s, 'FAILED')}>Mark failed</button>}
                </div>
              ),
            },
          ]}
        />
      </Section>
    </>
  );
}
