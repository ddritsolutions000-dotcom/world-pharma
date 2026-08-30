import { Body, Controller, Get, HttpCode, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { DoctorService } from './doctor.service';
import { ScheduleService } from './schedule.service';

@Controller('doctor')
@UseGuards(JwtAuthGuard)
export class DoctorController {
  constructor(
    private readonly doctors: DoctorService,
    private readonly schedule: ScheduleService,
  ) {}

  @Post('applications')
  @HttpCode(200)
  startOnboarding(
    @Body() body: { country_code?: string },
    @CurrentPrincipal() principal: Principal,
  ) {
    if (!['doctor', 'partner_applicant', 'customer'].includes(principal.audience)) {
      throw Errors.forbidden('Doctor onboarding requires a doctor or customer session');
    }
    if (!body.country_code) {
      throw Errors.validation('country_code is required');
    }
    return this.doctors.startOnboarding({
      personId: principal.personId,
      countryCode: body.country_code,
    });
  }

  @Get('me')
  me(@CurrentPrincipal() principal: Principal) {
    this.assertDoctorAudience(principal);
    return this.doctors.getMe(principal.personId);
  }

  @Patch('me')
  updateMe(
    @Body()
    body: {
      display_name?: string;
      professional_name?: string;
      gender?: string | null;
      languages?: string[];
      specialties?: string[];
      bio?: string | null;
      years_experience?: number | null;
      timezone?: string;
      consultation_config?: Record<string, unknown>;
      online_capable?: boolean;
    },
    @CurrentPrincipal() principal: Principal,
  ) {
    this.assertDoctorAudience(principal);
    return this.doctors.updateProfile(principal.personId, body);
  }

  @Post('me/credentials')
  @HttpCode(200)
  submitCredential(
    @Body()
    body: {
      credential_type?: string;
      issuer?: string;
      number?: string;
      issued_on?: string;
      expires_on?: string;
    },
    @CurrentPrincipal() principal: Principal,
  ) {
    this.assertDoctorAudience(principal);
    return this.doctors.submitCredential({
      personId: principal.personId,
      credentialType: body.credential_type ?? '',
      issuer: body.issuer ?? '',
      number: body.number ?? '',
      issuedOn: body.issued_on,
      expiresOn: body.expires_on,
    });
  }

  @Get('me/credentials')
  credentials(@CurrentPrincipal() principal: Principal) {
    this.assertDoctorAudience(principal);
    return this.doctors.getMe(principal.personId).then((me) => ({ credentials: me.credentials }));
  }

  @Get('me/organizations')
  organizations(@CurrentPrincipal() principal: Principal) {
    this.assertDoctorAudience(principal);
    return this.doctors.getMe(principal.personId).then((me) => ({ organizations: me.organizations }));
  }

  @Get('me/availability')
  availability(@CurrentPrincipal() principal: Principal) {
    this.assertDoctorAudience(principal);
    return this.schedule.summary(principal.personId);
  }

  @Get('me/health-patients')
  healthPatients(
    @Query('country_code') countryCode: string | undefined,
    @CurrentPrincipal() principal: Principal,
  ) {
    this.assertDoctorAudience(principal);
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.doctors.listHealthPatients({
      doctorPersonId: principal.personId,
      countryCode: countryCode.trim(),
    });
  }

  @Get('me/settings')
  settings(@CurrentPrincipal() principal: Principal) {
    this.assertDoctorAudience(principal);
    return this.doctors.getMe(principal.personId).then((me) => me.settings);
  }

  private assertDoctorAudience(principal: Principal) {
    if (principal.audience !== 'doctor' && principal.audience !== 'partner_applicant') {
      throw Errors.forbidden('Doctor workspace requires a doctor session');
    }
  }
}
