'use client';

import type { ReactNode } from 'react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider defaultTheme="light">
      <SessionProvider initialAudience="customer">{children}</SessionProvider>
    </ThemeProvider>
  );
}
