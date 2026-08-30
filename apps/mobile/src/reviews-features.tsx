import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  NativeButton,
  NativeCard,
  NativeEmptyState,
  NativeInput,
  NativeLoadingState,
  NativeNetworkErrorState,
  NativeText,
} from '@world-pharma/ui-kit/native';
import {
  fetchProductQuestions,
  fetchProductReviews,
  recordProductViewed,
  submitProductReview,
} from './commerce-api';
import type { FeatureCtx } from './customer-features';

export function ProductReviewsPanel({
  ctx,
  itemId,
  country,
}: {
  ctx: FeatureCtx;
  itemId: string;
  country: string;
}) {
  const [reviews, setReviews] = useState<Array<{ id: string; rating: number; body: string; title: string }>>([]);
  const [questions, setQuestions] = useState<Array<{ id: string; body: string; answer_body: string | null }>>([]);
  const [viewState, setViewState] = useState<'loading' | 'idle' | 'network'>('loading');
  const [rating, setRating] = useState('5');
  const [body, setBody] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setViewState('loading');
    try {
      const [reviewRes, questionRes] = await Promise.all([
        fetchProductReviews(itemId, country),
        fetchProductQuestions(itemId, country),
      ]);
      setReviews(reviewRes.data ?? []);
      setQuestions(questionRes.data ?? []);
      if (ctx.token) {
        await recordProductViewed(ctx.token, itemId, country).catch(() => undefined);
      }
      setViewState('idle');
    } catch {
      setViewState('network');
    }
  }, [country, ctx.token, itemId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (viewState === 'loading') {
    return <NativeLoadingState title="Loading reviews…" />;
  }
  if (viewState === 'network') {
    return <NativeNetworkErrorState onRetry={() => void load()} />;
  }

  return (
    <View style={{ gap: 12 }}>
      <NativeText variant="h2">Reviews</NativeText>
      {reviews.length === 0 ? (
        <NativeEmptyState title="No published reviews" description="Verified purchasers can submit after moderation." />
      ) : (
        reviews.map((review) => (
          <View key={review.id}>
            <NativeCard>
              <NativeText>{`${review.rating}/5 ${review.title || ''}`}</NativeText>
              <NativeText>{review.body}</NativeText>
            </NativeCard>
          </View>
        ))
      )}
      <NativeText variant="h2">Q&A</NativeText>
      {questions.length === 0 ? (
        <NativeEmptyState title="No published questions" description="Product questions only — not medical advice." />
      ) : (
        questions.map((q) => (
          <View key={q.id}>
            <NativeCard>
              <NativeText>{q.body}</NativeText>
              {q.answer_body ? <NativeText variant="caption">{`A: ${q.answer_body}`}</NativeText> : null}
            </NativeCard>
          </View>
        ))
      )}
      {ctx.token ? (
        <NativeCard>
          <NativeText variant="h2">Submit review (optional)</NativeText>
          <NativeInput label="Rating 1-5" value={rating} onChangeText={setRating} />
          <NativeInput label="Your review" value={body} onChangeText={setBody} />
          <NativeButton
            label="Submit for moderation"
            onPress={() => {
              void submitProductReview(ctx.token!, itemId, country, {
                rating: Number(rating),
                body,
              })
                .then(() => setMessage('Review submitted'))
                .catch((err: Error) => setMessage(err.message));
            }}
          />
          {message ? <NativeText variant="caption">{message}</NativeText> : null}
        </NativeCard>
      ) : null}
    </View>
  );
}
