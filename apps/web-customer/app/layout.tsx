import type { ReactNode } from 'react';
import { AppProviders } from '../src/providers';
import '../src/shell.css';
import '../src/store.css';

export const metadata = {
  title: 'World Pharma',
  description: 'Customer application shell — no product journeys yet',
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
