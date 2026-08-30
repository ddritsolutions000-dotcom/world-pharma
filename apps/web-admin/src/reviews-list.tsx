'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  NetworkErrorState,
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

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network';

export function ReviewsModerationList() {
  const { getAccessToken } = useSession();
  const [reviews, setReviews] = useState<ReviewModerationRow[]>([]);
  const [questions, setQuestions] = useState<QuestionModerationRow[]>([]);
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [countryCode, setCountryCode] = useState('XX');
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
      const [reviewBody, questionBody] = await Promise.all([
        listReviewModeration(token, countryCode, statusFilter || undefined),
        listQuestionModeration(token, countryCode, statusFilter || undefined),
      ]);
      setReviews(reviewBody.data ?? []);
      setQuestions(questionBody.data ?? []);
      setViewState('idle');
    } catch (err) {
      if (err instanceof ReviewsApiError && err.status === 403) {
        setViewState('forbidden');
        return;
      }
      setViewState('network');
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
  if (viewState === 'network' && reviews.length === 0 && questions.length === 0) {
    return <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />;
  }

  return (
    <div className="wp-stack">
      <Heading level={1}>Product reviews & Q&A</Heading>
      <Text tone="secondary">
        Moderate commerce product reviews and Q&A. Operational metadata only — no clinical moderation workflows.
      </Text>
      {actionError ? <Text tone="secondary">{actionError}</Text> : null}
      <Card>
        <div className="wp-stack">
          <FormField label="Country code">
            {({ id }) => (
              <Input
                id={id}
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
              />
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
      </Card>

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
