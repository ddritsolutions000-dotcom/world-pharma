'use client';

import { useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { Text } from '@world-pharma/ui-kit/web';
import { createSupportTicket } from './account-api';
import { MgBtn, MgCard, MgInput, Page, PageIntro } from './ui/mg-ui';

export function PharmacistConsultPage() {
  const { session, getAccessToken, expire } = useSession();
  const [question, setQuestion] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = question.trim();
    if (!trimmed) {
      setMessage('Write your medicine question first.');
      return;
    }
    const token = getAccessToken();
    if (session.status !== 'authenticated' || !token) {
      window.location.href = '/login?next=/pharmacist';
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await createSupportTicket({
      token,
      onUnauthorized: expire,
      subject: 'Pharmacist consult',
      body: trimmed,
    });
    setBusy(false);
    if (result.ok) {
      setQuestion('');
      setMessage('Question sent to the pharmacist desk. Track it in Support.');
      return;
    }
    setMessage(result.error ?? 'Could not send. Try support tickets.');
  }

  return (
    <Page>
      <section className="mg-service-hero mg-service-hero--lab" aria-label="Ask a pharmacist">
        <p className="mg-service-kicker">Licensed partner pharmacists</p>
        <h1 className="mg-service-title">Ask a pharmacist</h1>
        <p className="mg-service-sub">
          Medicine use, pack sizes, and OTC advice — not a substitute for a doctor consult.
        </p>
      </section>
      <PageIntro>
        <p>
          Licensed partner pharmacists answer product questions. For diagnosis, side effects that worry you, or prescription
          changes, book a doctor instead.
        </p>
      </PageIntro>
      <MgCard>
        <h2 className="mg-section-title">Your question</h2>
        <MgInput value={question} onChange={setQuestion} placeholder="e.g. Can I take this with my BP medicine?" label="Question" />
        {message ? <Text tone="secondary">{message}</Text> : null}
        <div className="mg-toolbar">
          <MgBtn disabled={busy} onClick={() => void submit()}>
            {busy ? 'Sending…' : 'Send to pharmacist'}
          </MgBtn>
          <MgBtn href="/doctors" variant="secondary">
            Consult a doctor
          </MgBtn>
          <MgBtn href="/account/support" variant="ghost">
            My tickets
          </MgBtn>
        </div>
      </MgCard>
    </Page>
  );
}
