import type { ReactNode } from 'react';
import { AppProviders } from '../src/providers';
import '../src/shell.css';

export const metadata = {
  title: 'World Pharma · Doctor Portal',
  description: 'Consultations, appointments, prescriptions, and patient inbox.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <body className="wp-portal-site doctor-body">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
