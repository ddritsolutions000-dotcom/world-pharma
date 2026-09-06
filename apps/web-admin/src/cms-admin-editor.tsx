'use client';

import Link from 'next/link';
import { classifyAdminViewState } from './admin-http';
import { AdminViewLoadError } from './admin-request-error';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  FormField,
  Heading,
  Input,
  LoadingState,
  PermissionDeniedState,
  Select,
  Text,
  TextArea,
} from '@world-pharma/ui-kit/web';
import {
  DEFAULT_LANDING_DOCUMENT,
  parseLandingDocument,
  stringifyLandingDocument,
} from '@world-pharma/shared/site-page-blocks';
import {
  CMS_CONTENT_TYPES,
  CmsAdminApiError,
  archiveCmsContent,
  createCmsContent,
  fileToBase64,
  getCmsContent,
  isEditableStatus,
  publishCmsContent,
  reviseCmsContent,
  submitCmsReview,
  updateCmsContent,
  uploadCmsAsset,
  type CmsContentItem,
} from './cms-admin-api';
import { CmsLandingEditor } from './cms-landing-editor';
import { CmsJoinPageEditor } from './cms-join-page-editor';
import { workingCountry } from './working-country';
import { customerPageUrl } from './site-url';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'error';

export function CmsAdminCreate() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getAccessToken, session } = useSession();
  const countryCode = workingCountry(searchParams.get('country') ?? session.countryCode);
  const intent = searchParams.get('intent');
  const [slug, setSlug] = useState(() => searchParams.get('slug') ?? '');
  const [title, setTitle] = useState(() => searchParams.get('title') ?? '');
  const [summary, setSummary] = useState('');
  const [body, setBody] = useState('');
  const [locale, setLocale] = useState('en');
  const [contentType, setContentType] = useState(
    () => searchParams.get('type')?.toUpperCase() || 'ARTICLE',
  );
  const [categorySlug, setCategorySlug] = useState(
    () => searchParams.get('category') ?? (searchParams.get('type')?.toUpperCase() === 'ARTICLE' ? 'blog' : ''),
  );
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const canWrite = session.permissions.includes('cms:write');
  const lockType = intent === 'blog' || intent === 'legal' || intent === 'faq';

  if (!canWrite) {
    return <PermissionDeniedState />;
  }

  const onCreate = async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const created = await createCmsContent(token, {
        country_code: countryCode,
        slug,
        title,
        summary,
        body:
          contentType === 'LANDING'
            ? parseLandingDocument(body)
              ? body
              : stringifyLandingDocument(DEFAULT_LANDING_DOCUMENT)
            : body,
        locale,
        content_type: contentType,
        category_slug:
          categorySlug || (contentType === 'ARTICLE' ? 'blog' : contentType === 'LEGAL_NOTICE' ? 'legal' : undefined),
      });
      setMessage('Draft created.');
      router.push(`/cms/${created.id}?country=${countryCode}`);
    } catch (err) {
      if (err instanceof CmsAdminApiError) {
        setError(err.message);
      } else {
        setError('Create failed');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="wp-stack">
      <Heading level={1}>
        {intent === 'blog' ? 'Add blog post' : intent === 'legal' ? 'Add legal page' : intent === 'faq' ? 'Add FAQ' : 'Create CMS content'}
      </Heading>
      <div className="wp-toolbar">
        <Link href={intent === 'blog' ? `/cms/blog?country=${countryCode}` : `/cms?country=${countryCode}`}>
          <Button variant="secondary">Back</Button>
        </Link>
        <Link href={`/cms/legal?country=${countryCode}`}>
          <Button variant="tertiary">Legal pages</Button>
        </Link>
      </div>
      {intent === 'blog' ? (
        <Text tone="secondary">Slug becomes /blog/&#123;slug&#125; after you Publish. Keep category as blog.</Text>
      ) : null}
      <Card>
        <div className="wp-form-grid">
          <FormField label="Country">
            {({ id }) => <Input id={id} value={countryCode} readOnly />}
          </FormField>
          <FormField label="Content type">
            {({ id }) => (
              <Select
                id={id}
                value={contentType}
                disabled={lockType}
                onChange={(e) => setContentType(e.target.value)}
              >
                {CMS_CONTENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Slug (URL)">
            {({ id }) => (
              <Input id={id} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="my-health-guide" />
            )}
          </FormField>
          <FormField label="Locale">
            {({ id }) => <Input id={id} value={locale} onChange={(e) => setLocale(e.target.value)} />}
          </FormField>
          <FormField label="Category slug">
            {({ id }) => (
              <Input id={id} value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)} />
            )}
          </FormField>
          <FormField label="Title">
            {({ id }) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} />}
          </FormField>
        </div>
        <div className="wp-stack" style={{ marginTop: '1rem' }}>
          <FormField label="Summary">
            {({ id }) => <TextArea id={id} value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} />}
          </FormField>
          {contentType === 'LANDING' ? (
            <Text tone="secondary">
              LANDING drafts start with reusable blocks. After create, use the block editor (not raw HTML).
            </Text>
          ) : (
            <FormField label="Body">
              {({ id }) => <TextArea id={id} value={body} onChange={(e) => setBody(e.target.value)} rows={8} />}
            </FormField>
          )}
          {error ? <Text tone="secondary">{error}</Text> : null}
          {message ? <Text tone="secondary">{message}</Text> : null}
          <div className="wp-form-actions">
            <Button disabled={saving} onClick={() => void onCreate()}>
              {saving ? 'Creating…' : intent === 'blog' ? 'Create blog draft' : intent === 'faq' ? 'Create FAQ draft' : 'Create draft'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function CmsAdminEditor({ contentId }: { contentId: string }) {
  const searchParams = useSearchParams();
  const { getAccessToken, session } = useSession();
  const countryCode = workingCountry(searchParams.get('country') ?? session.countryCode);
  const [item, setItem] = useState<CmsContentItem | null>(null);
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [body, setBody] = useState('');
  const [categorySlug, setCategorySlug] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [assetMessage, setAssetMessage] = useState('');

  const canWrite = session.permissions.includes('cms:write');
  const canPublish = session.permissions.includes('cms:publish');
  const editable = item ? isEditableStatus(item.status) : false;

  const reload = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const row = await getCmsContent(token, contentId, countryCode);
      setItem(row);
      setTitle(row.title);
      setSummary(row.summary);
      setBody(row.body);
      setCategorySlug(row.category_slug ?? '');
      setViewState('idle');
    } catch (err) {
      if (err instanceof CmsAdminApiError) {
        if (err.status === 403) {
          setViewState('forbidden');
          return;
        }
        if (err.status === 404) {
          setViewState('error');
          return;
        }
      }
      setViewState(classifyAdminViewState(err));
    }
  }, [contentId, countryCode, getAccessToken]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const runAction = async (label: string, fn: () => Promise<CmsContentItem>) => {
    setBusy(true);
    setActionError('');
    setActionMessage('');
    try {
      const updated = await fn();
      setItem(updated);
      setTitle(updated.title);
      setSummary(updated.summary);
      setBody(updated.body);
      setActionMessage(`${label} succeeded.`);
    } catch (err) {
      if (err instanceof CmsAdminApiError) {
        setActionError(`${label} failed: ${err.message} (${err.status})`);
      } else {
        setActionError(`${label} failed`);
      }
    } finally {
      setBusy(false);
    }
  };

  const onSave = () => {
    const token = getAccessToken();
    if (!token || !item) {
      return;
    }
    void runAction('Save', () =>
      updateCmsContent(token, contentId, {
        country_code: countryCode,
        title,
        summary,
        body,
        category_slug: categorySlug,
        expected_version: item.version,
      }),
    );
  };

  const onAssetUpload = async (file: File | null) => {
    const token = getAccessToken();
    if (!token || !file) {
      return;
    }
    setAssetMessage('');
    try {
      const content_base64 = await fileToBase64(file);
      const result = await uploadCmsAsset(token, {
        country_code: countryCode,
        content_item_id: contentId,
        content_base64,
        content_type: file.type,
        original_name: file.name,
      });
      setAssetMessage(
        result.public_path
          ? `Uploaded. After this page is published, 3000 can load ${result.public_path}`
          : `Asset uploaded (${result.asset_id.slice(0, 8)}…).`,
      );
    } catch (err) {
      if (err instanceof CmsAdminApiError) {
        setAssetMessage(`Upload failed: ${err.message}`);
      } else {
        setAssetMessage('Upload failed');
      }
    }
  };

  if (viewState === 'loading') {
    return <LoadingState label="Loading CMS editor" />;
  }
  if (viewState === 'forbidden') {
    return <PermissionDeniedState />;
  }
  if (viewState === 'network' || viewState === 'error') {
    return (
      <div className="wp-stack">
        <AdminViewLoadError viewState={viewState} onRetry={() => void reload()} />
      </div>
    );
  }
  if (!item) {
    return <Text tone="secondary">Content not found.</Text>;
  }

  const landingDoc = item.content_type === 'LANDING' ? parseLandingDocument(body) : null;
  const joinPageSlug = item.slug?.startsWith('join-') ? item.slug : null;

  return (
    <div className="wp-stack">
      <Heading level={1}>{item.title}</Heading>
      <Text tone="secondary">
        Status: {item.status} · Type: {item.content_type} · Version: {item.version} · Published v
        {item.published_version}
      </Text>
      <Text tone="secondary">
        OD-CMS-01: submit for review, then a different operator with <code>cms:publish</code> publishes from IN_REVIEW.
        The publisher cannot be the same person who last edited the draft.
      </Text>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Link href={`/cms?country=${countryCode}`}>
          <Button variant="secondary">Back to list</Button>
        </Link>
        <Link href={`/cms/${contentId}/versions?country=${countryCode}`}>
          <Button variant="secondary">Version history</Button>
        </Link>
        {item.content_type === 'LANDING' && item.slug ? (
          <a href={customerPageUrl(`/l/${encodeURIComponent(item.slug)}`)} target="_blank" rel="noreferrer">
            <Button variant="secondary">Preview on 3000</Button>
          </a>
        ) : null}
        {item.content_type === 'ARTICLE' && item.slug ? (
          <a href={customerPageUrl(`/blog/${encodeURIComponent(item.slug)}`)} target="_blank" rel="noreferrer">
            <Button variant="secondary">Open blog URL</Button>
          </a>
        ) : null}
        {item.content_type === 'LEGAL_NOTICE' ? (
          <Link href={`/cms/legal?country=${countryCode}`}>
            <Button variant="secondary">All legal pages</Button>
          </Link>
        ) : null}
      </div>

      <Card>
        <div className="wp-stack">
          <FormField label="Title">
            {({ id }) => (
              <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} disabled={!editable || !canWrite} />
            )}
          </FormField>
          <FormField label="Summary">
            {({ id }) => (
              <TextArea
                id={id}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={3}
                disabled={!editable || !canWrite}
              />
            )}
          </FormField>
          {landingDoc ? (
            <CmsLandingEditor
              document={landingDoc}
              disabled={!editable || !canWrite}
              onChange={(next) => setBody(stringifyLandingDocument(next))}
            />
          ) : joinPageSlug ? (
            <CmsJoinPageEditor
              slug={joinPageSlug}
              body={body}
              disabled={!editable || !canWrite}
              onChange={setBody}
            />
          ) : (
            <FormField label="Body">
              {({ id }) => (
                <TextArea
                  id={id}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  disabled={!editable || !canWrite}
                />
              )}
            </FormField>
          )}
          <FormField label="Category slug">
            {({ id }) => (
              <Input
                id={id}
                value={categorySlug}
                onChange={(e) => setCategorySlug(e.target.value)}
                disabled={!editable || !canWrite}
              />
            )}
          </FormField>

          {!editable ? (
            <Text tone="secondary">Published/archived snapshots are immutable. Create a new revision via re-publish flow.</Text>
          ) : null}

          {canWrite && editable ? (
            <Button variant="secondary" disabled={busy} onClick={onSave}>
              Save draft
            </Button>
          ) : null}
        </div>
      </Card>

      <Card>
        <Heading level={3}>Workflow</Heading>
        <div className="wp-stack">
          {canWrite && item.status === 'DRAFT' ? (
            <Button
              disabled={busy}
              onClick={() => {
                const token = getAccessToken();
                if (!token) return;
                void runAction('Submit review', () => submitCmsReview(token, contentId, countryCode));
              }}
            >
              Submit for review
            </Button>
          ) : null}

          {canPublish && item.status === 'IN_REVIEW' ? (
            <Button
              disabled={busy}
              onClick={() => {
                const token = getAccessToken();
                if (!token) return;
                void runAction('Publish', () =>
                  publishCmsContent(token, contentId, countryCode, `pub-${contentId}-${item.version}`),
                );
              }}
            >
              Publish to customer 3000
            </Button>
          ) : null}

          {canWrite && item.status === 'PUBLISHED' ? (
            <Button
              disabled={busy}
              variant="secondary"
              onClick={() => {
                const token = getAccessToken();
                if (!token) return;
                void runAction('Open new draft', () => reviseCmsContent(token, contentId, countryCode));
              }}
            >
              Open new draft
            </Button>
          ) : null}

          {canPublish && (item.status === 'PUBLISHED' || item.status === 'ARCHIVED') ? (
            <>
              {item.status === 'PUBLISHED' ? (
                <Button
                  disabled={busy}
                  onClick={() => {
                    const token = getAccessToken();
                    if (!token) return;
                    void runAction('Archive', () => archiveCmsContent(token, contentId, countryCode));
                  }}
                >
                  Archive
                </Button>
              ) : null}
              {item.status === 'ARCHIVED' ? (
                <Button
                  disabled={busy}
                  onClick={() => {
                    const token = getAccessToken();
                    if (!token) return;
                    void runAction('Re-publish', () =>
                      publishCmsContent(token, contentId, countryCode, `repub-${contentId}-${Date.now()}`),
                    );
                  }}
                >
                  Re-publish
                </Button>
              ) : null}
            </>
          ) : null}

          {!canPublish && item.status === 'IN_REVIEW' ? (
            <Text tone="secondary">Publish requires cms:publish permission.</Text>
          ) : null}

          {actionMessage ? <Text tone="secondary">{actionMessage}</Text> : null}
          {actionError ? <Text tone="secondary">{actionError}</Text> : null}
        </div>
      </Card>

      {canWrite ? (
        <Card>
          <Heading level={3}>Media asset</Heading>
          <Text tone="secondary">
            JPEG/PNG/WebP/GIF (max 5 MB). KYC/medical files never go here. After publish, banner images appear on customer
            3000 via Help media — not a public dump of the private object store.
          </Text>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => void onAssetUpload(e.target.files?.[0] ?? null)}
          />
          {assetMessage ? <Text tone="secondary">{assetMessage}</Text> : null}
        </Card>
      ) : null}
    </div>
  );
}
