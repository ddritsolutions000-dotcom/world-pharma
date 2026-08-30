import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import {
  AllowAllMalwareScanner,
  MalwareScanner,
  MAX_CMS_ASSET_BYTES,
  ALLOWED_CMS_ASSET_CONTENT_TYPES,
  PrivateObjectStore,
} from '../partner/object-store';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { assertUuid, resolveCountryByCode } from './cms-country';

@Injectable()
export class CmsAssetService {
  private readonly scanner: MalwareScanner = new AllowAllMalwareScanner();

  constructor(
    private readonly prisma: PrismaService,
    private readonly objects: PrivateObjectStore,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  async uploadAsset(
    principal: Principal,
    body: {
      country_code?: string;
      content_item_id?: string;
      content_base64?: string;
      content_type?: string;
      original_name?: string;
      idempotency_key?: string;
    },
  ) {
    const country = await resolveCountryByCode(this.prisma, body.country_code);
    const contentType = body.content_type?.trim().toLowerCase();
    if (!contentType || !ALLOWED_CMS_ASSET_CONTENT_TYPES.has(contentType)) {
      throw Errors.validation('Unsupported asset content type');
    }
    const encoded = body.content_base64?.trim();
    if (!encoded) {
      throw Errors.validation('content_base64 is required');
    }
    let bytes: Buffer;
    try {
      bytes = Buffer.from(encoded, 'base64');
    } catch {
      throw Errors.validation('Invalid base64 payload');
    }
    if (!bytes.length) {
      throw Errors.validation('Asset payload is empty');
    }
    if (bytes.length > MAX_CMS_ASSET_BYTES) {
      throw Errors.validation('Asset exceeds size limit');
    }

    const contentItemId = body.content_item_id?.trim();
    if (contentItemId) {
      assertUuid(contentItemId, 'content item id');
    }

    const scan = await this.scanner.scan(bytes, contentType);
    if (!scan.clean) {
      throw Errors.validation('Asset failed malware scan');
    }

    return runWithTenant(workerTenantContext({ countryId: country.id, personId: principal.personId }), async () => {
      if (contentItemId) {
        const item = await this.prisma.cmsContentItem.findFirst({
          where: { id: contentItemId, countryId: country.id },
        });
        if (!item) {
          throw Errors.notFound('CMS content not found');
        }
      }

      const stored = await this.objects.put({
        bytes,
        contentType,
        prefix: `cms/${country.id}`,
      });

      const assetId = uuidv7();
      const asset = await this.prisma.cmsContentAsset.create({
        data: {
          id: assetId,
          contentItemId: contentItemId ?? null,
          countryId: country.id,
          storageKey: stored.key,
          contentType: stored.contentType,
          byteSize: stored.byteSize,
          checksumSha256: stored.checksumSha256,
          createdByPersonId: principal.personId,
        },
      });

      await this.securityEvents.emit({
        type: 'CMS_ASSET_UPLOADED',
        outcome: 'success',
        personId: principal.personId,
        metadata: {
          asset_id: asset.id,
          country_id: country.id,
          content_item_id: contentItemId ?? null,
          byte_size: asset.byteSize,
          content_type: asset.contentType,
        },
      });

      return {
        asset_id: asset.id,
        country_id: asset.countryId,
        content_item_id: asset.contentItemId,
        content_type: asset.contentType,
        byte_size: asset.byteSize,
        checksum_sha256: asset.checksumSha256,
        created_at: asset.createdAt.toISOString(),
      };
    });
  }
}
