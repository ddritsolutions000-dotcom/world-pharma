'use client';

import Link from 'next/link';
import { AdminRequestError } from './admin-request-error';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  Heading,
  Input,
  LoadingState,
  PermissionDeniedState,
  Text,
} from '@world-pharma/ui-kit/web';
import { CmsAdminApiError, fileToBase64, listCmsAssets, updateCmsAsset, uploadCmsAsset, type CmsAssetResponse } from './cms-admin-api';
import { adminApiRoot } from './admin-http';
import { workingCountry } from './working-country';

export function CmsMediaLibrary() {
  const { getAccessToken, session } = useSession();
  const country = workingCountry(session.countryCode);
  const [rows, setRows] = useState<CmsAssetResponse[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [folderFilter, setFolderFilter] = useState('');
  const [uploadFolder, setUploadFolder] = useState('banners');
  const [folderDrafts, setFolderDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [altDrafts, setAltDrafts] = useState<Record<string, string>>({});
  const canWrite = session.permissions.includes('cms:write');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const body = await listCmsAssets(token, country);
      const data = body.data ?? [];
      setRows(data);
      setAltDrafts(Object.fromEntries(data.map((row) => [row.asset_id, row.alt_text ?? ''])));
      setFolderDrafts(Object.fromEntries(data.map((row) => [row.asset_id, row.folder ?? ''])));
    } catch (err) {
      if (err instanceof CmsAdminApiError && err.status === 403) {
        setRows([]);
      } else {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [country, getAccessToken]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [load, session.status]);

  const folders = useMemo(() => {
    const names = new Set<string>();
    for (const row of rows) {
      if (row.folder) {
        names.add(row.folder);
      }
    }
    return [...names].sort();
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (folderFilter && (row.folder ?? '') !== folderFilter) {
        return false;
      }
      if (!q) {
        return true;
      }
      return [row.asset_id, row.content_type, row.public_path, row.folder]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [folderFilter, query, rows]);

  const onUpload = async (file: File | null) => {
    const token = getAccessToken();
    if (!token || !file) {
      return;
    }
    setMessage('');
    try {
      const content_base64 = await fileToBase64(file);
      await uploadCmsAsset(token, {
        country_code: country,
        content_base64,
        content_type: file.type,
        original_name: file.name,
        folder: uploadFolder.trim() || undefined,
      });
      setMessage('Uploaded. Public URL appears after a linked CMS page is published.');
      await load();
    } catch (err) {
      setMessage(err instanceof CmsAdminApiError ? err.message : 'Upload failed');
    }
  };

  if (!session.permissions.includes('cms:read')) {
    return <PermissionDeniedState />;
  }
  if (loading && rows.length === 0) {
    return <LoadingState label="Loading CMS media" />;
  }

  const origin = adminApiRoot();

  return (
    <div className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>CMS media</Heading>
        <p className="wp-page-intro">
          Merchandising images only ({country}). KYC and medical documents never appear here.
        </p>
      </header>
      <div className="wp-toolbar">
        <Link href="/cms">
          <Button variant="secondary">Back to CMS</Button>
        </Link>
        <Input
          aria-label="Search media"
          placeholder="Search type, path, id"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Input
          aria-label="Filter by folder"
          placeholder="Filter folder"
          value={folderFilter}
          onChange={(event) => setFolderFilter(event.target.value)}
          list="cms-media-folders"
        />
        <datalist id="cms-media-folders">
          {folders.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        {canWrite ? (
          <Input
            aria-label="Upload folder"
            placeholder="Upload folder (e.g. banners)"
            value={uploadFolder}
            onChange={(event) => setUploadFolder(event.target.value)}
          />
        ) : null}
        {canWrite ? (
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            aria-label="Upload merchandising image"
            onChange={(event) => void onUpload(event.target.files?.[0] ?? null)}
          />
        ) : null}
      </div>
      {error ? <AdminRequestError error={error} onRetry={() => void load()} /> : null}
      {message ? <Text tone="secondary">{message}</Text> : null}
      {visible.length === 0 ? (
        <EmptyState title="No CMS images" description="Upload a JPEG/PNG/WebP, then attach and publish a CMS page." />
      ) : (
        <Card>
          <table className="wp-table">
            <thead>
              <tr>
                <th>Preview</th>
                <th>Folder</th>
                <th>Type</th>
                <th>Size</th>
                <th>Path</th>
                <th>Alt text</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.asset_id}>
                  <td>
                    {row.public_path ? (
                      <img src={`${origin}${row.public_path}`} alt={row.alt_text ?? ''} width={48} height={48} />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {canWrite ? (
                      <Input
                        aria-label={`Folder for ${row.asset_id}`}
                        value={folderDrafts[row.asset_id] ?? ''}
                        onChange={(event) =>
                          setFolderDrafts((current) => ({ ...current, [row.asset_id]: event.target.value }))
                        }
                      />
                    ) : (
                      row.folder ?? '—'
                    )}
                  </td>
                  <td>{row.content_type}</td>
                  <td>{row.byte_size}</td>
                  <td>
                    <code>{row.public_path ?? row.asset_id.slice(0, 8)}</code>
                  </td>
                  <td>
                    {canWrite ? (
                      <Input
                        aria-label={`Alt text for ${row.asset_id}`}
                        value={altDrafts[row.asset_id] ?? ''}
                        onChange={(event) =>
                          setAltDrafts((current) => ({ ...current, [row.asset_id]: event.target.value }))
                        }
                      />
                    ) : (
                      row.alt_text ?? '—'
                    )}
                  </td>
                  <td>
                    {canWrite ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          const token = getAccessToken();
                          if (!token) {
                            return;
                          }
                          void updateCmsAsset(token, row.asset_id, country, {
                            alt_text: altDrafts[row.asset_id] ?? '',
                            folder: folderDrafts[row.asset_id] ?? '',
                          })
                            .then(() => setMessage('Asset saved'))
                            .catch((err) =>
                              setMessage(err instanceof CmsAdminApiError ? err.message : 'Alt text save failed'),
                            );
                        }}
                      >
                        Save
                      </Button>
                    ) : null}
                    {row.public_path ? (
                      <Button
                        size="sm"
                        variant="tertiary"
                        onClick={() => void navigator.clipboard.writeText(`${origin}${row.public_path}`)}
                      >
                        Copy URL
                      </Button>
                    ) : (
                      <Text tone="secondary">Unpublished</Text>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
