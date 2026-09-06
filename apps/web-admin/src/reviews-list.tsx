'use client';

import { useCallback, useEffect, useState } from 'react';
import { classifyAdminViewState } from './admin-http';
import { AdminViewLoadError } from './admin-request-error';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  LoadingState,
  PermissionDeniedState,
  Select,
  Text,
  TextArea,
} from '@world-pharma/ui-kit/web';
import {
  REVIEW_STATUSES,
  ReviewsApiError,
  listQuestionModeration,
  listReviewModeration,
  moderateQuestion,
  moderateReview,
  type QuestionModerationRow,
  type ReviewModerationRow,
} from './reviews-api';
import { workingCountry, MARKET_COUNTRY_CODES } from './working-country';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'error';

export function ReviewsModerationList() {
  const { getAccessToken, session } = useSession();
  const [reviews, setReviews] = useState<ReviewModerationRow[]>([]);
  const [questions, setQuestions] = useState<QuestionModerationRow[]>([]);
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [countryCode, setCountryCode] = useState(() => workingCountry(session.countryCode));
  const [statusFilter, setStatusFilter] = useState('SUBMITTED');
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setViewState('loading');
    setActionError(null);
    try {
      const [reviewResult, questionResult] = await Promise.allSettled([
        listReviewModeration(token, countryCode, statusFilter || undefined),
        listQuestionModeration(token, countryCode, statusFilter || undefined),
      ]);
      if (reviewResult.status === 'rejected' && questionResult.status === 'rejected') {
        const err = reviewResult.reason;
        if (err instanceof ReviewsApiError && err.status === 403) {
          setViewState('forbidden');
          return;
        }
        setViewState(classifyAdminViewState(err));
        return;
      }
      setReviews(reviewResult.status === 'fulfilled' ? (reviewResult.value.data ?? []) : []);
      setQuestions(questionResult.status === 'fulfilled' ? (questionResult.value.data ?? []) : []);
      setViewState('idle');
    } catch (err) {
      if (err instanceof ReviewsApiError && err.status === 403) {
        setViewState('forbidden');
        return;
      }
      setViewState(classifyAdminViewState(err));
    }
  }, [countryCode, getAccessToken, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function actReview(row: ReviewModerationRow, status: string) {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setActionError(null);
    try {
      await moderateReview(token, row.id, {
        country_code: countryCode,
        status,
        version: row.version,
        response_body: answerDrafts[row.id],
      });
      await load();
    } catch (err) {
      setActionError(err instanceof ReviewsApiError ? err.message : 'Moderation failed');
    }
  }

  async function actQuestion(row: QuestionModerationRow, status: string) {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setActionError(null);
    try {
      await moderateQuestion(token, row.id, {
        country_code: countryCode,
        status,
        version: row.version,
        answer_body: answerDrafts[row.id],
      });
      await load();
    } catch (err) {
      setActionError(err instanceof ReviewsApiError ? err.message : 'Moderation failed');
    }
  }

  if (viewState === 'loading' && reviews.length === 0 && questions.length === 0) {
    return <LoadingState label="Loading moderation queue" />;
  }
  if (viewState === 'forbidden') {
    return <PermissionDeniedState />;
  }

  return (
    <div className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Product reviews & Q&A</Heading>
        <p className="wp-page-intro">
          Moderate commerce product reviews and Q&A. Operational metadata only — no clinical moderation workflows.
        </p>
      </header>
      {actionError ? <p className="wp-text-muted">{actionError}</p> : null}
      <div className="wp-toolbar">
        <FormField label="Country">
          {({ id }) => (
            <Select id={id} value={countryCode} onChange={(e) => setCountryCode(workingCountry(e.target.value))}>
              {MARKET_COUNTRY_CODES.map((iso) => (
                <option key={iso} value={iso}>
                  {iso}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Status filter">
          {({ id }) => (
            <Select id={id} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {REVIEW_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <Button onClick={() => void load()}>Refresh</Button>
      </div>
      <AdminViewLoadError viewState={viewState} onRetry={() => void load()} />

      <Heading level={2}>Reviews</Heading>
      {reviews.length === 0 ? (
        <EmptyState title="No reviews in queue" description="Try another status filter or country." />
      ) : (
        reviews.map((row) => (
          <Card key={row.id}>
            <Text>
              {row.rating}/5 · {row.status} · item {row.catalog_item_id.slice(0, 8)}
            </Text>
            {row.title ? <Text>{row.title}</Text> : null}
            <Text>{row.body}</Text>
            <FormField label="Optional response">
              {({ id }) => (
                <TextArea
                  id={id}
                  value={answerDrafts[row.id] ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setAnswerDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))
                  }
                />
              )}
            </FormField>
            <div className="wp-inline-actions">
              <Button onClick={() => void actReview(row, 'APPROVED')}>Approve</Button>
              <Button variant="secondary" onClick={() => void actReview(row, 'REJECTED')}>
                Reject
              </Button>
            </div>
          </Card>
        ))
      )}

      <Heading level={2}>Questions</Heading>
      {questions.length === 0 ? (
        <EmptyState title="No questions in queue" description="Try another status filter or country." />
      ) : (
        questions.map((row) => (
          <Card key={row.id}>
            <Text>
              {row.status} · item {row.catalog_item_id.slice(0, 8)}
            </Text>
            <Text>{row.body}</Text>
            <FormField label="Answer (required to publish)">
              {({ id }) => (
                <TextArea
                  id={id}
                  value={answerDrafts[row.id] ?? row.answer_body ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setAnswerDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))
                  }
                />
              )}
            </FormField>
            <div className="wp-inline-actions">
              <Button onClick={() => void actQuestion(row, 'APPROVED')}>Approve</Button>
              <Button variant="secondary" onClick={() => void actQuestion(row, 'REJECTED')}>
                Reject
              </Button>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
