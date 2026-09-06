'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FormField, Input, TextArea } from '@world-pharma/ui-kit/web';
import {
  fetchOwnProductReview,
  submitProductReview,
  type ProductReview,
} from './commerce-api';
import { useSelectedCountry } from './use-selected-country';
import { MgBtn } from './ui/mg-ui';

type OrderReviewItem = {
  id: string;
  title?: string;
  sku: string;
  catalog_item_id?: string | null;
  product_slug?: string | null;
};

export function OrderItemReviewPanel({
  token,
  orderId,
  items,
}: {
  token: string;
  orderId: string;
  items: OrderReviewItem[];
}) {
  const { country } = useSelectedCountry();
  const reviewable = items.filter((row) => row.catalog_item_id);
  const [reviews, setReviews] = useState<Record<string, ProductReview | null>>({});
  const [rating, setRating] = useState<Record<string, number>>({});
  const [title, setTitle] = useState<Record<string, string>>({});
  const [body, setBody] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!country || !reviewable.length) {
      return;
    }
    let cancelled = false;
    void Promise.all(
      reviewable.map(async (item) => {
        const catalogItemId = item.catalog_item_id!;
        try {
          const res = await fetchOwnProductReview(token, catalogItemId, country);
          return [catalogItemId, res.review] as const;
        } catch {
          return [catalogItemId, null] as const;
        }
      }),
    ).then((rows) => {
      if (cancelled) {
        return;
      }
      const next: Record<string, ProductReview | null> = {};
      for (const [id, review] of rows) {
        next[id] = review;
      }
      setReviews(next);
    });
    return () => {
      cancelled = true;
    };
  }, [country, reviewable, token]);

  if (!reviewable.length) {
    return null;
  }

  async function submit(item: OrderReviewItem) {
    const catalogItemId = item.catalog_item_id;
    if (!catalogItemId || !country) {
      return;
    }
    const stars = rating[catalogItemId] ?? 0;
    const reviewBody = (body[catalogItemId] ?? '').trim();
    if (stars < 1 || stars > 5 || reviewBody.length < 8) {
      setMessage('Choose 1–5 stars and write at least 8 characters.');
      return;
    }
    setBusyId(catalogItemId);
    setMessage(null);
    try {
      const created = (await submitProductReview(token, catalogItemId, country, {
        rating: stars,
        title: title[catalogItemId]?.trim() || undefined,
        body: reviewBody,
      })) as ProductReview;
      setReviews((prev) => ({ ...prev, [catalogItemId]: created }));
      setMessage('Review submitted. It may appear after moderation.');
    } catch (err) {
      setMessage((err as { message?: string }).message ?? 'Review could not be submitted.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mg-order-reviews">
      <h2 className="mg-section-title">Rate your products</h2>
      <p className="mg-text-muted">
        Reviews are linked to this order ({orderId.slice(0, 8)}…). Only verified purchases can review; one review per
        product per market.
      </p>
      {message ? <p className="mg-form-message">{message}</p> : null}
      <ul className="mg-order-list">
        {reviewable.map((item) => {
          const catalogItemId = item.catalog_item_id!;
          const existing = reviews[catalogItemId];
          const label = item.title ?? item.sku;
          return (
            <li key={item.id} className="mg-order-review-item">
              <div className="mg-list-item">
                <span>{label}</span>
                {item.product_slug ? (
                  <Link href={`/p/${item.product_slug}`} className="mg-text-link">
                    View product
                  </Link>
                ) : null}
              </div>
              {existing ? (
                <div className="mg-review-existing">
                  <p>
                    <strong>{existing.rating}★</strong>
                    {existing.title ? ` · ${existing.title}` : ''}
                  </p>
                  <p className="mg-text-muted">{existing.body}</p>
                  <p className="mg-text-muted">
                    {existing.published
                      ? 'Published'
                      : existing.pending_moderation
                        ? 'Pending moderation'
                        : existing.status?.replaceAll('_', ' ').toLowerCase() ?? 'Submitted'}
                  </p>
                </div>
              ) : (
                <div className="mg-review-form">
                  <FormField label="Rating">
                    {({ id }) => (
                      <select
                        id={id}
                        value={rating[catalogItemId] ?? ''}
                        onChange={(e) =>
                          setRating((prev) => ({ ...prev, [catalogItemId]: Number(e.target.value) }))
                        }
                      >
                        <option value="">Select stars</option>
                        {[5, 4, 3, 2, 1].map((n) => (
                          <option key={n} value={n}>
                            {n} star{n === 1 ? '' : 's'}
                          </option>
                        ))}
                      </select>
                    )}
                  </FormField>
                  <FormField label="Title (optional)">
                    {({ id }) => (
                      <Input
                        id={id}
                        value={title[catalogItemId] ?? ''}
                        onChange={(e) => setTitle((prev) => ({ ...prev, [catalogItemId]: e.target.value }))}
                      />
                    )}
                  </FormField>
                  <FormField label="Review">
                    {({ id }) => (
                      <TextArea
                        id={id}
                        rows={3}
                        value={body[catalogItemId] ?? ''}
                        onChange={(e) => setBody((prev) => ({ ...prev, [catalogItemId]: e.target.value }))}
                      />
                    )}
                  </FormField>
                  <MgBtn
                    size="sm"
                    disabled={busyId === catalogItemId}
                    onClick={() => void submit(item)}
                  >
                    Submit review
                  </MgBtn>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
