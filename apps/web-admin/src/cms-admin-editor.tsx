'use client';

import Link from 'next/link';
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
  NetworkErrorState,
  PermissionDeniedState,
  Select,
  Text,
  TextArea,
} from '@world-pharma/ui-kit/web';
import {
  CMS_CONTENT_TYPES,
  CmsAdminApiError,
  archiveCmsContent,
  createCmsContent,
  fileToBase64,
  getCmsContent,
  isEditableStatus,
  publishCmsContent,
  submitCmsReview,
  updateCmsContent,
  uploadCmsAsset,
  type CmsContentItem,
} from './cms-admin-api';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'error';

export function CmsAdminCreate() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getAccessToken, session } = useSession();
  const countryCode = searchParams.get('country') ?? 'XX';
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [body, setBody] = useState('');
  const [locale, setLocale] = useState('en');
  const [contentType, setContentType] = useState('ARTICLE');
  const [categorySlug, setCategorySlug] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const canWrite = session.permissions.includes('cms:write');

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
        body,
        locale,
        content_type: contentType,
        category_slug: categorySlug || undefined,
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
      <Heading level={1}>Create CMS content</Heading>
      <Link href={`/cms?country=${countryCode}`}>
        <Button variant="secondary">Back to list</Button>
      </Link>
      <Card>
        <div className="wp-stack">
          <FormField label="Country">
            {({ id }) => <Input id={id} value={countryCode} readOnly />}
          </FormField>
          <FormField label="Content type">
            {({ id }) => (
              <Select id={id} value={contentType} onChange={(e) => setContentType(e.target.value)}>
                {CMS_CONTENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Slug">
            {({ id }) => <Input id={id} value={slug} onChange={(e) => setSlug(e.target.value)} />}
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
          <FormField label="Summary">
            {({ id }) => <TextArea id={id} value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} />}
          </FormField>
          <FormField label="Body">
            {({ id }) => <TextArea id={id} value={body} onChange={(e) => setBody(e.target.value)} rows={8} />}
          </FormField>
          {error ? <Text tone="secondary">{error}</Text> : null}
          {message ? <Text tone="secondary">{message}</Text> : null}
          <Button disabled={saving} onClick={() => void onCreate()}>
            {saving ? 'Creating…' : 'Create draft'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function CmsAdminEditor({ contentId }: { contentId: string }) {
  const searchParams = useSearchParams();
  const { getAccessToken, session } = useSession();
  const countryCode = searchParams.get('country') ?? 'XX';
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
      setViewState('network');
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
      setAssetMessage(`Asset uploaded (${result.asset_id.slice(0, 8)}…).`);
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
  if (viewState === 'network') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: () => void reload() }} />;
  }
  if (viewState === 'error' || !item) {
    return <Text tone="secondary">Content not found.</Text>;
  }

  return (
    <div className="wp-stack">
      <Heading level={1}>{item.title}</Heading>
      <Text tone="secondary">
        Status: {item.status} · Type: {item.content_type} · Version: {item.version} · Published v
        {item.published_version}
      </Text>
      <Text tone="secondary">
        OD-CMS-01: dual-control publish/review separation is not active. Users with <code>cms:publish</code> may
        publish directly after IN_REVIEW.
      </Text>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Link href={`/cms?country=${countryCode}`}>
          <Button variant="secondary">Back to list</Button>
        </Link>
        <Link href={`/cms/${contentId}/versions?country=${countryCode}`}>
          <Button variant="secondary">Version history</Button>
        </Link>
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
              Publish
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
          <Text tone="secondary">Upload JPEG/PNG/WebP/GIF (max 5 MB). Returns opaque asset reference only.</Text>
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
