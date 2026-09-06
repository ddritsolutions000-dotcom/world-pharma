import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { DeliveryService } from './delivery.service';

function parseLocation(body: Record<string, unknown>) {
  const latitude = body.latitude != null ? Number(body.latitude) : undefined;
  const longitude = body.longitude != null ? Number(body.longitude) : undefined;
  const accuracy_meters = body.accuracy_meters != null ? Number(body.accuracy_meters) : undefined;
  if (latitude == null && longitude == null) {
    return undefined;
  }
  return { latitude, longitude, accuracy_meters };
}

@Controller('delivery')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class DeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  @Post('presence')
  presence(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      online?: boolean;
      organization_id?: string;
      latitude?: number;
      longitude?: number;
    },
  ) {
    return this.delivery.setPresence(principal, Boolean(body.online), body.organization_id, {
      latitude: body.latitude,
      longitude: body.longitude,
    });
  }

  @Get('jobs')
  list(@CurrentPrincipal() principal: Principal) {
    return this.delivery.listJobs(principal);
  }

  @Get('jobs/:id')
  get(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.delivery.getJob(principal, id);
  }

  @Post('jobs/:id/accept')
  accept(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.delivery.acceptJob(principal, id);
  }

  @Post('jobs/:id/arrive')
  arrive(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.delivery.arrive(principal, id, parseLocation(body ?? {}));
  }

  @Post('jobs/:id/pickup')
  pickup(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.delivery.pickup(principal, id, parseLocation(body ?? {}));
  }

  @Post('jobs/:id/deliver')
  deliver(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.delivery.deliverSample(principal, id);
  }

  @Post('jobs/:id/pod')
  pod(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { code?: string; photo_uri?: string; latitude?: number; longitude?: number; accuracy_meters?: number },
  ) {
    if (!body.code) {
      throw Errors.validation('code is required.');
    }
    return this.delivery.verifyPod(principal, id, body.code, body.photo_uri, parseLocation(body));
  }

  @Post('jobs/:id/pod/photo')
  podPhoto(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body()
    body: {
      content_base64?: string;
      content_type?: string;
      idempotency_key?: string;
      latitude?: number;
      longitude?: number;
      accuracy_meters?: number;
    },
  ) {
    if (!body.content_base64 || !body.content_type) {
      throw Errors.validation('content_base64 and content_type are required.');
    }
    return this.delivery.attachPodPhoto(principal, id, {
      contentBase64: body.content_base64,
      contentType: body.content_type,
      idempotencyKey: body.idempotency_key,
      location: parseLocation(body),
    });
  }

  @Post('jobs/:id/pod/signature')
  podSignature(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body()
    body: {
      content_base64?: string;
      content_type?: string;
      idempotency_key?: string;
      latitude?: number;
      longitude?: number;
      accuracy_meters?: number;
    },
  ) {
    if (!body.content_base64 || !body.content_type) {
      throw Errors.validation('content_base64 and content_type are required.');
    }
    return this.delivery.attachPodSignature(principal, id, {
      contentBase64: body.content_base64,
      contentType: body.content_type,
      idempotencyKey: body.idempotency_key,
      location: parseLocation(body),
    });
  }

  @Get('jobs/:id/pod/evidence/:kind')
  podEvidence(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Param('kind') kind: string,
  ) {
    const normalized = kind.toUpperCase();
    if (normalized !== 'PHOTO' && normalized !== 'SIGNATURE') {
      throw Errors.validation('kind must be photo or signature.');
    }
    return this.delivery.getPodEvidenceTicket(principal, id, normalized as 'PHOTO' | 'SIGNATURE');
  }

  @Post('jobs/:id/fail')
  fail(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.delivery.failDelivery(principal, id, body.reason ?? 'failed');
  }

  @Post('jobs/:id/rto')
  rto(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.delivery.startRto(principal, id);
  }
}
