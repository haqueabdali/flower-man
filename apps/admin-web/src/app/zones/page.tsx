'use client';

import type { ServiceZone } from '@flower-man/contracts';
import { type FormEvent, useState } from 'react';

import { Badge, ErrorNote, Section, Table } from '../../components/ui';
import { api, euro } from '../../lib/api';
import { act, useLoad } from '../../lib/use-load';

export default function ZonesPage() {
  const { data, error, reload } = useLoad<{ items: ServiceZone[] }>('admin/zones');
  const [area, setArea] = useState('');

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    let parsed: unknown;
    try {
      parsed = JSON.parse(area);
    } catch {
      window.alert('Area must be GeoJSON (Polygon or MultiPolygon).');
      return;
    }
    void act(
      () => api('admin/zones', {
        method: 'POST',
        body: {
          code: String(form.get('code')).toUpperCase(),
          name: form.get('name'),
          city: form.get('city'),
          province: String(form.get('province')).toUpperCase(),
          deliveryFeeMinor: Math.round(Number(String(form.get('fee')).replace(',', '.')) * 100),
          area: parsed,
        },
      }),
      reload,
    );
  };

  const update = (zone: ServiceZone, body: Record<string, unknown>) => act(() => api(`admin/zones/${zone.id}`, { method: 'PATCH', body }), reload);

  return (
    <>
      <Section title="Service zones">
        <ErrorNote error={error} />
        <Table
          rows={data?.items}
          columns={[
            { header: 'Code', cell: (z) => z.code },
            { header: 'Zone', cell: (z) => `${z.name} (${z.province})` },
            { header: 'Delivery fee', cell: (z) => euro(z.deliveryFeeMinor) },
            { header: 'Status', cell: (z) => <Badge value={z.active ? 'ACTIVE' : 'SUSPENDED'} /> },
            {
              header: 'Actions',
              cell: (z) => (
                <div className="row">
                  <button className="secondary" onClick={() => update(z, { active: !z.active })}>{z.active ? 'Deactivate' : 'Activate'}</button>
                  <button className="secondary" onClick={() => { const fee = window.prompt('New delivery fee in euro'); if (fee) void update(z, { deliveryFeeMinor: Math.round(Number(fee.replace(',', '.')) * 100) }); }}>Change fee</button>
                </div>
              ),
            },
          ]}
        />
      </Section>
      <Section title="Add a zone (e.g. Milano, Brescia, Monza)">
        <form onSubmit={create} className="row" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
          <div className="row">
            <input name="code" placeholder="IT-MI-MILANO" required />
            <input name="name" placeholder="Milano" required />
            <input name="city" placeholder="Milano" required />
            <input name="province" placeholder="MI" maxLength={2} required />
            <input name="fee" placeholder="Delivery fee €" required />
          </div>
          <textarea placeholder='{"type":"Polygon","coordinates":[[[9.10,45.40],[9.30,45.40],[9.30,45.55],[9.10,45.55],[9.10,45.40]]]}' value={area} onChange={(event) => setArea(event.target.value)} />
          <button>Create zone</button>
        </form>
      </Section>
    </>
  );
}
