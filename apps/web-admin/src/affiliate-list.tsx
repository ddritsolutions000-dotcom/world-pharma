'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
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
  Text,
} from '@world-pharma/ui-kit/web';
import {
  adminCreateReferralCode,
  AffiliateApiError,
  listAffiliatePartners,
  type AffiliatePartner,
} from './affiliate-api';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network';

export function AffiliateAdminHub() {
  const { getAccessToken, session } = useSession();
  const [partners, setPartners] = useState<AffiliatePartner[]>([]);
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [countryCode, setCountryCode] = useState('XX');
  const [organizationId, setOrganizationId] = useState('');
  const [code, setCode] = useState('');
  const [formError, setFormError] = useState('');
  const canManage = session.permissions.includes('affiliate:manage');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const body = await listAffiliatePartners(token, countryCode);
      setPartners(body.data ?? []);
      setViewState('idle');
    } catch (err) {
      if (err instanceof AffiliateApiError && err.status === 403) {
        setViewState('forbidden');
        return;
      }
      setViewState('network');
    }
  }, [countryCode, getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    const token = getAccessToken();
    if (!token || !organizationId || !code.trim()) {
      return;
    }
    setFormError('');
    try {
      await adminCreateReferralCode(token, {
        country_code: countryCode,
        organization_id: organizationId,
        code: code.trim(),
      });
      setCode('');
      await load();
    } catch (err) {
      setFormError(err instanceof AffiliateApiError ? err.message : 'Create failed');
    }
  }

  if (viewState === 'forbidden') {
    return <PermissionDeniedState />;
  }
  if (viewState === 'network') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />;
  }
  if (viewState === 'loading' && partners.length === 0) {
    return <LoadingState label="Loading partners" />;
  }

  return (
    <section>
      <Heading level={1}>Affiliate partners</Heading>
      <Text tone="secondary">
        Partner list and referral code provisioning. Finance approve/reverse remains in Finance.
      </Text>
      <FormField label="Country code">
        {({ id }) => (
          <Input id={id} value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} />
        )}
      </FormField>
      {partners.length === 0 ? (
        <EmptyState title="No affiliate partners" description="No AFFILIATE_ORG organizations in this country." />
      ) : (
        partners.map((partner) => (
          <Card key={partner.id}>
            <Heading level={2}>{partner.display_name}</Heading>
            <Text tone="secondary">
              {partner.status} · {partner.id}
            </Text>
          </Card>
        ))
      )}
      {canManage ? (
        <Card>
          <Heading level={2}>Create referral code</Heading>
          <FormField label="Organization ID">
            {({ id }) => <Input id={id} value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} />}
          </FormField>
          <FormField label="Code">
            {({ id }) => <Input id={id} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />}
          </FormField>
          <Button onClick={() => void handleCreate()}>Create referral code</Button>
        </Card>
      ) : (
        <Text tone="secondary">affiliate:manage required to provision codes.</Text>
      )}
      {formError ? <Text tone="secondary">{formError}</Text> : null}
    </section>
  );
}
