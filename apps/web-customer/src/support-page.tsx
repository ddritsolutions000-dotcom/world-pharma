'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  EmptyState,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
} from '@world-pharma/ui-kit/web';
import { createSupportTicket, fetchSupportTickets, type SupportTicket } from './account-api';
import { AccountPage } from './ui/account-hub-nav';
import { MgBtn, MgCard, MgInput, PageIntro } from './ui/mg-ui';

export function SupportScreen() {
  const { session, getAccessToken, signOut, expire } = useSession();
  const [rows, setRows] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [correlationOrderId, setCorrelationOrderId] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const onUnauthorized = useCallback(() => expire(), [expire]);

  const load = useCallback(() => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated') {
      return;
    }
    setLoading(true);
    void fetchSupportTickets({ token, onUnauthorized })
      .then((result) => {
        if (result.ok) {
          setRows(result.data.data ?? []);
          setError(null);
        } else if (result.kind === 'forbidden') {
          setError('forbidden');
        } else if (result.kind !== 'unauthorized') {
          setError('network');
        }
      })
      .finally(() => setLoading(false));
  }, [getAccessToken, onUnauthorized, session.status]);

  useEffect(() => {
    load();
  }, [load]);

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (session.status !== 'authenticated') {
    return (
      <AccountPage title="Support" subtitle="Get help with orders and account.">
        <PageIntro>
          <p>Open a ticket for order issues, refunds, or delivery problems. Include your order number for faster resolution.</p>
        </PageIntro>
        <EmptyState
          title="Sign in required"
          description="Sign in to contact support."
          action={{ label: 'Sign in', onClick: () => (window.location.href = '/login') }}
        />
        <MgBtn href="/help" variant="secondary">
          Browse help articles
        </MgBtn>
      </AccountPage>
    );
  }

  if (session.audience !== 'customer') {
    return <PermissionDeniedState />;
  }

  if (loading) {
    return (
      <AccountPage title="Support" subtitle="Get help with orders and account.">
        <LoadingState label="Loading support tickets" />
      </AccountPage>
    );
  }

  if (error === 'forbidden') {
    return <PermissionDeniedState />;
  }

  if (error === 'network') {
    return (
      <AccountPage title="Support" subtitle="Get help with orders and account.">
        <NetworkErrorState action={{ label: 'Retry', onClick: load }} />
      </AccountPage>
    );
  }

  async function submitTicket() {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const correlationLines = [
      correlationOrderId.trim() ? `order_id: ${correlationOrderId.trim()}` : null,
    ].filter(Boolean);
    const ticketBody =
      correlationLines.length > 0
        ? `${body.trim()}\n\n---\nReference:\n${correlationLines.join('\n')}`
        : body;
    const result = await createSupportTicket({ token, onUnauthorized, subject, body: ticketBody });
    if (result.ok) {
      setSubject('');
      setBody('');
      setCorrelationOrderId('');
      setMessage('Ticket submitted. We will respond soon.');
      load();
    } else {
      setMessage(result.error);
    }
  }

  return (
    <AccountPage title="Support" subtitle="Open a ticket for order or account help.">
      <PageIntro>
        <p>We typically respond within a few hours on business days. For urgent delivery issues, include your order ID below.</p>
      </PageIntro>
      {!rows.length ? (
        <EmptyState title="No tickets yet" description="You have not opened a support ticket." />
      ) : (
        <ul className="mg-order-list">
          {rows.map((row) => (
            <li key={row.id}>
              <MgCard className="mg-order-card">
                <div className="mg-order-card-top">
                  <div>
                    <p className="mg-list-title">{row.subject}</p>
                    <p className="mg-order-track-hint">
                      {row.status} · {new Date(row.created_at).toLocaleString()}
                    </p>
                    <p className="mg-list-meta">{row.body}</p>
                  </div>
                  <span className="mg-status">{row.status}</span>
                </div>
              </MgCard>
            </li>
          ))}
        </ul>
      )}

      <MgCard className="mg-form-card">
        <h2 className="mg-section-title">New ticket</h2>
        <label className="mg-field">
          <span className="mg-field-label">Subject</span>
          <MgInput value={subject} onChange={setSubject} placeholder="Brief summary" />
        </label>
        <label className="mg-field">
          <span className="mg-field-label">Message</span>
          <textarea
            className="mg-input"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Describe your issue"
            rows={4}
          />
        </label>
        <label className="mg-field">
          <span className="mg-field-label">Order ID (optional)</span>
          <MgInput value={correlationOrderId} onChange={setCorrelationOrderId} placeholder="ord-..." />
        </label>
        <MgBtn onClick={() => void submitTicket()}>Submit ticket</MgBtn>
      </MgCard>
      {message ? <p className="mg-page-subtitle">{message}</p> : null}
    </AccountPage>
  );
}
