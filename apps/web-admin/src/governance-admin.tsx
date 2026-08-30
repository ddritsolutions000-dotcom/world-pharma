'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiBaseUrl } from '@world-pharma/shell-core';
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
  Table,
  Text,
} from '@world-pharma/ui-kit/web';

class AdminApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function adminCall<T = unknown>(path: string, token: string): Promise<T> {
  const base = apiBaseUrl(typeof process === 'undefined' ? {} : process.env);
  const res = await fetch(`${base}${path}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AdminApiError((body as { detail?: string }).detail ?? 'request_failed', res.status);
  }
  return body as T;
}

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network';

function cell(value: unknown): string {
  if (value == null || value === '') {
    return '—';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.en === 'string') {
      return record.en;
    }
    if (typeof record.name === 'string') {
      return record.name;
    }
    if (typeof record.code === 'string') {
      return record.code;
    }
    if (typeof record.id === 'string') {
      return record.id.slice(0, 8);
    }
    return '—';
  }
  return '—';
}

function nested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function GovernanceListPanel(props: {
  title: string;
  description: string;
  endpoint: string;
  emptyTitle: string;
  emptyDescription: string;
  columns: string[];
  mapRow: (item: Record<string, unknown>) => string[];
  requireQuery?: boolean;
  queryLabel?: string;
  queryPlaceholder?: string;
  buildQuery?: (input: string) => string | undefined;
}) {
  const { getAccessToken } = useSession();
  const [filterInput, setFilterInput] = useState('');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [viewState, setViewState] = useState<ViewState>('idle');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const qs = props.buildQuery?.(filterInput.trim());
    if (props.requireQuery && !qs) {
      setRows([]);
      setViewState('idle');
      return;
    }
    setViewState('loading');
    try {
      const path = qs
        ? `${props.endpoint}${props.endpoint.includes('?') ? '&' : '?'}${qs}`
        : props.endpoint;
      const body = await adminCall<{ data?: Record<string, unknown>[] }>(path, token);
      setRows(body.data ?? []);
      setViewState('idle');
    } catch (err) {
      if (err instanceof AdminApiError) {
        if (err.status === 403) {
          setViewState('forbidden');
          return;
        }
        if (err.status === 401) {
          setViewState('network');
          return;
        }
      }
      setViewState('network');
    }
  }, [filterInput, getAccessToken, props.buildQuery, props.endpoint, props.requireQuery]);

  useEffect(() => {
    if (!props.requireQuery) {
      void load();
    }
  }, [load, props.requireQuery]);

  const tableRows = rows.map(props.mapRow);

  return (
    <section className="wp-stack">
      <Heading level={2}>{props.title}</Heading>
      <Text tone="secondary">{props.description}</Text>
      <Text tone="secondary">Company control-plane boundary only. Read-only foundation view.</Text>

      {props.requireQuery || props.queryLabel ? (
        <Card>
          <FormField label={props.queryLabel ?? 'Filter'}>
            {({ id }) => (
              <Input
                id={id}
                value={filterInput}
                onChange={(e) => setFilterInput(e.target.value)}
                placeholder={props.queryPlaceholder}
              />
            )}
          </FormField>
          <Button onClick={() => void load()}>Load</Button>
        </Card>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          Refresh
        </Button>
      )}

      {viewState === 'loading' ? <LoadingState label={`Loading ${props.title.toLowerCase()}`} /> : null}
      {viewState === 'forbidden' ? <PermissionDeniedState /> : null}
      {viewState === 'network' ? (
        <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />
      ) : null}

      {viewState === 'idle' && tableRows.length > 0 ? (
        <Table caption={props.title} columns={props.columns} rows={tableRows} />
      ) : null}

      {viewState === 'idle' && tableRows.length === 0 ? (
        <Card>
          <EmptyState title={props.emptyTitle} description={props.emptyDescription} />
        </Card>
      ) : null}
    </section>
  );
}

export function RegionsGovernance() {
  return (
    <GovernanceListPanel
      title="Regions"
      description="Operating regions are configuration. Regional operators cannot act globally."
      endpoint="/api/v1/admin/governance/regions"
      emptyTitle="No regions"
      emptyDescription="Operating regions configured in the platform appear here."
      columns={['Code', 'Name', 'Status']}
      mapRow={(row) => [cell(row.code), cell(row.nameI18n ?? row.name_i18n), cell(row.status)]}
    />
  );
}

export function CountriesGovernance() {
  return (
    <GovernanceListPanel
      title="Countries"
      description="Country packs and enablement. No if (country === 'IN') outside policy/adapters."
      endpoint="/api/v1/admin/governance/countries"
      emptyTitle="No countries"
      emptyDescription="Enabled country packs appear here."
      columns={['ISO', 'Name', 'Region', 'Status']}
      mapRow={(row) => [
        cell(row.isoAlpha2 ?? row.iso_alpha2),
        cell(row.nameI18n ?? row.name_i18n),
        cell(nested(row, 'region.code')),
        cell(row.status),
      ]}
    />
  );
}

export function LegalEntitiesGovernance() {
  return (
    <GovernanceListPanel
      title="Legal entities"
      description="Incorporation and finance boundary for organizations."
      endpoint="/api/v1/admin/governance/legal-entities"
      emptyTitle="No legal entities"
      emptyDescription="Legal entities registered in governance appear here."
      columns={['Code', 'Display name', 'Region', 'Country']}
      mapRow={(row) => [
        cell(row.code),
        cell(row.displayName ?? row.display_name),
        cell(nested(row, 'region.code')),
        cell(nested(row, 'incorporationCountry.isoAlpha2') ?? nested(row, 'incorporation_country.iso_alpha2')),
      ]}
    />
  );
}

export function BusinessUnitsGovernance() {
  return (
    <GovernanceListPanel
      title="Business units"
      description="Operational units under legal entities."
      endpoint="/api/v1/admin/governance/business-units"
      emptyTitle="No business units"
      emptyDescription="Business units configured under legal entities appear here."
      columns={['Code', 'Name', 'Legal entity']}
      mapRow={(row) => [
        cell(row.code),
        cell(row.name ?? row.displayName ?? row.display_name),
        cell(nested(row, 'legalEntity.code') ?? nested(row, 'legal_entity.code')),
      ]}
    />
  );
}

export function OrganizationsGovernance() {
  const { getAccessToken } = useSession();
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [locations, setLocations] = useState<Record<string, unknown>[]>([]);
  const [locationsState, setLocationsState] = useState<ViewState>('idle');

  const loadLocations = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !selectedOrgId.trim()) {
      setLocations([]);
      return;
    }
    setLocationsState('loading');
    try {
      const body = await adminCall<{ data?: Record<string, unknown>[] }>(
        `/api/v1/admin/governance/locations?organization_id=${encodeURIComponent(selectedOrgId.trim())}`,
        token,
      );
      setLocations(body.data ?? []);
      setLocationsState('idle');
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 403) {
        setLocationsState('forbidden');
        return;
      }
      setLocationsState('network');
    }
  }, [getAccessToken, selectedOrgId]);

  return (
    <section className="wp-stack">
      <GovernanceListPanel
        title="Organizations"
        description="Partner and operator organizations. Locations load for a selected organization."
        endpoint="/api/v1/admin/governance/organizations"
        emptyTitle="No organizations"
        emptyDescription="Organizations onboarded through governance appear here."
        columns={['Display name', 'Legal name', 'Kind', 'Country', 'Status']}
        mapRow={(row) => [
          cell(row.displayName ?? row.display_name),
          cell(row.legalName ?? row.legal_name),
          cell(row.kind),
          cell(nested(row, 'country.isoAlpha2') ?? nested(row, 'country.iso_alpha2')),
          cell(row.status),
        ]}
      />

      <Card>
        <Heading level={3}>Locations</Heading>
        <Text tone="secondary">Filter locations by organization ID.</Text>
        <FormField label="Organization ID">
          {({ id }) => (
            <Input id={id} value={selectedOrgId} onChange={(e) => setSelectedOrgId(e.target.value)} />
          )}
        </FormField>
        <Button onClick={() => void loadLocations()}>Load locations</Button>
        {locationsState === 'loading' ? <LoadingState label="Loading locations" /> : null}
        {locationsState === 'forbidden' ? <PermissionDeniedState /> : null}
        {locationsState === 'network' ? (
          <NetworkErrorState action={{ label: 'Retry', onClick: () => void loadLocations() }} />
        ) : null}
        {locationsState === 'idle' && locations.length > 0 ? (
          <Table
            caption="Locations"
            columns={['Name', 'Kind', 'Status', 'Organization']}
            rows={locations.map((row) => [
              cell(row.name),
              cell(row.kind),
              cell(row.status),
              cell(nested(row, 'organization.displayName') ?? nested(row, 'organization.display_name')),
            ])}
          />
        ) : null}
        {locationsState === 'idle' && selectedOrgId.trim() && locations.length === 0 ? (
          <EmptyState title="No locations" description="No locations for this organization." />
        ) : null}
      </Card>
    </section>
  );
}

export function MembershipsGovernance() {
  return (
    <GovernanceListPanel
      title="Identity memberships"
      description="Person kernel, sessions, and company RBAC. Partners cannot administer company identity."
      endpoint="/api/v1/admin/governance/memberships"
      emptyTitle="No memberships"
      emptyDescription="Provide an organization ID to list active memberships."
      columns={['Person', 'Organization', 'Role', 'Status']}
      mapRow={(row) => [
        cell(nested(row, 'person.id')),
        cell(nested(row, 'organization.displayName') ?? nested(row, 'organization.display_name')),
        cell(nested(row, 'role.code')),
        cell(row.status),
      ]}
      requireQuery
      queryLabel="Organization ID"
      queryPlaceholder="Organization UUID"
      buildQuery={(input) =>
        input ? `organization_id=${encodeURIComponent(input)}` : undefined
      }
    />
  );
}

export function SecurityEventsGovernance() {
  const { getAccessToken } = useSession();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [viewState, setViewState] = useState<ViewState>('idle');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const body = await adminCall<{ data?: Record<string, unknown>[] }>(
        '/api/v1/admin/security-events?limit=50',
        token,
      );
      setRows(body.data ?? []);
      setViewState('idle');
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 403) {
        setViewState('forbidden');
        return;
      }
      setViewState('network');
    }
  }, [getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const tableRows = rows.map((row) => [
    cell(row.created_at ?? row.createdAt),
    cell(row.type),
    cell(row.outcome),
    cell(row.person_id ?? row.personId),
    cell(row.request_id ?? row.requestId),
  ]);

  return (
    <section className="wp-stack">
      <Heading level={2}>Audit</Heading>
      <Text tone="secondary">
        Durable security events for grants, break-glass, policy, and audience denials. No secrets or PHI.
      </Text>
      <Button variant="secondary" size="sm" onClick={() => void load()}>
        Refresh
      </Button>
      {viewState === 'loading' ? <LoadingState label="Loading security events" /> : null}
      {viewState === 'forbidden' ? <PermissionDeniedState /> : null}
      {viewState === 'network' ? (
        <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />
      ) : null}
      {viewState === 'idle' && tableRows.length > 0 ? (
        <Table
          caption="Security events"
          columns={['Created', 'Type', 'Outcome', 'Person', 'Request']}
          rows={tableRows}
        />
      ) : null}
      {viewState === 'idle' && tableRows.length === 0 ? (
        <Card>
          <EmptyState title="No events" description="Security audit events appear here as they are recorded." />
        </Card>
      ) : null}
    </section>
  );
}
