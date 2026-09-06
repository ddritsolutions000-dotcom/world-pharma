'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { partnerFieldLabel } from '@world-pharma/shared/partner-fields';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  FormField,
  Heading,
  Input,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import { VendorCtaLink } from './vendor-cta-link';
import { VendorJoinAuthPanel } from './vendor-join-auth-panel';
import {
  createJoinApplication,
  fetchJoinApplication,
  fetchJoinApplicationDocuments,
  fetchJoinCountries,
  fetchJoinPublic,
  fetchJoinRequiredDocuments,
  fetchMyJoinApplications,
  fileToBase64,
  submitJoinApplication,
  updateJoinApplicationFields,
  uploadJoinApplicationDocument,
  type JoinApplicationRow,
  type JoinDocumentRow,
} from './vendor-join-api';
import { countryDisplayName, joinStatusLabel, joinStatusNextAction } from './vendor-join-labels';
import { VENDOR_JOIN_ROUTES, VENDOR_PARTNER_TYPE } from './vendor-join-routes';
import { VendorJoinSupportPanel } from './vendor-join-support-panel';

type Step = 'country' | 'auth' | 'application' | 'documents' | 'done';

const STEP_ORDER: Step[] = ['country', 'auth', 'documents', 'done'];

function VendorJoinApplyPanelInner() {
  const searchParams = useSearchParams();
  const resumeApplicationId = searchParams.get('application');
  const { session, getAccessToken, signOut } = useSession();

  const [step, setStep] = useState<Step>('country');
  const [countries, setCountries] = useState<Array<{ iso_alpha2: string; name: Record<string, string> | string }>>([]);
  const [country, setCountry] = useState('IN');
  const [vendorJoinOpen, setVendorJoinOpen] = useState<boolean | null>(null);
  const [application, setApplication] = useState<JoinApplicationRow | null>(null);
  const [requiredDocs, setRequiredDocs] = useState<string[]>([]);
  const [requiredFields, setRequiredFields] = useState<string[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [fieldsSaving, setFieldsSaving] = useState(false);
  const [fieldsMessage, setFieldsMessage] = useState<string | null>(null);
  const [uploadedDocs, setUploadedDocs] = useState<JoinDocumentRow[]>([]);
  const [uploadingCode, setUploadingCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState(false);

  const fieldsToCapture = useMemo(() => {
    const requested = application?.requested_fields ?? [];
    return [...new Set([...requiredFields, ...requested])];
  }, [application?.requested_fields, requiredFields]);

  const fieldsComplete = useMemo(() => {
    if (!fieldsToCapture.length) {
      return true;
    }
    return fieldsToCapture.every((code) => Boolean(fieldValues[code]?.trim()));
  }, [fieldValues, fieldsToCapture]);

  const docsComplete = useMemo(() => {
    if (!requiredDocs.length) {
      return true;
    }
    return requiredDocs.every((code) => {
      const uploaded = uploadedDocs.find((d) => d.document_type_code === code);
      return uploaded?.status === 'UPLOADED' || uploaded?.status === 'VERIFIED';
    });
  }, [requiredDocs, uploadedDocs]);

  useEffect(() => {
    void fetchJoinCountries()
      .then((body) => {
        setCountries(body.data ?? []);
        if (body.data?.length === 1 && body.data[0]) {
          setCountry(body.data[0].iso_alpha2);
        }
      })
      .catch(() => setNetworkError(true));
  }, []);

  useEffect(() => {
    void fetchJoinPublic(country)
      .then((body) => {
        const vendorType = (body.partner_types ?? []).find((t) => t.code === VENDOR_PARTNER_TYPE);
        setVendorJoinOpen(Boolean(body.public && vendorType?.join_public));
        setNetworkError(false);
      })
      .catch(() => {
        setVendorJoinOpen(false);
        setNetworkError(true);
      });
  }, [country]);

  const loadApplicationDetail = useCallback(
    async (appId: string) => {
      const token = getAccessToken();
      if (!token) {
        return;
      }
      setLoading(true);
      try {
        const [app, req, docs] = await Promise.all([
          fetchJoinApplication(token, appId),
          fetchJoinRequiredDocuments(token, appId, country),
          fetchJoinApplicationDocuments(token, appId),
        ]);
        if (app.partner_type_code !== VENDOR_PARTNER_TYPE) {
          setError('This application is not a marketplace vendor application.');
          return;
        }
        setApplication(app);
        setRequiredDocs(req.document_types ?? []);
        setRequiredFields(req.required_fields ?? []);
        setFieldValues(app.application_fields ?? {});
        setUploadedDocs(docs.data ?? []);
        setError(null);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [country, getAccessToken],
  );

  useEffect(() => {
    const token = getAccessToken();
    if (!resumeApplicationId || session.status !== 'authenticated' || !token) {
      return;
    }
    void loadApplicationDetail(resumeApplicationId).then(() => setStep('documents'));
  }, [getAccessToken, loadApplicationDetail, resumeApplicationId, session.status]);

  const startApplication = async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const created = await createJoinApplication(token, VENDOR_PARTNER_TYPE, country);
      const appId = created.application?.id;
      if (!appId) {
        const mine = await fetchMyJoinApplications(token);
        const latest = mine.data?.find((row) => row.partner_type_code === VENDOR_PARTNER_TYPE);
        if (latest) {
          await loadApplicationDetail(latest.id);
          setStep('documents');
          return;
        }
        throw new Error('Application created but id not returned');
      }
      await loadApplicationDetail(appId);
      setStep('documents');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const saveFields = async () => {
    const token = getAccessToken();
    if (!token || !application) {
      return;
    }
    setFieldsSaving(true);
    setFieldsMessage(null);
    try {
      await updateJoinApplicationFields(token, application.id, fieldValues);
      await loadApplicationDetail(application.id);
      setFieldsMessage('Information saved.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFieldsSaving(false);
    }
  };

  const handleSubmit = async () => {
    const token = getAccessToken();
    if (!token || !application) {
      return;
    }
    setLoading(true);
    try {
      if (fieldsToCapture.length) {
        await updateJoinApplicationFields(token, application.id, fieldValues);
      }
      await submitJoinApplication(token, application.id);
      await loadApplicationDetail(application.id);
      setStep('done');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const continueFromCountry = () => {
    setStep(session.status === 'authenticated' ? 'application' : 'auth');
  };

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (session.audience && session.audience !== 'partner_applicant' && session.audience !== 'customer') {
    return <PermissionDeniedState />;
  }

  return (
    <div className="vendor-join-system wp-stack">
      <header className="vendor-join-system-head">
        <p className="vendor-section-eyebrow">Vendor seller onboarding</p>
        <Heading level={1}>Apply as marketplace vendor</Heading>
        <Text tone="secondary">
          This site is for marketplace vendors only. Complete KYC and documents here — after approval you manage catalog
          and orders from the seller workspace.
        </Text>
      </header>

      <nav className="vendor-join-steps" aria-label="Application progress">
        {STEP_ORDER.map((id, index) => (
          <span
            key={id}
            className={`vendor-join-step${step === id || (id === 'documents' && step === 'application') ? ' is-active' : ''}${STEP_ORDER.indexOf(step === 'application' ? 'auth' : step) > index ? ' is-done' : ''}`}
          >
            {index + 1}
          </span>
        ))}
      </nav>

      {loading ? <LoadingState label="Working on your application…" /> : null}
      {networkError ? (
        <NetworkErrorState action={{ label: 'Retry', onClick: () => window.location.reload() }} />
      ) : null}
      {error ? <ErrorState description={error} action={{ label: 'Dismiss', onClick: () => setError(null) }} /> : null}

      {step === 'country' ? (
        <Card>
          <Heading level={2}>1. Select country</Heading>
          <FormField label="Country">
            {({ id }) => (
              <select id={id} className="wp-input" value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())}>
                {countries.length ? null : <option value="IN">IN (sandbox)</option>}
                {countries.map((row) => (
                  <option key={row.iso_alpha2} value={row.iso_alpha2}>
                    {row.iso_alpha2} — {countryDisplayName(row)}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          {vendorJoinOpen === false ? (
            <Text tone="secondary">
              Vendor onboarding is closed for this country right now. You can still{' '}
              <Link href={VENDOR_JOIN_ROUTES.status}>track an existing application</Link>.
            </Text>
          ) : null}
          <div className="vendor-join-actions">
            <Button onClick={continueFromCountry} disabled={!country || vendorJoinOpen === false}>
              Continue
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 'auth' ? (
        <Card>
          <Heading level={2}>2. Sign in</Heading>
          <VendorJoinAuthPanel />
          <div className="vendor-join-actions">
            <Button variant="tertiary" onClick={() => setStep('country')}>
              Back
            </Button>
            <Button disabled={session.status !== 'authenticated'} onClick={() => setStep('application')}>
              Continue
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 'application' ? (
        <Card>
          <Heading level={2}>3. Create vendor application</Heading>
          <VendorJoinAuthPanel />
          <Text>
            Country <strong>{country}</strong> · Marketplace vendor seller
          </Text>
          <div className="vendor-join-actions">
            <Button variant="tertiary" onClick={() => setStep('country')}>
              Back
            </Button>
            <Button
              disabled={session.status !== 'authenticated' || vendorJoinOpen === false}
              onClick={() => void startApplication()}
            >
              Start application
            </Button>
          </div>
        </Card>
      ) : null}

      {(step === 'documents' || step === 'done') && application ? (
        <Card>
          <Heading level={2}>4. Requirements & documents</Heading>
          <Badge kind="info">{joinStatusLabel(application.status)}</Badge>
          {joinStatusNextAction(application.status) ? (
            <Text tone="secondary">{joinStatusNextAction(application.status)}</Text>
          ) : null}

          {fieldsToCapture.length ? (
            <>
              <Heading level={3}>Business information</Heading>
              {fieldsToCapture.map((field) => (
                <FormField key={field} label={partnerFieldLabel(field)} required>
                  {({ id }) => (
                    <Input
                      id={id}
                      value={fieldValues[field] ?? ''}
                      onChange={(e) => setFieldValues((prev) => ({ ...prev, [field]: e.target.value }))}
                    />
                  )}
                </FormField>
              ))}
              <div className="vendor-join-actions">
                <Button variant="secondary" disabled={fieldsSaving} onClick={() => void saveFields()}>
                  Save information
                </Button>
                {fieldsMessage ? <Text size="caption">{fieldsMessage}</Text> : null}
              </div>
            </>
          ) : null}

          <Heading level={3}>Required documents</Heading>
          {requiredDocs.length === 0 ? (
            <Text tone="secondary">No document types configured for vendor sellers in this country.</Text>
          ) : (
            requiredDocs.map((code) => {
              const uploaded = uploadedDocs.find((d) => d.document_type_code === code);
              return (
                <div key={code} className="vendor-join-doc-row wp-stack">
                  <Text>
                    <strong>{code}</strong> — {uploaded?.status ?? 'missing'}
                  </Text>
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    disabled={Boolean(uploadingCode)}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      const token = getAccessToken();
                      if (!file || !token) {
                        return;
                      }
                      setUploadingCode(code);
                      void fileToBase64(file)
                        .then((content_base64) =>
                          uploadJoinApplicationDocument(token, application.id, {
                            document_type_code: code,
                            content_type: file.type,
                            original_name: file.name,
                            content_base64,
                          }),
                        )
                        .then(() => loadApplicationDetail(application.id))
                        .catch((err: Error) => setError(err.message))
                        .finally(() => setUploadingCode(null));
                    }}
                  />
                  {uploadingCode === code ? <LoadingState label={`Uploading ${code}…`} /> : null}
                </div>
              );
            })
          )}

          <div className="vendor-join-actions">
            <VendorCtaLink href={VENDOR_JOIN_ROUTES.status} variant="tertiary">
              Track application
            </VendorCtaLink>
            {step !== 'done' &&
            ['DRAFT', 'REGISTERED', 'DOCUMENTS_REQUIRED', 'ADDITIONAL_INFORMATION_REQUIRED'].includes(
              application.status,
            ) ? (
              <Button onClick={() => void handleSubmit()} disabled={loading || !docsComplete || !fieldsComplete}>
                {application.status === 'ADDITIONAL_INFORMATION_REQUIRED' ? 'Resubmit application' : 'Submit application'}
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {step === 'done' && application ? (
        <Card>
          <Heading level={2}>Application submitted</Heading>
          <Text>Status: {joinStatusLabel(application.status)}</Text>
          <VendorCtaLink href={VENDOR_JOIN_ROUTES.status} variant="secondary">
            Track application
          </VendorCtaLink>
        </Card>
      ) : null}

      {(application?.status === 'ACTIVE' || application?.status === 'APPROVED') && application ? (
        <Card>
          <Heading level={2}>You are approved</Heading>
          <Text tone="secondary">Open the seller workspace with the same email you used to apply.</Text>
          <VendorCtaLink href="/workspace">Open seller workspace</VendorCtaLink>
        </Card>
      ) : null}

      {session.status === 'authenticated' && getAccessToken() ? (
        <Card>
          <Heading level={2}>Need help?</Heading>
          <VendorJoinSupportPanel
            token={getAccessToken()!}
            applicationId={application?.id ?? null}
            onError={(err) => setError((err as Error).message)}
          />
        </Card>
      ) : null}
    </div>
  );
}

export function VendorJoinApplyPanel() {
  return (
    <Suspense fallback={<LoadingState label="Loading vendor application…" />}>
      <VendorJoinApplyPanelInner />
    </Suspense>
  );
}
