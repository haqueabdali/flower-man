'use client';

import type { ReactNode } from 'react';

export function Section({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <header className="card-header">
        <h2>{title}</h2>
        <div className="row">{actions}</div>
      </header>
      {children}
    </section>
  );
}

export interface Column<T> {
  readonly header: string;
  readonly cell: (row: T) => ReactNode;
}

export function Table<T>({ rows, columns, empty = 'Nothing here yet.' }: { rows: readonly T[] | undefined; columns: readonly Column<T>[]; empty?: string }) {
  if (!rows) return <p className="muted">Loading…</p>;
  if (rows.length === 0) return <p className="muted">{empty}</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((column) => <th key={column.header}>{column.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>{columns.map((column) => <td key={column.header}>{column.cell(row)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  return error ? <p className="error">{error}</p> : null;
}

export function Badge({ value }: { value: string }) {
  return <span className={`badge badge-${value.toLowerCase()}`}>{value.replaceAll('_', ' ')}</span>;
}

export function StatusFilter({ value, options, onChange }: { value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">All</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  );
}
