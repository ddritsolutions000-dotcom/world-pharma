import type { ReactNode } from 'react';
import { AppProviders } from '../src/providers';
import '../src/admin-theme.css';
import '../src/admin-shell.css';
import '../src/shell.css';

export const metadata = {
  title: 'World Pharma Admin',
  description: 'World Pharma company control plane: commerce, care, marketing, SEO, notifications, and governance.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" style={{ colorScheme: 'dark' }}>
      <body className="wp-admin-site">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
