import { Injectable } from '@nestjs/common';
import { HealthArtifactType } from '@prisma/client';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { PolicyResolver } from '../policy/resolver';
import {
  CLINICAL_SEARCH_MAX_RESULTS,
  CLINICAL_SEARCH_MIN_QUERY_LEN,
  type ClinicalSearchResponse,
  type ClinicalSearchResultItem,
  hashClinicalSearchQuery,
  isClinicalQueryBlocked,
  normalizeClinicalSearchQuery,
} from '../search/clinical-search-query';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { ClinicalAccessService } from './clinical-access.service';
import { consentScopeIncludes } from './consent-scope';

@Injectable()
export class ClinicalSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyResolver,
    private readonly clinicalAccess: ClinicalAccessService,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  async requireEnabled(countryCode: string) {
    const resolved = await this.policy.resolvePublished(countryCode);
    if (!this.policy.isClinicalSearchEnabled(resolved?.document ?? null)) {
      throw Errors.forbidden('Clinical search is not enabled for this country.');
    }
    const country = await this.prisma.country.findUnique({ where: { isoAlpha2: countryCode } });
    if (!country) {
      throw Errors.notFound('Country not found.');
    }
    return country;
  }

  async search(
    principal: Principal,
    input: {
      countryCode: string;
      patientPersonId: string;
      query: string;
      purpose: string;
      limit?: number;
      requestId?: string;
    },
  ): Promise<ClinicalSearchResponse> {
    const country = await this.requireEnabled(input.countryCode);
    const resolved = await this.policy.resolvePublished(country.isoAlpha2);
    const document = resolved?.document ?? null;
    const query = normalizeClinicalSearchQuery(input.query);
    const limit = Math.min(Math.max(input.limit ?? 10, 1), CLINICAL_SEARCH_MAX_RESULTS);

    if (query.length < CLINICAL_SEARCH_MIN_QUERY_LEN) {
      throw Errors.validation(`Search query must be at least ${CLINICAL_SEARCH_MIN_QUERY_LEN} characters.`);
    }
    if (this.policy.isQueryBlocked(document, query) || isClinicalQueryBlocked(query)) {
      await this.emitQueryEvent(principal, input, query, 0, 'blocked');
      throw Errors.forbidden('This search query is not allowed.');
    }

    const access = await this.clinicalAccess.evaluateForPatientHealthRead({
      actorId: principal.personId,
      audience: principal.audience,
      patientPersonId: input.patientPersonId,
      purpose: input.purpose,
      countryId: country.id,
      countryCode: country.isoAlpha2,
    });
    if (!access.allowed) {
      await this.emitQueryEvent(principal, input, query, 0, 'denied');
      throw Errors.forbidden(ClinicalAccessService.artifactReadDenialMessage(access.reason));
    }

    const allowedTypes = access.consentScope ?? [];
    const rows = await runWithTenant(workerTenantContext({ countryId: country.id }), () =>
      this.prisma.clinicalSearchDocument.findMany({
        where: {
          countryId: country.id,
          personId: input.patientPersonId,
          published: true,
          title: { contains: query, mode: 'insensitive' },
        },
        orderBy: [{ publishedAt: 'desc' }, { artifactId: 'asc' }],
        take: limit * 3,
        select: {
          artifactId: true,
          artifactType: true,
          title: true,
          publishedAt: true,
        },
      }),
    );

    const items: ClinicalSearchResultItem[] = [];
    for (const row of rows) {
      if (!consentScopeIncludes(allowedTypes, row.artifactType)) {
        continue;
      }
      items.push({
        artifact_id: row.artifactId,
        artifact_type: row.artifactType,
        title: row.title,
        published_at: row.publishedAt?.toISOString() ?? null,
      });
      if (items.length >= limit) {
        break;
      }
    }

    await this.emitQueryEvent(principal, input, query, items.length, 'success');
    return {
      country_code: country.isoAlpha2,
      patient_person_id: input.patientPersonId,
      query,
      result_count: items.length,
      items,
    };
  }

  private async emitQueryEvent(
    principal: Principal,
    input: { countryCode: string; patientPersonId: string; purpose: string; requestId?: string },
    query: string,
    resultCount: number,
    outcome: 'success' | 'denied' | 'blocked',
  ) {
    await this.securityEvents.emit({
      type: 'CLINICAL_SEARCH_QUERY',
      outcome: outcome === 'success' ? 'success' : 'failure',
      personId: principal.personId,
      requestId: input.requestId,
      metadata: {
        country_code: input.countryCode,
        patient_person_id: input.patientPersonId,
        purpose: input.purpose,
        query_hash: hashClinicalSearchQuery(query),
        result_count: resultCount,
        outcome,
      },
    });
  }

  static assertNoSensitivePayload(body: unknown) {
    const raw = JSON.stringify(body).toLowerCase();
    for (const token of [
      'diagnosis',
      'lab_result',
      'prescription_version',
      'consult_note',
      'health_timeline',
      'break_glass',
      'symptom',
      'patients like you',
      'payload',
      'hemoglobin',
      'customer_email',
    ]) {
      if (raw.includes(token)) {
        throw new Error(`Sensitive token leaked in clinical search response: ${token}`);
      }
    }
  }

  static isAllowedArtifactType(type: HealthArtifactType): boolean {
    return (
      type === HealthArtifactType.LAB_REPORT ||
      type === HealthArtifactType.IMAGING_REPORT ||
      type === HealthArtifactType.PRESCRIPTION_STRUCTURED
    );
  }
}
