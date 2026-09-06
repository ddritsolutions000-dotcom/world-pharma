'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { EmptyState, FormField, Input, LoadingState, Text, TextArea } from '@world-pharma/ui-kit/web';
import {
  addCartItem,
  addWishlistItem,
  fetchItemRecommendations,
  fetchOwnProductReview,
  fetchProductQuestions,
  fetchProductReviews,
  notifyCartChanged,
  recordProductViewed,
  submitProductQuestion,
  submitProductReview,
  type ProductQuestion,
  type ProductReview,
  type RecommendationProduct,
} from './commerce-api';
import { fetchCatalog, fetchProduct as fetchProduct, type CatalogProduct } from './store-api';
import { discountPercent, formatMoney } from './format-money';
import { MgBackLink, MgBtn, MgCard, Page, Section } from './ui/mg-ui';
import { useSelectedCountry } from './use-selected-country';
import { compositionHref } from './composition-index';
import { rememberProductSlug } from './recently-viewed-section';
import { addGuestCartLine } from './guest-cart';
import { cheapestOffer, distinctSellerCount, offersForPack, packLabel, uniquePackLabels, offerInStock, offerStockLabel, sellerSelectionReason, cheapestInStockOffer } from './marketplace-offers';
import { MedicineSubstitutesSection } from './medicine-substitutes-section';
import { ProductPdpPowerSections } from './product-pdp-power';
import { MarketplaceServiceabilityNote } from './marketplace-serviceability-note';
import { readStoredPostalCode } from './use-serviceability';

type Tab = 'details' | 'reviews' | 'qa';

const PDP_TRUST = [
  '✓ 100% genuine — licensed pharmacy partners',
  '✓ Secure packaging and cold-chain where required',
  '✓ Easy returns for damaged or wrong items',
] as const;

const PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480" role="img" aria-label="Medicine placeholder"><rect width="480" height="480" fill="#F7FAFC"/><text x="240" y="250" text-anchor="middle" fill="#1A365D" font-family="Inter,system-ui,sans-serif" font-size="28">Medicine</text></svg>',
  );

function pdpHref(item: RecommendationProduct): string {
  if (item.slug) return `/p/${encodeURIComponent(item.slug)}`;
  const href = item.href || '';
  if (href.startsWith('/products/')) return `/p/${href.slice('/products/'.length)}`;
  if (href.startsWith('/p/')) return href;
  return href || '/';
}

function RelatedGrid({
  title,
  items,
  images,
}: {
  title: string;
  items: RecommendationProduct[];
  images: Map<string, string>;
}) {
  if (!items.length) return null;
  return (
    <Section title={title}>
      <ul className="mg-product-grid">
        {items.map((item) => {
          const href = pdpHref(item);
          const image = item.image_url || images.get(item.slug) || PLACEHOLDER;
          return (
            <li key={item.item_id}>
              <article className="mg-product-card">
                <Link href={href} className="mg-product-link">
                  <div className="mg-product-img-wrap">
                    <img src={image} alt="" className="mg-product-img" loading="lazy" />
                  </div>
                  <div className="mg-product-body">
                    <p className="mg-product-brand">{item.brand_name}</p>
                    <p className="mg-product-name">{item.title}</p>
                  </div>
                </Link>
                <div className="mg-pdp-related-actions">
                  <MgBtn href={href} size="sm" variant="secondary">
                    View
                  </MgBtn>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function ProductDetail({ slug }: { slug: string }) {
  const { country, hydrated } = useSelectedCountry();
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
  const [catalogImages, setCatalogImages] = useState<Map<string, string>>(new Map());
  const [addingCart, setAddingCart] = useState(false);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);

  useEffect(() => {
    if (!hydrated || !country) {
      return;
    }
    setProduct(undefined);
    void fetchProduct(country, slug)
      .then((p) => {
        setProduct(p);
        setGalleryIndex(0);
        if (p?.slug) rememberProductSlug(p.slug);
        if (p?.offers?.length) {
          const cheapest = cheapestInStockOffer(p.offers) ?? cheapestOffer(p.offers);
          setSelectedOfferId(cheapest?.id ?? p.offers[0]?.id ?? null);
        }
      })
      .catch(() => setProduct(null));
  }, [country, slug, hydrated]);

  useEffect(() => {
    if (!product?.id) return;
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
    void fetchCatalog(country)
      .then((catalog) => {
        const next = new Map<string, string>();
        for (const item of catalog.data ?? []) {
          const url = item.assets?.[0]?.url;
          if (item.slug && url) next.set(item.slug, url);
        }
        setCatalogImages(next);
      })
      .catch(() => undefined);
  }, [country]);

  useEffect(() => {
    if (!product?.id) return;
    setLoadError(null);
    void Promise.all([fetchProductReviews(product.id, country), fetchProductQuestions(product.id, country)])
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
    return (
      <Page>
        <LoadingState label="Loading product" />
      </Page>
    );
  }
  if (!product) {
    return (
      <Page>
        <EmptyState
          title="Product not available"
          description="This listing is unpublished or not enabled in your country."
          action={{ label: 'Browse medicines', onClick: () => (window.location.href = '/') }}
        />
      </Page>
    );
  }

  const offers = product.offers ?? [];
  const assets = product.assets ?? [];
  const offer = offers.find((o) => o.id === selectedOfferId) ?? cheapestOffer(offers) ?? offers[0];
  const packOptions = uniquePackLabels(offers);
  const currentPack = offer ? packLabel(offer) : packOptions[0];
  const sellersForPack = offer && currentPack ? offersForPack(offers, currentPack) : [];
  const sellerCount = distinctSellerCount(offers);
  const attrs = product.attributes ?? {};
  const postal = readStoredPostalCode();
  const image = assets[galleryIndex]?.url?.trim() || assets[0]?.url?.trim() || PLACEHOLDER;
  const sellMinor = offer?.price?.sell_minor;
  const listMinor = offer?.price?.list_minor;
  const discount = sellMinor && listMinor ? discountPercent(sellMinor, listMinor) : null;
  const inStock = offerInStock(offer) || Boolean(product.inventory?.available);
  const selectionReason = sellerSelectionReason(offer, offers);

  async function handleAddToCart() {
    if (!offer) return;
    setAddingCart(true);
    setCartMessage(null);
    try {
      const token = getAccessToken();
      if (token) {
        await addCartItem(token, country, offer.id, 1, `pdp-${offer.id}-${Date.now()}`);
      } else {
        addGuestCartLine({
          offer_id: offer.id,
          qty: 1,
          title: product?.title ?? 'Item',
          currency: offer.currency,
          sell_minor: String(offer.price?.sell_minor ?? '0'),
          country,
          seller_org_id: offer.seller_org_id,
          image_url: assets[0]?.url,
        });
        notifyCartChanged();
      }
      setCartMessage('Added to cart');
    } catch (err) {
      const e = err as { code?: string; message?: string };
      setCartMessage(e.code === 'CART_SELLER_CONFLICT' ? 'Your cart has items from another seller.' : (e.message ?? 'Could not add to cart'));
    } finally {
      setAddingCart(false);
    }
  }

  return (
    <Page>
      <MgBackLink href="/">Continue shopping</MgBackLink>
      <article className="mg-pdp">
        <div className="mg-pdp-grid">
          <div className="mg-pdp-gallery">
            <img
              src={image}
              alt={assets[galleryIndex]?.alt?.trim() || assets[0]?.alt?.trim() || `${product.title} product image`}
              className="mg-pdp-image"
              onError={(event) => {
                const el = event.currentTarget;
                if (el.src !== PLACEHOLDER) {
                  el.src = PLACEHOLDER;
                }
              }}
            />
            {assets.length > 1 ? (
              <div className="mg-pdp-thumbs" role="list">
                {assets.slice(0, 6).map((asset, index) => (
                  <button
                    key={`${asset.url}-${index}`}
                    type="button"
                    className={index === galleryIndex ? 'mg-pdp-thumb is-active' : 'mg-pdp-thumb'}
                    onClick={() => setGalleryIndex(index)}
                    aria-label={`Product image ${index + 1}`}
                  >
                    <img src={asset.url} alt="" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="mg-pdp-buybox">
            <p className="mg-pdp-brand">{product.brand ?? 'Trusted brand'}</p>
            <h1 className="mg-pdp-title">{product.title}</h1>
            {product.rx_required ? <span className="mg-rx-badge">Prescription required</span> : null}
            <div className="mg-pdp-pricing">
              {sellMinor ? <p className="mg-pdp-price">{formatMoney(sellMinor, offer?.currency)}</p> : null}
              {listMinor && sellMinor && listMinor !== sellMinor ? (
                <p className="mg-pdp-mrp">
                  {country === 'IN' ? 'MRP' : 'List'} {formatMoney(listMinor, offer?.currency)}
                </p>
              ) : null}
              {discount ? <span className="mg-pdp-discount">{discount}% off</span> : null}
            </div>
            {packOptions.length > 1 ? (
              <div className="mg-pack-picker">
                <p className="mg-text-muted">Select pack size</p>
                <div className="mg-pack-options">
                  {packOptions.map((pack) => (
                    <button
                      key={pack}
                      type="button"
                      className={pack === currentPack ? 'mg-pack-option is-active' : 'mg-pack-option'}
                      onClick={() => {
                        const next = cheapestOffer(offersForPack(offers, pack));
                        if (next) setSelectedOfferId(next.id);
                      }}
                    >
                      {pack}
                    </button>
                  ))}
                </div>
              </div>
            ) : offer?.pack_size ? (
              <p className="mg-text-muted">Pack: {offer.pack_size}</p>
            ) : null}
            {sellersForPack.length ? (
              <div className="mg-seller-box">
                <p className="mg-text-muted">
                  {sellerCount > 1
                    ? `${sellerCount} pharmacies sell this pack — compare price and stock before adding to cart`
                    : 'Sold by a licensed pharmacy partner'}
                </p>
                {sellerCount > 1 ? (
                  <div className="mg-seller-compare-head" aria-hidden="true">
                    <span>Pharmacy</span>
                    <span>Price</span>
                    <span>Stock</span>
                  </div>
                ) : null}
                <ul className="mg-seller-list">
                  {sellersForPack.map((row) => {
                    const rowSell = row.price?.sell_minor ? Number(row.price.sell_minor) : null;
                    const rowList = row.price?.list_minor ? Number(row.price.list_minor) : null;
                    const rowDiscount =
                      rowSell != null && rowList != null && rowList > rowSell
                        ? Math.round(((rowList - rowSell) / rowList) * 100)
                        : null;
                    return (
                      <li key={row.id}>
                        <button
                          type="button"
                          className={row.id === offer?.id ? 'mg-seller-option is-active' : 'mg-seller-option'}
                          onClick={() => setSelectedOfferId(row.id)}
                          aria-pressed={row.id === offer?.id}
                        >
                          <span className="mg-seller-name">
                            {row.seller_display_name ?? 'Partner pharmacy'}
                            {row.id === offer?.id ? ' · selected' : ''}
                          </span>
                          <strong className="mg-seller-price">
                            {row.price?.sell_minor ? formatMoney(row.price.sell_minor, row.currency) : 'Price on request'}
                            {rowDiscount ? (
                              <span className="mg-seller-discount"> {rowDiscount}% off</span>
                            ) : null}
                          </strong>
                          <span className="mg-seller-stock">{offerStockLabel(row)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
            {selectionReason ? <p className="mg-text-muted">{selectionReason}</p> : null}
            <MarketplaceServiceabilityNote countryCode={country} postalCode={postal} rxRequired={product.rx_required} />
            <p className="mg-text-muted">
              {inStock ? 'Selected offer is in stock' : 'Currently unavailable from selected pharmacy'}
              {offer?.sku ? ` · SKU ${offer.sku}` : ''}
              {offer?.strength ? ` · ${offer.strength}` : ''}
            </p>
            <div className="mg-pdp-actions">
              {offer && inStock ? (
                <>
                  <MgBtn onClick={() => void handleAddToCart()}>{addingCart ? 'Adding…' : 'Add to cart'}</MgBtn>
                  {session.status === 'authenticated' ? (
                    <MgBtn
                      variant="secondary"
                      onClick={() => {
                        const token = getAccessToken();
                        if (!token) return;
                        void addWishlistItem(token, country, offer.id)
                          .then(() => setWishlistMessage('Saved to wishlist'))
                          .catch((err: { message?: string }) => setWishlistMessage(err.message ?? 'Could not save'));
                      }}
                    >
                      Save for later
                    </MgBtn>
                  ) : (
                    <MgBtn href="/login?next=/cart" variant="secondary">
                      Sign in at checkout
                    </MgBtn>
                  )}
                </>
              ) : (
                <MgBtn variant="secondary" disabled>
                  Out of stock
                </MgBtn>
              )}
            </div>
            {cartMessage ? (
              <p className="mg-pdp-actions-hint">
                {cartMessage}
                {cartMessage === 'Added to cart' ? (
                  <>
                    {' '}
                    · <Link href="/cart">View cart</Link>
                  </>
                ) : null}
              </p>
            ) : null}
            {wishlistMessage ? <p className="mg-pdp-actions-hint">{wishlistMessage}</p> : null}
            {product.rx_required ? (
              <p className="mg-rx-notice">
                This medicine requires a valid prescription. Upload your Rx at checkout or from{' '}
                <Link href="/prescriptions">Upload Rx</Link>.
              </p>
            ) : null}
            <ul className="mg-pdp-trust">
              {PDP_TRUST.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mg-tabs" role="tablist" aria-label="Product information">
          <button type="button" role="tab" aria-selected={tab === 'details'} className={tab === 'details' ? 'mg-tab is-active' : 'mg-tab'} onClick={() => setTab('details')}>
            Details
          </button>
          <button type="button" role="tab" aria-selected={tab === 'reviews'} className={tab === 'reviews' ? 'mg-tab is-active' : 'mg-tab'} onClick={() => setTab('reviews')}>
            Reviews ({reviews.length})
          </button>
          <button type="button" role="tab" aria-selected={tab === 'qa'} className={tab === 'qa' ? 'mg-tab is-active' : 'mg-tab'} onClick={() => setTab('qa')}>
            Q&amp;A ({questions.length})
          </button>
        </div>

        {tab === 'details' ? (
          <div className="mg-pdp-panel">
            <MgCard flat>
              <p>{product.description || 'Quality medicine from a licensed pharmacy partner. See product information below for composition and usage.'}</p>
            </MgCard>
            {attrs.manufacturer_name ||
            attrs.country_of_manufacture ||
            attrs.composition ||
            attrs.highlights?.length ||
            attrs.usage_directions ||
            attrs.warnings ||
            attrs.storage ? (
              <MgCard>
                <h2 className="mg-section-title">Product information</h2>
                <div className="mg-pdp-info-grid">
                  {attrs.manufacturer_name ? (
                    <div className="mg-pdp-info-row">
                      <strong>Manufacturer</strong>
                      <span>{attrs.manufacturer_name}</span>
                    </div>
                  ) : null}
                  {attrs.composition ? (
                    <div className="mg-pdp-info-row">
                      <strong>Composition</strong>
                      <span>
                        {attrs.composition}{' '}
                        <Link href={compositionHref(attrs.composition)}>Find substitutes</Link>
                      </span>
                    </div>
                  ) : null}
                  {attrs.usage_directions ? (
                    <div className="mg-pdp-info-row">
                      <strong>Usage</strong>
                      <span>{attrs.usage_directions}</span>
                    </div>
                  ) : null}
                  {attrs.warnings ? (
                    <div className="mg-pdp-info-row">
                      <strong>Warnings</strong>
                      <span>{attrs.warnings}</span>
                    </div>
                  ) : null}
                  {attrs.storage ? (
                    <div className="mg-pdp-info-row">
                      <strong>Storage</strong>
                      <span>{attrs.storage}</span>
                    </div>
                  ) : null}
                </div>
                {attrs.highlights?.length ? (
                  <ul className="mg-prose mg-pdp-highlights">
                    {attrs.highlights.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </MgCard>
            ) : null}
            <MedicineSubstitutesSection itemId={product.id} itemName={product.title} images={catalogImages} />
            <ProductPdpPowerSections product={product} />
            <RelatedGrid title="Related products" items={relatedProducts} images={catalogImages} />
            <RelatedGrid title="Frequently bought together" items={boughtTogether} images={catalogImages} />
          </div>
        ) : null}

        {tab === 'reviews' ? (
          <div className="mg-pdp-panel">
            {loadError ? <Text tone="secondary">{loadError}</Text> : null}
            {reviews.length === 0 ? (
              <EmptyState title="No published reviews yet" description="Be the first verified purchaser to review this product." />
            ) : (
              <ul className="mg-order-list">
                {reviews.map((review) => (
                  <li key={review.id}>
                    <MgCard>
                      <p className="mg-list-title">
                        {review.rating}/5 · {review.title || 'Review'}
                      </p>
                      <p>{review.body}</p>
                      {review.responses?.map((response) => (
                        <p key={response.id} className="mg-text-muted">
                          Seller response: {response.body}
                        </p>
                      ))}
                    </MgCard>
                  </li>
                ))}
              </ul>
            )}
            {session.status === 'authenticated' ? (
              ownReview ? (
                <MgCard flat>
                  <Text>
                    Your review: {ownReview.status}
                    {ownReview.pending_moderation ? ' — pending moderation' : ''}
                    {ownReview.not_published ? ' — not published' : ''}
                  </Text>
                </MgCard>
              ) : (
                <MgCard>
                  <h2 className="mg-section-title">Write a review</h2>
                  <p className="mg-text-muted">Verified purchase required. Commerce feedback only — not medical advice.</p>
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
                  <div className="mg-toolbar">
                    <MgBtn
                      onClick={() => {
                        const token = getAccessToken();
                        if (!token) return;
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
                    </MgBtn>
                  </div>
                </MgCard>
              )
            ) : (
              <MgCard flat>
                <p className="mg-text-muted">
                  <Link href="/login">Sign in</Link> to submit a review.
                </p>
              </MgCard>
            )}
          </div>
        ) : null}

        {tab === 'qa' ? (
          <div className="mg-pdp-panel">
            {loadError ? <Text tone="secondary">{loadError}</Text> : null}
            {questions.length === 0 ? (
              <EmptyState title="No published questions yet" description="Ask about packaging, size, or availability — not for medical advice." />
            ) : (
              <ul className="mg-order-list">
                {questions.map((q) => (
                  <li key={q.id}>
                    <MgCard>
                      <p className="mg-list-title">Q: {q.body}</p>
                      {q.answer_body ? <p className="mg-text-muted">A: {q.answer_body}</p> : null}
                    </MgCard>
                  </li>
                ))}
              </ul>
            )}
            {session.status === 'authenticated' ? (
              <MgCard>
                <h2 className="mg-section-title">Ask a question</h2>
                <p className="mg-text-muted">Product and packaging questions only — not clinical advice.</p>
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
                <MgBtn
                  onClick={() => {
                    const token = getAccessToken();
                    if (!token) return;
                    setUgcError(null);
                    void submitProductQuestion(token, product.id, country, questionBody)
                      .then(() => setUgcMessage('Question submitted for moderation'))
                      .catch((err: { message?: string }) => setUgcError(err.message ?? 'Could not submit question'));
                  }}
                >
                  Submit question
                </MgBtn>
              </MgCard>
            ) : (
              <MgCard flat>
                <p className="mg-text-muted">
                  <Link href="/login">Sign in</Link> to ask a question.
                </p>
              </MgCard>
            )}
          </div>
        ) : null}
      </article>
    </Page>
  );
}
