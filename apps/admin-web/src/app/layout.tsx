import './globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Shell } from '../components/shell';

export const metadata: Metadata = { title: 'Flower Man Admin', robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
