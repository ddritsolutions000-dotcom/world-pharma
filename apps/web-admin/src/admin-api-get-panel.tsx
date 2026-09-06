'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminRequestError } from './admin-request-error';
import {
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  PermissionDeniedState,
} from '@world-pharma/ui-kit/web';
import { adminFetch } from './admin-http';
import { useSession } from '@world-pharma/shell-web';

export function AdminApiGetPanel({
  title,
  intro,
  path,
}: {
  title: string;
  intro: string;
  path: string;
}) {
  const { session, getAccessToken } = useSession();
  const [json, setJson] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    setDenied(false);
    try {
      const res = await adminFetch(token, path);
      setLoading(false);
      if (res.status === 403) {
        setDenied(true);
        return;
      }
      if (!res.ok) {
        setError(true);
        return;
      }
      setJson(JSON.stringify(await res.json(), null, 2));
    } catch (err) {
      setLoading(false);
      setError(err);
    }
  }, [getAccessToken, path]);

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin') {
      void load();
    }
  }, [load, session.audience, session.status]);

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }
  if (denied) {
    return <PermissionDeniedState />;
  }

  return (
    <section className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>{title}</Heading>
        <p className="wp-page-intro">{intro}</p>
      </header>
      <div className="wp-toolbar">
        <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
      {loading && !json ? <LoadingState label={`Loading ${title}`} /> : null}
      {error ? <AdminRequestError error={error} onRetry={() => void load()} /> : null}
      {json ? (
        <Card>
          <pre className="wp-admin-json">{json}</pre>
        </Card>
      ) : !loading && !error ? (
        <EmptyState title="No payload" description="API returned an empty body." />
      ) : null}
    </section>
  );
}
