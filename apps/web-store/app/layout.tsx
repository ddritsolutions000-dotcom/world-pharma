import type { ReactNode } from 'react';
import { AppProviders } from '../src/providers';
import '../src/shell.css';

export const metadata = {
  title: 'World Pharma Store',
  description: 'Location-scoped store operations',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <body className="wp-store-site">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
