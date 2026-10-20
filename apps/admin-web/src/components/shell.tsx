'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const NAV = [
  ['/', 'Dashboard'],
  ['/partners', 'Partners'],
  ['/users', 'Users'],
  ['/orders', 'Orders'],
  ['/deliveries', 'Deliveries'],
  ['/custom-requests', 'Custom requests'],
  ['/reviews', 'Reviews'],
  ['/payments', 'Payments'],
  ['/payouts', 'Earnings & payouts'],
  ['/zones', 'Service zones'],
  ['/security', 'Security & audit'],
  ['/privacy', 'Privacy requests'],
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/login') return <>{children}</>;
  const signOut = async () => {
    await fetch('/api/session', { method: 'DELETE', headers: { 'x-flowerman-admin': '1' } });
    window.location.href = '/login';
  };
  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="brand">🌸 Flower Man<small>Admin</small></div>
        {NAV.map(([href, label]) => (
          <Link key={href} href={href} className={pathname === href || (href !== '/' && pathname.startsWith(href)) ? 'active' : ''}>
            {label}
          </Link>
        ))}
        <button className="link" onClick={signOut}>Sign out</button>
      </nav>
      <main>{children}</main>
    </div>
  );
}
