'use client';

import { useEffect, useState } from 'react';
import { useCountries } from '@world-pharma/shell-web';
import { Badge, Button, Card, EmptyState, FormField, Heading, Input, Text, TextArea } from '@world-pharma/ui-kit/web';
import { useSession } from '@world-pharma/shell-web';
import {
  addCartItem,
  addWishlistItem,
  fetchItemRecommendations,
  fetchOwnProductReview,
  fetchProductQuestions,
  fetchProductReviews,
  recordProductViewed,
  submitProductQuestion,
  submitProductReview,
  type ProductQuestion,
  type ProductReview,
  type RecommendationProduct,
} from './commerce-api';
import { fetchProduct as fetchProduct, type CatalogProduct } from './store-api';

type Tab = 'details' | 'reviews' | 'qa';

export function ProductDetail({ slug }: { slug: string }) {
  const { countries } = useCountries();
  const country = countries[0]?.iso_alpha2 ?? 'XX';
  const { session, getAccessToken } = useSession();
  const [product, setProduct] = useState<CatalogProduct | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('details');
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [questions, setQuestions] = useState<ProductQuestion[]>([]);
  const [ownReview, setOwnReview] = useState<ProductReview | null>(null);
  const [cartMessage, setCartMessage] = useState<string | null>(null);
  const [wishlistMessage, setWishlistMessage] = useState<string | null>(null);
  const [ugcMessage, setUgcMessage] = useState<string | null>(null);
  const [ugcError, setUgcError] = useState<string | null>(null);
  const [rating, setRating] = useState('5');
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewBody, setReviewBody] = useState('');
  const [questionBody, setQuestionBody] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<RecommendationProduct[]>([]);
  const [boughtTogether, setBoughtTogether] = useState<RecommendationProduct[]>([]);

  useEffect(() => {
    void fetchProduct(country, slug).then(setProduct);
  }, [country, slug]);

  useEffect(() => {
    if (!product?.id) {
      return;
    }
    void fetchItemRecommendations(product.id, country)
      .then((res) => {
        if (res.country_enabled) {
          setRelatedProducts(res.sections.related.data);
          setBoughtTogether(res.sections.frequently_bought_together.data);
        }
      })
      .catch(() => undefined);
  }, [country, product?.id]);

  useEffect(() => {
    if (!product?.id) {
      return;
    }
    setLoadError(null);
    void Promise.all([
      fetchProductReviews(product.id, country),
      fetchProductQuestions(product.id, country),
    ])
      .then(([reviewRes, questionRes]) => {
        setReviews(reviewRes.data ?? []);
        setQuestions(questionRes.data ?? []);
      })
      .catch(() => setLoadError('Could not load reviews or Q&A.'));
    const token = getAccessToken();
    if (token) {
      void recordProductViewed(token, product.id, country).catch(() => undefined);
      void fetchOwnProductReview(token, product.id, country)
        .then((res) => setOwnReview(res.review))
        .catch(() => undefined);
    }
  }, [country, getAccessToken, product?.id]);

  if (product === undefined) {
    return <Text>Loading product…</Text>;
  }
  if (!product) {
    return (
      <EmptyState title="Product not available" description="This listing is unpublished or not enabled in this country." />
    );
  }
  const offer = product.offers[0];
  return (
    <article className="store-pdp">
      <Heading level={1}>{product.title}</Heading>
      {product.rx_required ? <Badge kind="rx">Prescription metadata</Badge> : null}
      <Text tone="secondary">{product.brand} · {product.category}</Text>
      <div className="wp-inline-actions">
        <Button variant={tab === 'details' ? 'primary' : 'secondary'} onClick={() => setTab('details')}>
          Details
        </Button>
        <Button variant={tab === 'reviews' ? 'primary' : 'secondary'} onClick={() => setTab('reviews')}>
          Reviews ({reviews.length})
        </Button>
        <Button variant={tab === 'qa' ? 'primary' : 'secondary'} onClick={() => setTab('qa')}>
          Q&A ({questions.length})
        </Button>
      </div>

      {tab === 'details' ? (
        <>
          <Text>{product.description}</Text>
          <Card>
            <Text>
              {offer?.price ? `${offer.currency} ${offer.price.sell_minor}` : 'Price unavailable'}
            </Text>
            <Text size="caption">
              Seller {offer?.seller_display_name ?? offer?.seller_org_id ?? '—'}
            </Text>
            <Text size="caption">{product.inventory?.available ? 'Available' : 'Unavailable'}</Text>
            {session.status === 'authenticated' && offer ? (
              <>
                <Button
                  onClick={() => {
                    const token = getAccessToken();
                    if (!token) {
                      return;
                    }
                    void addCartItem(token, country, offer.id, 1, `pdp-${offer.id}-${Date.now()}`)
                      .then(() => setCartMessage('Added to cart'))
                      .catch((err: { code?: string; message?: string }) =>
                        setCartMessage(err.code === 'CART_SELLER_CONFLICT' ? 'Seller conflict' : (err.message ?? 'Could not add')),
                      );
                  }}
                >
                  Add to cart
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const token = getAccessToken();
                    if (!token) {
                      return;
                    }
                    void addWishlistItem(token, country, offer.id)
                      .then(() => setWishlistMessage('Saved to wishlist'))
                      .catch((err: { message?: string }) => setWishlistMessage(err.message ?? 'Could not save'));
                  }}
                >
                  Save to wishlist
                </Button>
              </>
            ) : (
              <Text size="caption">Sign in to add this item to your cart.</Text>
            )}
            {cartMessage ? <Text size="caption">{cartMessage}</Text> : null}
            {wishlistMessage ? <Text size="caption">{wishlistMessage}</Text> : null}
          </Card>
          {relatedProducts.length ? (
            <Card>
              <Heading level={3}>Related products</Heading>
              <ul className="wp-stack">
                {relatedProducts.map((item) => (
                  <li key={item.item_id}>
                    <a href={item.href}>{item.title}</a>
                    <Text size="caption">{item.brand_name} · {item.category_name}</Text>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {boughtTogether.length ? (
            <Card>
              <Heading level={3}>Frequently bought together</Heading>
              <ul className="wp-stack">
                {boughtTogether.map((item) => (
                  <li key={item.item_id}>
                    <a href={item.href}>{item.title}</a>
                    <Text size="caption">{item.brand_name}</Text>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      ) : null}

      {tab === 'reviews' ? (
        <div className="wp-stack">
          {loadError ? <Text tone="secondary">{loadError}</Text> : null}
          {reviews.length === 0 ? (
            <EmptyState title="No published reviews yet" description="Be the first verified purchaser to review this product." />
          ) : (
            reviews.map((review) => (
              <Card key={review.id}>
                <Text>{review.rating}/5 · {review.title || 'Review'}</Text>
                <Text>{review.body}</Text>
                {review.responses?.map((response) => (
                  <Text key={response.id} size="caption">Response: {response.body}</Text>
                ))}
              </Card>
            ))
          )}
          {session.status === 'authenticated' ? (
            ownReview ? (
              <Card>
                <Text>
                  Your review: {ownReview.status}
                  {ownReview.pending_moderation ? ' — pending moderation' : ''}
                  {ownReview.not_published ? ' — not published' : ''}
                </Text>
              </Card>
            ) : (
              <Card>
                <Heading level={3}>Write a review</Heading>
                <Text size="caption">Verified purchase required. Commerce feedback only — no medical advice.</Text>
                <FormField label="Rating (1-5)">
                  {({ id }) => <Input id={id} value={rating} onChange={(e) => setRating(e.target.value)} />}
                </FormField>
                <FormField label="Title (optional)">
                  {({ id }) => <Input id={id} value={reviewTitle} onChange={(e) => setReviewTitle(e.target.value)} />}
                </FormField>
                <FormField label="Review">
                  {({ id }) => (
                    <TextArea
                      id={id}
                      value={reviewBody}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReviewBody(e.target.value)}
                    />
                  )}
                </FormField>
                {ugcError ? <Text tone="secondary">{ugcError}</Text> : null}
                {ugcMessage ? <Text size="caption">{ugcMessage}</Text> : null}
                <Button
                  onClick={() => {
                    const token = getAccessToken();
                    if (!token) {
                      return;
                    }
                    setUgcError(null);
                    void submitProductReview(token, product.id, country, {
                      rating: Number(rating),
                      title: reviewTitle,
                      body: reviewBody,
                    })
                      .then((row) => {
                        setOwnReview(row as ProductReview);
                        setUgcMessage('Review submitted for moderation');
                      })
                      .catch((err: { message?: string }) => setUgcError(err.message ?? 'Could not submit review'));
                  }}
                >
                  Submit review
                </Button>
              </Card>
            )
          ) : (
            <Text size="caption">Sign in to submit a review.</Text>
          )}
        </div>
      ) : null}

      {tab === 'qa' ? (
        <div className="wp-stack">
          {loadError ? <Text tone="secondary">{loadError}</Text> : null}
          {questions.length === 0 ? (
            <EmptyState title="No published questions yet" description="Ask a product question — not for medical advice." />
          ) : (
            questions.map((q) => (
              <Card key={q.id}>
                <Text>{q.body}</Text>
                {q.answer_body ? <Text size="caption">A: {q.answer_body}</Text> : null}
              </Card>
            ))
          )}
          {session.status === 'authenticated' ? (
            <Card>
              <Heading level={3}>Ask a question</Heading>
              <Text size="caption">Product and packaging questions only — not clinical advice.</Text>
              <FormField label="Question">
                {({ id }) => (
                  <TextArea
                    id={id}
                    value={questionBody}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setQuestionBody(e.target.value)}
                  />
                )}
              </FormField>
              {ugcError ? <Text tone="secondary">{ugcError}</Text> : null}
              {ugcMessage ? <Text size="caption">{ugcMessage}</Text> : null}
              <Button
                onClick={() => {
                  const token = getAccessToken();
                  if (!token) {
                    return;
                  }
                  setUgcError(null);
                  void submitProductQuestion(token, product.id, country, questionBody)
                    .then(() => setUgcMessage('Question submitted for moderation'))
                    .catch((err: { message?: string }) => setUgcError(err.message ?? 'Could not submit question'));
                }}
              >
                Submit question
              </Button>
            </Card>
          ) : (
            <Text size="caption">Sign in to ask a question.</Text>
          )}
        </div>
      ) : null}
    </article>
  );
}
