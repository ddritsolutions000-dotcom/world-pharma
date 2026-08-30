export type TenantActorKind = 'user' | 'auth' | 'worker' | 'webhook' | 'system';
export type CompanyScope =
  | 'none'
  | 'location'
  | 'organization'
  | 'business_unit'
  | 'legal_entity'
  | 'country'
  | 'region'
  | 'platform';

export type TenantContext = {
  actorKind: TenantActorKind;
  companyScope: CompanyScope;
  personId?: string;
  organizationIds: string[];
  locationIds: string[];
  countryIds: string[];
  regionIds: string[];
  legalEntityIds: string[];
  businessUnitIds: string[];
};

export function emptyTenantContext(actorKind: TenantActorKind = 'auth'): TenantContext {
  return {
    actorKind,
    companyScope: 'none',
    organizationIds: [],
    locationIds: [],
    countryIds: [],
    regionIds: [],
    legalEntityIds: [],
    businessUnitIds: [],
  };
}
