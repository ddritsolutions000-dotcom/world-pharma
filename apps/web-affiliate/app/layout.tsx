import type { ReactNode } from 'react';
import { AppProviders } from '../src/providers';
import '../src/shell.css';

export const metadata = {
  title: 'World Pharma Affiliate',
  description: 'Affiliate referral dashboard',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <body className="wp-affiliate-site">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
