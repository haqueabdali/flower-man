'use client';

import { ErrorNote, Section, Table } from '../../components/ui';
import { when } from '../../lib/api';
import { useLoad } from '../../lib/use-load';

interface Event { id: string; occurredAt: string; type: string; email: string | null; ip: string | null; userAgent: string | null }
interface Audit { id: string; occurredAt: string; actorEmail: string | null; action: string; entityType: string; entityId: string; details: unknown }

export default function SecurityPage() {
  const events = useLoad<{ items: Event[] }>('admin/security-events');
  const audit = useLoad<{ items: Audit[] }>('admin/audit-log');
  return (
    <>
      <Section title="Admin audit log">
        <ErrorNote error={audit.error} />
        <Table rows={audit.data?.items} columns={[
          { header: 'When', cell: (a) => when(a.occurredAt) },
          { header: 'Who', cell: (a) => a.actorEmail ?? 'system' },
          { header: 'Action', cell: (a) => a.action },
          { header: 'Entity', cell: (a) => `${a.entityType} ${a.entityId.slice(0, 8)}` },
          { header: 'Details', cell: (a) => <code>{JSON.stringify(a.details)}</code> },
        ]} />
      </Section>
      <Section title="Authentication events">
        <ErrorNote error={events.error} />
        <Table rows={events.data?.items} columns={[
          { header: 'When', cell: (e) => when(e.occurredAt) },
          { header: 'Event', cell: (e) => e.type },
          { header: 'User', cell: (e) => e.email ?? '—' },
          { header: 'IP', cell: (e) => e.ip ?? '—' },
          { header: 'Device', cell: (e) => <span className="muted">{e.userAgent?.slice(0, 60) ?? '—'}</span> },
        ]} />
      </Section>
    </>
  );
}
