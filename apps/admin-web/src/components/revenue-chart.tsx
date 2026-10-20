'use client';

import { useState } from 'react';

import { euro } from '../lib/api';

interface Day {
  readonly date: string;
  readonly orders: number;
  readonly revenueMinor: number;
}

const dayLabel = (date: string, options: Intl.DateTimeFormatOptions) => new Date(`${date}T12:00:00`).toLocaleDateString('it-IT', options);

/** Daily revenue: one series, so no legend; hover (or keyboard focus) shows the day, revenue and orders. */
export function RevenueChart({ days }: { days: readonly Day[] }) {
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const max = Math.max(1, ...days.map((day) => day.revenueMinor));
  const ticks = [max, max / 2, 0];
  const labelEvery = Math.ceil(days.length / 7);
  const focused = active === null ? null : days[active];

  return (
    <div className="chart">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted">Revenue per day (paid orders, excluding cancelled and refunded)</span>
        <button type="button" className="secondary" onClick={() => setAsTable((value) => !value)}>{asTable ? 'Show chart' : 'Show table'}</button>
      </div>
      {asTable ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Day</th><th>Orders</th><th>Revenue</th></tr></thead>
            <tbody>
              {days.map((day) => (
                <tr key={day.date}><td>{dayLabel(day.date, { weekday: 'short', day: 'numeric', month: 'short' })}</td><td>{day.orders}</td><td>{euro(day.revenueMinor)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-body">
          <div className="chart-axis">{ticks.map((tick) => <span key={tick}>{euro(Math.round(tick))}</span>)}</div>
          <div className="chart-plot" onMouseLeave={() => setActive(null)}>
            {ticks.map((tick) => <div key={tick} className="chart-grid" style={{ bottom: `${(tick / max) * 100}%` }} />)}
            <div className="chart-bars">
              {days.map((day, index) => (
                <button
                  type="button"
                  key={day.date}
                  className={`chart-slot${active === index ? ' active' : ''}`}
                  aria-label={`${dayLabel(day.date, { day: 'numeric', month: 'long' })}: ${euro(day.revenueMinor)}, ${day.orders} orders`}
                  onMouseEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                >
                  <span className="chart-bar" style={{ height: day.revenueMinor > 0 ? `max(2px, ${(day.revenueMinor / max) * 100}%)` : 0 }} />
                </button>
              ))}
            </div>
            {focused && active !== null && (
              <div className="chart-tooltip" style={{ left: `${((active + 0.5) / days.length) * 100}%` }} role="status">
                <b>{dayLabel(focused.date, { weekday: 'long', day: 'numeric', month: 'long' })}</b>
                <span>{euro(focused.revenueMinor)}</span>
                <span className="muted">{focused.orders} {focused.orders === 1 ? 'order' : 'orders'}</span>
              </div>
            )}
          </div>
          <div />
          <div className="chart-labels">
            {days.map((day, index) => <span key={day.date}>{index % labelEvery === 0 || index === days.length - 1 ? dayLabel(day.date, { day: 'numeric', month: 'short' }) : ''}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}
