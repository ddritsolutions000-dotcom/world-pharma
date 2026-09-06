import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { SpecialityCareService } from './speciality-care.service';

/**
 * Customer-facing speciality care controller - 1mg-style specialized healthcare
 * Provides cancer care, obesity management, vaccination, and chronic disease programs
 */
@Controller('customer/speciality-care')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer')
export class SpecialityCareController {
  constructor(private readonly specialityCare: SpecialityCareService) {}

  /**
   * Get speciality care programs (1mg-style speciality programs)
   */
  @Get('programs')
  async getSpecialityPrograms(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string
  ) {
    return this.specialityCare.getSpecialityPrograms(principal, countryCode);
  }

  /**
   * Get speciality program details (1mg-style program information)
   */
  @Get('programs/:program_id')
  async getProgramDetails(
    @CurrentPrincipal() principal: Principal,
    @Param('program_id') programId: string,
    @Query('country_code') countryCode?: string
  ) {
    return this.specialityCare.getProgramDetails(principal, programId, countryCode);
  }

  /**
   * Enroll in speciality program (1mg-style program enrollment)
   */
  @Post('programs/:program_id/enroll')
  async enrollInProgram(
    @CurrentPrincipal() principal: Principal,
    @Param('program_id') programId: string,
    @Body()
    body: {
      country_code?: string;
      patient_details?: any;
      preferred_start_date?: string;
      notes?: string;
    }
  ) {
    return this.specialityCare.enrollInProgram(principal, programId, body);
  }

  /**
   * Get vaccination services (1mg-style vaccination booking)
   */
  @Get('vaccinations')
  async getVaccinationServices(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string
  ) {
    return this.specialityCare.getVaccinationServices(principal, countryCode);
  }

  /**
   * Book vaccination appointment (1mg-style vaccination booking)
   */
  @Post('vaccinations/book')
  async bookVaccination(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      vaccination_id: string;
      country_code?: string;
      preferred_date?: string;
      home_service?: boolean;
      patient_details?: any;
    }
  ) {
    return this.specialityCare.bookVaccination(principal, body);
  }
}
