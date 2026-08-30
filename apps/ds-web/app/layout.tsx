import type { ReactNode } from 'react';
import { ThemeProvider } from '@world-pharma/ui-kit/web';

export const metadata = {
  title: 'World Pharma Design System',
  description: 'Foundation playground — not a product surface',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider defaultTheme="light">{children}</ThemeProvider>
      </body>
    </html>
  );
}
