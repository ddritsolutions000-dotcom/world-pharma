import type { ReactNode } from 'react';
import { AppProviders } from '../src/providers';
import './globals.css';

export const metadata = {
  title: 'World Pharma Radiologist',
  description: 'Radiologist worklist and interpretation sign-off (sandbox, R8-D)',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
