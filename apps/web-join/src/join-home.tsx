'use client';

import { useEffect, useState } from 'react';
import { useSession, PortalAuthPage } from '@world-pharma/shell-web';
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
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  createApplication,
  fetchApplicationDocuments,
  fetchMyApplications,
  fetchPublicJoin,
  fetchRequiredDocuments,
  fileToBase64,
  submitApplication,
  uploadApplicationDocument,
} from './join-api';
import { JoinSupportPanel } from './join-support-panel';

type PartnerTypeRow = { code: string; enabled: boolean; join_public: boolean; required_documents?: string[] };
type ApplicationRow = {
  id: string;
  status: string;
  partner_type_code: string;
  rejection_reason?: string | null;
  info_request?: string | null;
};

export function JoinHome() {
  const { session, signOut, getAccessToken } = useSession();
  const [country, setCountry] = useState('XX');
  const [publicJoin, setPublicJoin] = useState<boolean | null>(null);
  const [types, setTypes] = useState<PartnerTypeRow[]>([]);
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [requiredDocs, setRequiredDocs] = useState<string[]>([]);
  const [uploadedDocs, setUploadedDocs] = useState<Array<{ document_type_code: string; status: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState(false);

  useEffect(() => {
    void fetchPublicJoin(country)
      .then((body) => {
        setPublicJoin(Boolean(body.public));
        setTypes((body.partner_types ?? []) as PartnerTypeRow[]);
        setNetworkError(false);
      })
      .catch(() => {
        setPublicJoin(false);
        setTypes([]);
        setNetworkError(true);
      });
  }, [country]);

  const refreshApps = async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const body = await fetchMyApplications(token);
    setApplications((body.data ?? []) as ApplicationRow[]);
  };

  const loadAppDetail = async (appId: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setSelectedAppId(appId);
    setLoading(true);
    try {
      const [req, docs] = await Promise.all([
        fetchRequiredDocuments(token, appId, country),
        fetchApplicationDocuments(token, appId),
      ]);
      setRequiredDocs((req.document_types ?? []) as string[]);
      setUploadedDocs((docs.data ?? []) as typeof uploadedDocs);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session.status === 'authenticated') {
      void refreshApps().catch(() => setNetworkError(true));
    }
  }, [session.status]);

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (session.status !== 'authenticated') {
    return <PortalAuthPage portalId="join" />;
  }

  if (session.audience !== 'partner_applicant' && session.audience !== 'customer') {
    return <PermissionDeniedState />;
  }

  return (
    <main className="shell-main">
      <section className="join-hero">
        <p className="join-hero-kicker">World-Pharma™ partners</p>
        <Heading level={1}>Partner application</Heading>
        <Text tone="secondary">Country: {country}. Document types come from country pack only.</Text>
      </section>
      {loading ? <LoadingState label="Working" /> : null}
      {networkError ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void refreshApps() }} /> : null}

      {publicJoin === false ? (
        <Card>
          <Text tone="secondary">New public applications are disabled for this country.</Text>
          <Text tone="secondary">Existing applicants can still sign in and track status below.</Text>
        </Card>
      ) : types.length === 0 && publicJoin ? (
        <EmptyState title="No public partner types" description="Policy pack has no join_public types for this country." />
      ) : publicJoin ? (
        <Card>
          {types.map((type) => (
            <Button
              key={type.code}
              variant="secondary"
              onClick={() => {
                const token = getAccessToken();
                if (!token) {
                  return;
                }
                setLoading(true);
                void createApplication(token, type.code, country)
                  .then(() => refreshApps())
                  .catch((err: Error) => setError(err.message))
                  .finally(() => setLoading(false));
              }}
            >
              Apply as {type.code}
            </Button>
          ))}
        </Card>
      ) : null}

      <Button variant="tertiary" onClick={() => void refreshApps()}>
        Refresh my applications
      </Button>

      {applications.length === 0 ? (
        <EmptyState title="No applications" description="Your partner applications appear here after you apply." />
      ) : null}

      {applications.length ? (
        <table className="wp-data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Status</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {applications.map((app) => (
              <tr key={app.id}>
                <td>{app.partner_type_code}</td>
                <td>{app.status}</td>
                <td>
                  {app.rejection_reason ? `Rejection: ${app.rejection_reason}` : null}
                  {app.info_request ? ` Info requested: ${app.info_request}` : null}
                  {!app.rejection_reason && !app.info_request ? '—' : null}
                </td>
                <td>
                  <div className="join-cta-row">
                    <Button size="sm" variant="secondary" onClick={() => void loadAppDetail(app.id)}>
                      Documents & status
                    </Button>
                    {app.status === 'DRAFT' ||
                    app.status === 'DOCUMENTS_REQUIRED' ||
                    app.status === 'ADDITIONAL_INFORMATION_REQUIRED' ? (
                      <Button
                        size="sm"
                        onClick={() => {
                          const token = getAccessToken();
                          if (!token) {
                            return;
                          }
                          void submitApplication(token, app.id)
                            .then(() => refreshApps())
                            .catch((err: Error) => setError(err.message));
                        }}
                      >
                        {app.status === 'ADDITIONAL_INFORMATION_REQUIRED' ? 'Resubmit' : 'Submit'}
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {selectedAppId ? (
        <Card>
          <Heading level={2}>Required documents</Heading>
          {requiredDocs.length === 0 ? (
            <Text tone="secondary">Country pack defines no required document codes yet.</Text>
          ) : (
            requiredDocs.map((code) => {
              const uploaded = uploadedDocs.find((d) => d.document_type_code === code);
              return (
                <div key={code} className="wp-stack">
                  <Text>
                    {code} — {uploaded?.status ?? 'missing'}
                  </Text>
                  <FormField label={`Upload ${code}`}>
                    {({ id }) => (
                      <input
                        id={id}
                        type="file"
                        accept="application/pdf,image/jpeg,image/png"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          const token = getAccessToken();
                          if (!file || !token || !selectedAppId) {
                            return;
                          }
                          setLoading(true);
                          void fileToBase64(file)
                            .then((content_base64) =>
                              uploadApplicationDocument(token, selectedAppId, {
                                document_type_code: code,
                                content_type: file.type,
                                original_name: file.name,
                                content_base64,
                              }),
                            )
                            .then(() => loadAppDetail(selectedAppId))
                            .catch((err: Error) => setError(err.message))
                            .finally(() => setLoading(false));
                        }}
                      />
                    )}
                  </FormField>
                </div>
              );
            })
          )}
        </Card>
      ) : null}

      <Card>
        <Heading level={2}>Onboarding support</Heading>
        {getAccessToken() ? (
          <JoinSupportPanel
            token={getAccessToken()!}
            applicationId={selectedAppId}
            onError={(err) => setError((err as Error).message)}
          />
        ) : null}
      </Card>

      {error ? <NetworkErrorState action={{ label: 'Dismiss', onClick: () => setError(null) }} /> : null}
      <Button variant="tertiary" onClick={() => signOut()}>
        Sign out
      </Button>
    </main>
  );
}
