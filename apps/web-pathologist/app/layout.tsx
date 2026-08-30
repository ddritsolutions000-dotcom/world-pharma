import type { ReactNode } from 'react';
import { AppProviders } from '../src/providers';
import './globals.css';

export const metadata = {
  title: 'World Pharma Pathologist',
  description: 'Pathologist worklist and digital report signing (sandbox)',
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
