import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Errors } from '../common/problem';
import { resolveClientIp } from '../common/client-ip';
import { RateLimitService } from '../identity/rate-limit.service';
import {
  DISCOVERY_MAX_LIMIT,
  DISCOVERY_MAX_QUERY_LEN,
  SUGGEST_MAX_LIMIT,
  parseDiscoveryTypes,
} from './discovery-query';
import { DiscoverySearchService } from './discovery-search.service';

const discoveryQuerySchema = z
  .object({
    country: z.string().length(2),
    locale: z.string().min(2).max(35).optional(),
    q: z.string().max(DISCOVERY_MAX_QUERY_LEN).optional(),
    limit: z.coerce.number().int().min(1).max(DISCOVERY_MAX_LIMIT).optional(),
    cursor: z.string().min(1).optional(),
    types: z.union([z.string(), z.array(z.string())]).optional(),
    brand: z.string().min(1).max(120).optional(),
    category: z.string().min(1).max(120).optional(),
    manufacturer: z.string().min(1).max(120).optional(),
    specialty: z.string().min(1).max(120).optional(),
    city: z.string().min(1).max(120).optional(),
    lab_org_id: z.string().uuid().optional(),
    rx: z.enum(['true', 'false']).optional(),
    in_stock: z.enum(['true', 'false']).optional(),
    sort: z.enum(['relevance', 'price_asc', 'price_desc', 'rating', 'discount']).optional(),
  })
  .strict();

const suggestQuerySchema = z
  .object({
    country: z.string().length(2),
    locale: z.string().min(2).max(35).optional(),
    q: z.string().max(DISCOVERY_MAX_QUERY_LEN).optional(),
    limit: z.coerce.number().int().min(1).max(SUGGEST_MAX_LIMIT).optional(),
    types: z.union([z.string(), z.array(z.string())]).optional(),
  })
  .strict();

@Controller('discovery')
export class DiscoveryCustomerController {
  constructor(
    private readonly discovery: DiscoverySearchService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get('search')
  async search(@Query() query: Record<string, unknown>, @Req() req: Request) {
    const hit = await this.rateLimit.hit(`discovery:search:ip:${resolveClientIp(req)}`, 60, 60);
    if (!hit.allowed) {
      throw Errors.rateLimited(hit.retryAfter);
    }
    const parsed = discoveryQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw Errors.validation('Invalid discovery search parameters.');
    }
    const types = parseDiscoveryTypes(parsed.data.types);
    return this.discovery.search({
      countryCode: parsed.data.country,
      locale: parsed.data.locale ?? 'en',
      query: parsed.data.q ?? '',
      types,
      limit: parsed.data.limit,
      cursor: parsed.data.cursor,
      brand: parsed.data.brand,
      category: parsed.data.category,
      manufacturer: parsed.data.manufacturer,
      specialty: parsed.data.specialty,
      city: parsed.data.city,
      labOrgId: parsed.data.lab_org_id,
      rx: parsed.data.rx === undefined ? undefined : parsed.data.rx === 'true',
      in_stock: parsed.data.in_stock === undefined ? undefined : parsed.data.in_stock === 'true',
      sort: parsed.data.sort,
    });
  }

  @Get('suggest')
  async suggest(@Query() query: Record<string, unknown>, @Req() req: Request) {
    const hit = await this.rateLimit.hit(`discovery:suggest:ip:${resolveClientIp(req)}`, 120, 60);
    if (!hit.allowed) {
      throw Errors.rateLimited(hit.retryAfter);
    }
    const parsed = suggestQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw Errors.validation('Invalid discovery suggest parameters.');
    }
    const types = parseDiscoveryTypes(parsed.data.types);
    return this.discovery.suggest({
      countryCode: parsed.data.country,
      locale: parsed.data.locale ?? 'en',
      query: parsed.data.q ?? '',
      types,
      limit: parsed.data.limit,
    });
  }
}
