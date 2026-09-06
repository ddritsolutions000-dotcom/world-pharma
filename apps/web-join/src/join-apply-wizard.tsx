'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  Heading,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import { partnerFieldLabel } from '@world-pharma/shared/partner-fields';
import { JoinAuthPanel } from './join-auth-panel';
import {
  createApplication,
  fetchApplication,
  fetchApplicationDocuments,
  fetchCountries,
  fetchJoinOnboarding,
  fetchMyApplications,
  fetchPublicJoin,
  fetchRequiredDocuments,
  fileToBase64,
  submitApplication,
  updateApplicationFields,
  uploadApplicationDocument,
  type JoinApplicationRow,
  type JoinDocumentRow,
  type JoinOnboardingReadiness,
  type JoinPartnerTypeRow,
} from './join-api';
import { JoinSupportPanel } from './join-support-panel';
import {
  portalLabelForPartnerType,
  portalUrlForPartnerType,
  pharmacyLicencePortalUrl,
  statusLabel,
  statusNextAction,
  partnerTypeLabel,
  isAcquisitionPartnerType,
} from './join-status-labels';

type Step = 'country' | 'type' | 'auth' | 'application' | 'documents' | 'submit' | 'done';

function countryName(row: { name: Record<string, string> | string }): string {
  if (typeof row.name === 'string') {
    return row.name;
  }
  return row.name.en ?? row.name.default ?? Object.values(row.name)[0] ?? '—';
}

export function JoinApplyWizard() {
  const searchParams = useSearchParams();
  const preferredType = searchParams.get('type');
  const resumeApplicationId = searchParams.get('application');
  const { session, getAccessToken, signOut } = useSession();
  const [step, setStep] = useState<Step>('country');
  const [countries, setCountries] = useState<Array<{ iso_alpha2: string; name: Record<string, string> | string }>>(
    [],
  );
  const [country, setCountry] = useState('XX');
  const [publicJoin, setPublicJoin] = useState<boolean | null>(null);
  const [types, setTypes] = useState<JoinPartnerTypeRow[]>([]);
  const [selectedType, setSelectedType] = useState<string | null>(null);
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
  const [onboarding, setOnboarding] = useState<JoinOnboardingReadiness | null>(null);

  const acquisitionTypes = useMemo(
    () => types.filter((t) => isAcquisitionPartnerType(t.code)),
    [types],
  );

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
      const uploaded = uploadedDocs.find(
        (d) =>
          d.document_type_code === code &&
          d.status !== 'RETIRED' &&
          d.status !== 'REJECTED',
      );
      return (
        uploaded?.status === 'UPLOADED' ||
        uploaded?.status === 'UNDER_REVIEW' ||
        uploaded?.status === 'VERIFIED'
      );
    });
  }, [requiredDocs, uploadedDocs]);

  useEffect(() => {
    if (preferredType && isAcquisitionPartnerType(preferredType) && !selectedType) {
      setSelectedType(preferredType);
    }
  }, [preferredType, selectedType]);

  useEffect(() => {
    void fetchCountries()
      .then((body) => setCountries(body.data ?? []))
      .catch(() => setNetworkError(true));
  }, []);

  useEffect(() => {
    void fetchPublicJoin(country)
      .then((body) => {
        setPublicJoin(Boolean(body.public));
        setTypes(body.partner_types ?? []);
        setNetworkError(false);
      })
      .catch(() => {
        setPublicJoin(false);
        setTypes([]);
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
          fetchApplication(token, appId),
          fetchRequiredDocuments(token, appId, country),
          fetchApplicationDocuments(token, appId),
        ]);
        setApplication(app as JoinApplicationRow);
        setRequiredDocs(req.document_types ?? []);
        setRequiredFields(req.required_fields ?? []);
        setFieldValues((app as JoinApplicationRow).application_fields ?? {});
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
    if (!token || !selectedType) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const created = (await createApplication(token, selectedType, country)) as {
        application?: { id: string };
      };
      const appId = created.application?.id;
      if (!appId) {
        const mine = await fetchMyApplications(token);
        const latest = (mine.data ?? []).find(
          (row: JoinApplicationRow) => row.partner_type_code === selectedType,
        ) as JoinApplicationRow | undefined;
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
      await updateApplicationFields(token, application.id, fieldValues);
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
        await updateApplicationFields(token, application.id, fieldValues);
      }
      await submitApplication(token, application.id);
      await loadApplicationDetail(application.id);
      const readiness = await fetchJoinOnboarding(token, application.id).catch(() => null);
      setOnboarding(readiness);
      setStep('done');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (session.audience && session.audience !== 'partner_applicant' && session.audience !== 'customer') {
    return <PermissionDeniedState />;
  }

  const stepIndex =
    step === 'country'
      ? 1
      : step === 'type'
        ? 2
        : step === 'auth'
          ? 3
          : step === 'application'
            ? 4
            : step === 'documents' || step === 'submit'
              ? 5
              : 6;

  return (
    <div className="wp-stack">
      <Heading level={1}>Apply as partner</Heading>
      <Text tone="secondary">
        Vendor, pharmacy, doctor, lab, imaging, delivery, or affiliate — complete each step. Documents are stored as
        company-controlled KYC records per country policy pack. Approval is not instant and does not grant live production
        access until activation.
      </Text>
      <Text tone="secondary" size="caption">
        Progress: step {stepIndex} of 6 — Country → Type → Sign in → Application → Documents → Submitted
      </Text>

      {loading ? <LoadingState label="Working on your application" /> : null}
      {networkError ? (
        <NetworkErrorState action={{ label: 'Retry', onClick: () => window.location.reload() }} />
      ) : null}
      {error ? <ErrorState description={error} action={{ label: 'Dismiss', onClick: () => setError(null) }} /> : null}

      {step === 'country' ? (
        <Card>
          <Heading level={2}>1. Select country</Heading>
          <FormField label="Country" hint="Active countries from platform registry">
            {({ id }) => (
              <select
                id={id}
                className="wp-input"
                value={country}
                onChange={(e) => setCountry(e.target.value.toUpperCase())}
              >
                {countries.length ? null : <option value="XX">XX (default sandbox)</option>}
                {countries.map((row) => (
                  <option key={row.iso_alpha2} value={row.iso_alpha2}>
                    {row.iso_alpha2} — {countryName(row)}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          {publicJoin === false ? (
            <Text tone="secondary">
              Public join is not open for this country right now. You can still{' '}
              <Link href="/status">track an existing application</Link>.
            </Text>
          ) : null}
          <Button onClick={() => setStep('type')} disabled={!country}>
            Continue
          </Button>
        </Card>
      ) : null}

      {step === 'type' ? (
        <Card>
          <Heading level={2}>2. Partner type</Heading>
          {acquisitionTypes.length === 0 ? (
            <EmptyState
              title="No partner types open"
              description="This country pack has no public join partner types enabled for acquisition."
            />
          ) : (
            acquisitionTypes.map((type) => (
              <Button
                key={type.code}
                variant={selectedType === type.code ? 'primary' : 'secondary'}
                onClick={() => setSelectedType(type.code)}
              >
                {partnerTypeLabel(type.code)} ({type.code})
              </Button>
            ))
          )}
          {selectedType ? (
            <Text tone="secondary" size="caption">
              Required documents (from pack): {(types.find((t) => t.code === selectedType)?.required_documents ?? []).join(', ') || 'none configured'}
            </Text>
          ) : null}
          <div className="join-cta-row">
            <Button variant="tertiary" onClick={() => setStep('country')}>
              Back
            </Button>
            <Button
              disabled={!selectedType || publicJoin === false}
              onClick={() => setStep(session.status === 'authenticated' ? 'application' : 'auth')}
            >
              Continue
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 'auth' ? (
        <Card>
          <Heading level={2}>3. Sign in</Heading>
          <JoinAuthPanel />
          <Button
            disabled={session.status !== 'authenticated'}
            onClick={() => setStep('application')}
          >
            Continue to application
          </Button>
          <Button variant="tertiary" onClick={() => setStep('type')}>
            Back
          </Button>
        </Card>
      ) : null}

      {step === 'application' ? (
        <Card>
          <Heading level={2}>4. Create application</Heading>
          <JoinAuthPanel />
          <Text>
            Country: <strong>{country}</strong> · Type: <strong>{selectedType}</strong>
          </Text>
          <div className="join-cta-row">
            <Button variant="tertiary" onClick={() => setStep('type')}>
              Back
            </Button>
            <Button
              disabled={session.status !== 'authenticated' || !selectedType || publicJoin === false}
              onClick={() => void startApplication()}
            >
              Create application
            </Button>
          </div>
        </Card>
      ) : null}

      {(step === 'documents' || step === 'submit') && application ? (
        <Card>
          <Heading level={2}>5. Requirements & documents</Heading>
          <Badge kind="info">{statusLabel(application.status)}</Badge>
          {statusNextAction(application.status) ? (
            <Text tone="secondary">{statusNextAction(application.status)}</Text>
          ) : null}

          {fieldsToCapture.length ? (
            <>
              <Heading level={3}>Application information</Heading>
              <Text tone="secondary">
                Complete required fields from the country policy pack
                {application.requested_fields?.length ? ' and admin-requested items' : ''}. Values are saved on
                the server and validated before submit.
              </Text>
              {fieldsToCapture.map((field) => (
                <FormField key={field} label={partnerFieldLabel(field)} required>
                  {({ id }) => (
                    <input
                      id={id}
                      className="wp-input"
                      value={fieldValues[field] ?? ''}
                      onChange={(e) =>
                        setFieldValues((prev) => ({ ...prev, [field]: e.target.value }))
                      }
                    />
                  )}
                </FormField>
              ))}
              <div className="join-cta-row">
                <Button variant="secondary" disabled={fieldsSaving} onClick={() => void saveFields()}>
                  Save information
                </Button>
                {fieldsMessage ? <Text size="caption">{fieldsMessage}</Text> : null}
              </div>
              {!fieldsComplete ? (
                <Text tone="secondary">Fill all required information fields before submitting.</Text>
              ) : null}
            </>
          ) : null}

          <Heading level={3}>Required documents</Heading>
          {requiredDocs.length === 0 ? (
            <Text tone="secondary">No document types configured for this country/type in the policy pack.</Text>
          ) : (
            requiredDocs.map((code) => {
              const uploaded = uploadedDocs.find((d) => d.document_type_code === code);
              return (
                <div key={code} className="wp-stack join-doc-row">
                  <Text>
                    <strong>{code}</strong> — {uploaded?.status ?? 'missing'}
                    {uploaded?.rejection_reason ? ` · rejected: ${uploaded.rejection_reason}` : ''}
                  </Text>
                  {uploaded?.original_name ? (
                    <Text size="caption" tone="secondary">
                      Uploaded: {uploaded.original_name}
                    </Text>
                  ) : null}
                  <FormField label={`Upload ${code} (PDF, JPEG, PNG — max 10 MB)`}>
                    {({ id }) => (
                      <input
                        id={id}
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
                              uploadApplicationDocument(token, application.id, {
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
                    )}
                  </FormField>
                  {uploadingCode === code ? <LoadingState label={`Uploading ${code}`} /> : null}
                </div>
              );
            })
          )}

          <div className="join-cta-row">
            <Link href="/status">
              <Button variant="tertiary">View full status</Button>
            </Link>
            {application.status === 'DRAFT' ||
            application.status === 'REGISTERED' ||
            application.status === 'DOCUMENTS_REQUIRED' ||
            application.status === 'ADDITIONAL_INFORMATION_REQUIRED' ? (
              <Button onClick={() => void handleSubmit()} disabled={loading || !docsComplete || !fieldsComplete}>
                {application.status === 'ADDITIONAL_INFORMATION_REQUIRED' ? 'Resubmit application' : 'Submit application'}
              </Button>
            ) : null}
          </div>
          {!docsComplete && requiredDocs.length ? (
            <Text tone="secondary">Upload all required documents before submitting.</Text>
          ) : null}
          {(selectedType === 'VENDOR' || selectedType === 'PHARMACY') && docsComplete ? (
            <Text size="caption" tone="secondary">
              Pharmacy retail licence is verified separately after approval (seller readiness) — not in this upload step.
            </Text>
          ) : null}
        </Card>
      ) : null}

      {step === 'done' && application ? (
        <Card>
          <Heading level={2}>Application submitted</Heading>
          <Text>Status: {statusLabel(application.status)}</Text>
          <Link href="/status">
            <Button variant="secondary">Track application</Button>
          </Link>
          {onboarding?.pharmacy_licence?.applicable && !onboarding.pharmacy_licence.verified ? (
            <div className="wp-stack" style={{ marginTop: 16 }}>
              <Heading level={3}>Next: pharmacy licence evidence</Heading>
              <Text tone="secondary">
                {onboarding.pharmacy_licence.next_step ??
                  'KYC documents are with company review. Pharmacy retail licence is a separate seller-readiness step — submit licence details for operator verification. This is not a live government or KYC-provider check.'}
              </Text>
              {pharmacyLicencePortalUrl(application.partner_type_code) ? (
                <a
                  href={pharmacyLicencePortalUrl(application.partner_type_code)!}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Button>Continue to seller licence readiness</Button>
                </a>
              ) : null}
            </div>
          ) : null}
        </Card>
      ) : null}

      {session.status === 'authenticated' && getAccessToken() ? (
        <Card>
          <Heading level={2}>Need help?</Heading>
          <JoinSupportPanel
            token={getAccessToken()!}
            applicationId={application?.id ?? null}
            onError={(err) => setError((err as Error).message)}
          />
        </Card>
      ) : null}

      {(application?.status === 'ACTIVE' || application?.status === 'APPROVED') && application ? (
        <Card>
          <Heading level={2}>Portal access</Heading>
          <Text tone="secondary">
            {portalLabelForPartnerType(application.partner_type_code)} — sign in with the same email (customer OTP).
          </Text>
          {portalUrlForPartnerType(application.partner_type_code) ? (
            <a href={portalUrlForPartnerType(application.partner_type_code)!} target="_blank" rel="noreferrer">
              <Button>Open {portalLabelForPartnerType(application.partner_type_code)}</Button>
            </a>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
