'use client';

import type { PromoCodeView } from '@flower-man/contracts';
import { type FormEvent, useState } from 'react';

import { Badge, ErrorNote, Section, Table } from '../../components/ui';
import { api, euro, when } from '../../lib/api';
import { act, useLoad } from '../../lib/use-load';

const cents = (value: FormDataEntryValue | null) => Math.round(Number(String(value ?? '').replace(',', '.')) * 100);
const optional = (value: FormDataEntryValue | null) => (String(value ?? '').trim() === '' ? undefined : value);

export default function PromoCodesPage() {
  const { data, error, reload } = useLoad<{ items: PromoCodeView[] }>('admin/promo-codes');
  const [kind, setKind] = useState<'PERCENT' | 'FIXED'>('PERCENT');

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const endsAt = optional(form.get('endsAt'));
    void act(
      () =>
        api('admin/promo-codes', {
          method: 'POST',
          body: {
            code: String(form.get('code')).trim(),
            ...(optional(form.get('description')) ? { description: String(form.get('description')) } : {}),
            kind,
            value: kind === 'PERCENT' ? Number(form.get('value')) : cents(form.get('value')),
            ...(optional(form.get('max')) ? { maxDiscountMinor: cents(form.get('max')) } : {}),
            ...(optional(form.get('min')) ? { minSubtotalMinor: cents(form.get('min')) } : {}),
            ...(endsAt ? { endsAt: new Date(`${String(endsAt)}T23:59:59`).toISOString() } : {}),
            ...(optional(form.get('uses')) ? { maxRedemptions: Number(form.get('uses')) } : {}),
            firstOrderOnly: form.get('first') === 'on',
          },
        }),
      reload,
    );
  };

  return (
    <>
      <Section title="Discount codes">
        <p className="muted">Discounts are paid by the platform: florists and couriers earn the same; the customer pays less. Each customer can use a code once.</p>
        <ErrorNote error={error} />
        <Table
          rows={data?.items}
          columns={[
            { header: 'Code', cell: (p) => <><b>{p.code}</b>{p.description && <div className="muted">{p.description}</div>}</> },
            {
              header: 'Discount',
              cell: (p) => (
                <>
                  {p.kind === 'PERCENT' ? `${p.value}%` : euro(p.value)}
                  <div className="muted">
                    {[p.maxDiscountMinor ? `max ${euro(p.maxDiscountMinor)}` : '', p.minSubtotalMinor ? `min order ${euro(p.minSubtotalMinor)}` : '', p.firstOrderOnly ? 'first order only' : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </>
              ),
            },
            { header: 'Valid', cell: (p) => <>{when(p.startsAt)}<div className="muted">until {p.endsAt ? when(p.endsAt) : 'no end'}</div></> },
            { header: 'Used', cell: (p) => <>{p.redemptions}{p.maxRedemptions ? ` / ${p.maxRedemptions}` : ''}<div className="muted">{euro(p.discountGivenMinor)} given</div></> },
            { header: 'Status', cell: (p) => <Badge value={p.active ? 'ACTIVE' : 'SUSPENDED'} /> },
            {
              header: '',
              cell: (p) => (
                <button type="button" className="secondary" onClick={() => void act(() => api(`admin/promo-codes/${p.id}`, { method: 'PATCH', body: { active: !p.active } }), reload)}>
                  {p.active ? 'Deactivate' : 'Activate'}
                </button>
              ),
            },
          ]}
        />
      </Section>
      <Section title="New code">
        <form onSubmit={create} className="row" style={{ alignItems: 'flex-end' }}>
          <label>Code<br /><input name="code" placeholder="BENVENUTO10" required minLength={3} maxLength={32} /></label>
          <label>Description<br /><input name="description" placeholder="Welcome offer" /></label>
          <label>Type<br />
            <select value={kind} onChange={(event) => setKind(event.target.value as 'PERCENT' | 'FIXED')}>
              <option value="PERCENT">% of flowers</option>
              <option value="FIXED">€ off</option>
            </select>
          </label>
          <label>{kind === 'PERCENT' ? 'Percent' : 'Euro'}<br /><input name="value" required inputMode="decimal" size={6} /></label>
          {kind === 'PERCENT' && <label>Max discount €<br /><input name="max" inputMode="decimal" size={6} /></label>}
          <label>Min order €<br /><input name="min" inputMode="decimal" size={6} /></label>
          <label>Last day<br /><input name="endsAt" type="date" /></label>
          <label>Max uses<br /><input name="uses" inputMode="numeric" size={5} /></label>
          <label className="row"><input name="first" type="checkbox" /> First order only</label>
          <button>Create code</button>
        </form>
      </Section>
    </>
  );
}
