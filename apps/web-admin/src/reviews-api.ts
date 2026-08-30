const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export class ReviewsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ReviewsApiError';
  }
}

async function parseJson(res: Response) {
  return res.json().catch(() => ({}));
}

async function reviewsFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ReviewsApiError((body.detail as string) ?? 'request_failed', res.status);
  }
  return body;
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
