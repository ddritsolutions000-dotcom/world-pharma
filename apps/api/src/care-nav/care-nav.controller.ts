import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { CareNavigationService } from './care-navigation.service';
import { CareMatchService } from './care-match.service';
import { CareNavHandoffService } from './care-nav-handoff.service';

@Controller('care-nav')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer')
export class CareNavController {
  constructor(
    private readonly careNav: CareNavigationService,
    private readonly careMatch: CareMatchService,
    private readonly careHandoff: CareNavHandoffService,
  ) {}

  @Post('sessions')
  createSession(
    @CurrentPrincipal() principal: Principal,
    @Body() body: { country_code: string; chief_complaint: string },
    @Headers('x-idempotency-key') idempotencyKey?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.careNav.createSession(
      principal,
      {
        countryCode: body.country_code,
        chiefComplaint: body.chief_complaint,
        idempotencyKey,
      },
      requestId,
    );
  }

  @Get('sessions/:id')
  getSession(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('country_code') countryCode: string,
  ) {
    return this.careNav.getSession(principal, id, countryCode);
  }

  @Post('sessions/:id/answers')
  @HttpCode(200)
  submitAnswer(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('country_code') countryCode: string,
    @Body() body: { question_key: string; answer_text: string },
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.careNav.submitAnswer(principal, id, countryCode, body, requestId);
  }

  @Post('sessions/:id/complete-intake')
  completeIntake(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('country_code') countryCode: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.careNav.completeIntake(principal, id, countryCode, requestId);
  }

  @Get('sessions/:id/assessment')
  getAssessment(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('country_code') countryCode: string,
  ) {
    return this.careNav.getAssessment(principal, id, countryCode);
  }

  @Post('sessions/:id/terminate')
  terminateSession(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('country_code') countryCode: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.careNav.terminateSession(principal, id, countryCode, requestId);
  }

  @Get('sessions/:id/recommendations')
  getRecommendations(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('country_code') countryCode: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.careMatch.getRecommendations(principal, id, countryCode, requestId);
  }

  @Post('sessions/:id/handoff/appointment')
  @HttpCode(200)
  handoffAppointment(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('country_code') countryCode: string,
    @Body()
    body: {
      doctor_profile_id?: string;
      starts_at?: string;
      type?: string;
      authorized?: boolean;
    },
    @Headers('x-idempotency-key') idempotencyKey?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.careHandoff.bookAppointment(
      principal,
      id,
      countryCode,
      {
        doctorProfileId: body.doctor_profile_id ?? '',
        startsAt: body.starts_at ?? '',
        type: body.type,
        authorized: body.authorized,
        idempotencyKey,
      },
      requestId,
    );
  }

  @Get('sessions/:id/handoff/status')
  getHandoffStatus(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('country_code') countryCode: string,
  ) {
    return this.careHandoff.getHandoffStatus(principal, id, countryCode);
  }
}
