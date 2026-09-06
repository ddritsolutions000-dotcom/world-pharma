import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { CorporateWellnessService } from './corporate-wellness.service';

/**
 * Corporate wellness B2B controller - 1mg-style corporate healthcare
 * Provides employee health benefits, wellness programs, and corporate partnerships
 */
@Controller('corporate/wellness')
@UseGuards(JwtAuthGuard, AudienceGuard)
export class CorporateWellnessController {
  constructor(private readonly corporateWellness: CorporateWellnessService) {}

  /**
   * Get corporate wellness programs (1mg-style B2B offerings)
   */
  @Get('programs')
  async getCorporatePrograms(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string
  ) {
    return this.corporateWellness.getCorporatePrograms(principal, countryCode);
  }

  /**
   * Register corporate partner (1mg-style B2B onboarding)
   */
  @Post('register')
  async registerCorporatePartner(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      country_code?: string;
      company_name: string;
      company_type: string;
      industry: string;
      employee_count: number;
      contact_person: string;
      contact_email: string;
      contact_phone: string;
      address: any;
      interested_programs: string[];
      notes?: string;
    }
  ) {
    return this.corporateWellness.registerCorporatePartner(principal, body);
  }

  /**
   * Get corporate dashboard (1mg-style B2B dashboard)
   */
  @Get('dashboard/:corporate_id')
  async getCorporateDashboard(
    @CurrentPrincipal() principal: Principal,
    @Param('corporate_id') corporateId: string,
    @Query('country_code') countryCode?: string
  ) {
    return this.corporateWellness.getCorporateDashboard(principal, corporateId, countryCode);
  }

  /**
   * Create employee enrollment (1mg-style employee management)
   */
  @Post('employees/enroll')
  async enrollEmployee(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      corporate_id: string;
      employee_id: string;
      name: string;
      email: string;
      phone: string;
      department: string;
      date_of_birth: string;
      programs: string[];
    }
  ) {
    return this.corporateWellness.enrollEmployee(principal, body.corporate_id, body);
  }

  /**
   * Get corporate analytics (1mg-style B2B analytics)
   */
  @Get('analytics/:corporate_id')
  async getCorporateAnalytics(
    @CurrentPrincipal() principal: Principal,
    @Param('corporate_id') corporateId: string,
    @Query('country_code') countryCode?: string
  ) {
    return this.corporateWellness.getCorporateAnalytics(principal, corporateId, countryCode);
  }
}
