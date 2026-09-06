import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { HealthProfileService } from './health-profile.service';
import { HealthSubjectService } from './health-subject.service';

@Controller('health/profile')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer')
export class HealthProfileController {
  constructor(
    private readonly profiles: HealthProfileService,
    private readonly subjects: HealthSubjectService,
  ) {}

  @Get('subjects')
  listSubjects(@CurrentPrincipal() principal: Principal, @Query('country_code') countryCode?: string) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.subjects.listAuthorizedSubjects(principal, countryCode);
  }

  @Get()
  getProfile(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string,
    @Query('family_member_id') familyMemberId?: string,
  ) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.profiles.getProfile(principal, countryCode, familyMemberId);
  }

  @Patch()
  updateProfile(@CurrentPrincipal() principal: Principal, @Body() body: Record<string, unknown>) {
    if (!String(body.country_code ?? '').trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.profiles.updateProfile(principal, String(body.country_code), {
      blood_type: body.blood_type as string | null | undefined,
      notes: body.notes as string | null | undefined,
      family_member_id: body.family_member_id as string | null | undefined,
    });
  }

  @Post('allergies')
  addAllergy(@CurrentPrincipal() principal: Principal, @Body() body: Record<string, unknown>) {
    if (!String(body.country_code ?? '').trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.profiles.addAllergy(principal, String(body.country_code), body as never);
  }

  @Patch('allergies/:id')
  updateAllergy(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.profiles.updateAllergy(principal, id, body as never);
  }

  @Delete('allergies/:id')
  removeAllergy(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('country_code') countryCode?: string,
    @Query('family_member_id') familyMemberId?: string,
  ) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.profiles.removeAllergy(principal, id, countryCode, familyMemberId);
  }

  @Post('conditions')
  addCondition(@CurrentPrincipal() principal: Principal, @Body() body: Record<string, unknown>) {
    if (!String(body.country_code ?? '').trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.profiles.addCondition(principal, String(body.country_code), body as never);
  }

  @Post('vitals')
  addVital(@CurrentPrincipal() principal: Principal, @Body() body: Record<string, unknown>) {
    if (!String(body.country_code ?? '').trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.profiles.addVital(principal, String(body.country_code), body as never);
  }

  @Post('emergency-contact')
  upsertEmergencyContact(
    @CurrentPrincipal() principal: Principal,
    @Body() body: Record<string, unknown>,
  ) {
    if (!String(body.country_code ?? '').trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.profiles.upsertEmergencyContact(principal, String(body.country_code), body as never);
  }
}
