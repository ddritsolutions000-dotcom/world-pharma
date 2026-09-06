import type { ReactNode } from 'react';
import { AppProviders } from '../src/providers';
import '../src/shell.css';
import '../src/vendor-theme.css';
import './globals.css';

export const metadata = {
  title: 'World Pharma Vendor — Sell on the marketplace',
  description: 'Vendor seller program, join application, and seller workspace for marketplace operators.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <body className="wp-portal-site">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
