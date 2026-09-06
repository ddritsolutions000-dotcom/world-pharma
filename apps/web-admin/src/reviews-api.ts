import { adminJson, AdminHttpError } from './admin-http';

export class ReviewsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ReviewsApiError';
  }
}

async function reviewsFetch(token: string, path: string, init?: RequestInit) {
  try {
    return await adminJson(token, path, init);
  } catch (err) {
    if (err instanceof AdminHttpError) {
      throw new ReviewsApiError(err.message, err.status);
    }
    throw new ReviewsApiError('request_failed', 0);
  }
}

export type ReviewModerationRow = {
  id: string;
  catalog_item_id: string;
  rating: number;
  title: string;
  body: string;
  status: string;
  version: number;
  created_at: string;
};

export type QuestionModerationRow = {
  id: string;
  catalog_item_id: string;
  body: string;
  answer_body: string | null;
  status: string;
  version: number;
  created_at: string;
};

export const REVIEW_STATUSES = ['SUBMITTED', 'APPROVED', 'REJECTED'] as const;

export function listReviewModeration(token: string, countryCode: string, status?: string) {
  const params = new URLSearchParams({ country_code: countryCode });
  if (status) {
    params.set('status', status);
  }
  return reviewsFetch(token, `/api/v1/admin/reviews/moderation?${params.toString()}`) as Promise<{
    data: ReviewModerationRow[];
  }>;
}

export function moderateReview(
  token: string,
  id: string,
  body: { country_code: string; status: string; version: number; response_body?: string },
) {
  return reviewsFetch(token, `/api/v1/admin/reviews/${id}?country_code=${encodeURIComponent(body.country_code)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function listQuestionModeration(token: string, countryCode: string, status?: string) {
  const params = new URLSearchParams({ country_code: countryCode });
  if (status) {
    params.set('status', status);
  }
  return reviewsFetch(token, `/api/v1/admin/questions/moderation?${params.toString()}`) as Promise<{
    data: QuestionModerationRow[];
  }>;
}

export function moderateQuestion(
  token: string,
  id: string,
  body: { country_code: string; status: string; version: number; answer_body?: string },
) {
  return reviewsFetch(token, `/api/v1/admin/questions/${id}?country_code=${encodeURIComponent(body.country_code)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
