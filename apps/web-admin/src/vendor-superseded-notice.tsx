'use client';

import { Card, EmptyState, Heading, Text } from '@world-pharma/ui-kit/web';

/** Vendor routes in web-admin are superseded by the standalone apps/web-vendor app (port 3004). */
export function VendorSupersededNotice(props: { module: string }) {
  return (
    <section className="wp-stack">
      <Heading level={2}>{props.module}</Heading>
      <Text tone="secondary">
        This admin route is retained for compatibility only. Use the standalone vendor app at{' '}
        <code>apps/web-vendor</code> (dev port 3004) for seller operations.
      </Text>
      <Card>
        <EmptyState
          title="Moved to web-vendor"
          description="Run pnpm --filter @world-pharma/web-vendor dev and sign in with OTP (customer audience)."
        />
      </Card>
    </section>
  );
}
