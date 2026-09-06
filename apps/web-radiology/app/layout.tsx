import type { ReactNode } from 'react';
import { AppProviders } from '../src/providers';
import '../src/shell.css';
import './globals.css';

export const metadata = {
  title: 'World Pharma Radiology',
  description: 'Imaging center organization operations (radiology foundation)',
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
