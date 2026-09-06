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
import { helpMediaPath, isCmsStoreKey, isPublicCmsMediaContentType } from './cms-public-media';
import { assertUuid, resolveCountryByCode } from './cms-country';

const CMS_ASSET_FOLDER_PATTERN = /^[a-z0-9][a-z0-9/_-]{0,63}$/;

function normalizeCmsAssetFolder(raw: string | undefined): string | null {
  const value = raw?.trim().toLowerCase();
  if (!value) {
    return null;
  }
  if (!CMS_ASSET_FOLDER_PATTERN.test(value)) {
    throw Errors.validation('Invalid media folder name');
  }
  return value;
}

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
      alt_text?: string;
      folder?: string;
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

    const altText = body.alt_text?.trim().slice(0, 500) || null;
    const folder = normalizeCmsAssetFolder(body.folder);
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
          altText,
          folder,
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
        alt_text: asset.altText,
        folder: asset.folder,
        created_at: asset.createdAt.toISOString(),
        public_path: helpMediaPath(asset.id, country.isoAlpha2),
      };
    });
  }

  async listAssets(principal: Principal, countryCode?: string, folder?: string) {
    const country = await resolveCountryByCode(this.prisma, countryCode);
    const folderFilter = folder === undefined ? undefined : normalizeCmsAssetFolder(folder);
    return runWithTenant(workerTenantContext({ countryId: country.id, personId: principal.personId }), async () => {
      const rows = await this.prisma.cmsContentAsset.findMany({
        where: {
          countryId: country.id,
          ...(folderFilter === undefined ? {} : { folder: folderFilter }),
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          contentItemId: true,
          contentType: true,
          byteSize: true,
          altText: true,
          folder: true,
          createdAt: true,
        },
      });
      return {
        data: rows.map((row) => ({
          asset_id: row.id,
          content_item_id: row.contentItemId,
          content_type: row.contentType,
          byte_size: row.byteSize,
          alt_text: row.altText,
          folder: row.folder,
          created_at: row.createdAt.toISOString(),
          public_path: helpMediaPath(row.id, country.isoAlpha2),
        })),
      };
    });
  }

  async servePublished(assetId: string, countryCode?: string) {
    assertUuid(assetId, 'asset id');
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(workerTenantContext({ countryId: country.id }), async () => {
      const asset = await this.prisma.cmsContentAsset.findFirst({
        where: { id: assetId, countryId: country.id },
        include: {
          contentItem: {
            select: {
              id: true,
              contentType: true,
              searchDocument: { select: { published: true } },
            },
          },
        },
      });
      if (!asset?.contentItemId || !asset.contentItem) {
        throw Errors.notFound('Media not found');
      }
      if (!isCmsStoreKey(asset.storageKey)) {
        throw Errors.notFound('Media not found');
      }
      if (!isPublicCmsMediaContentType(asset.contentItem.contentType)) {
        throw Errors.notFound('Media not found');
      }
      if (!asset.contentItem.searchDocument?.published) {
        throw Errors.notFound('Media not found');
      }
      const object = await this.objects.get(asset.storageKey);
      return { bytes: object.bytes, contentType: asset.contentType };
    });
  }

  async updateAsset(
    principal: Principal,
    assetId: string,
    body: { country_code?: string; alt_text?: string; folder?: string },
  ) {
    assertUuid(assetId, 'asset id');
    const country = await resolveCountryByCode(this.prisma, body.country_code);
    const altText = body.alt_text === undefined ? undefined : body.alt_text.trim().slice(0, 500) || null;
    const folder = body.folder === undefined ? undefined : normalizeCmsAssetFolder(body.folder);
    return runWithTenant(workerTenantContext({ countryId: country.id, personId: principal.personId }), async () => {
      const asset = await this.prisma.cmsContentAsset.findFirst({
        where: { id: assetId, countryId: country.id },
      });
      if (!asset) {
        throw Errors.notFound('CMS asset not found');
      }
      const updated = await this.prisma.cmsContentAsset.update({
        where: { id: assetId },
        data: {
          ...(altText === undefined ? {} : { altText }),
          ...(folder === undefined ? {} : { folder }),
        },
      });
      return {
        asset_id: updated.id,
        alt_text: updated.altText,
        folder: updated.folder,
        public_path: helpMediaPath(updated.id, country.isoAlpha2),
      };
    });
  }
}
