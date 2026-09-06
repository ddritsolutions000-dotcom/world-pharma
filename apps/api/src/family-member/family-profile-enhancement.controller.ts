import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { FamilyProfileEnhancementService } from './family-profile-enhancement.service';

/**
 * Enhanced family profile controller - 1mg-style family management
 * Provides health records sharing, appointment booking, analytics for family members
 */
@Controller('me/family-profile')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer')
export class FamilyProfileEnhancementController {
  constructor(
    private readonly familyEnhancement: FamilyProfileEnhancementService
  ) {}

  /**
   * Get family health summary (1mg-style family health overview)
   */
  @Get('health-summary')
  async getFamilyHealthSummary(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string
  ) {
    return this.familyEnhancement.getFamilyHealthSummary(principal, countryCode);
  }

  /**
   * Get family member's health records (1mg-style)
   */
  @Get(':member_id/health-records')
  async getFamilyMemberHealthRecords(
    @CurrentPrincipal() principal: Principal,
    @Param('member_id') familyMemberId: string,
    @Query('country_code') countryCode?: string
  ) {
    return this.familyEnhancement.getFamilyMemberHealthRecords(
      principal,
      familyMemberId,
      countryCode
    );
  }

  /**
   * Book appointment for family member (1mg-style)
   */
  @Post(':member_id/appointments')
  async bookAppointmentForFamilyMember(
    @CurrentPrincipal() principal: Principal,
    @Param('member_id') familyMemberId: string,
    @Body() bookingData: any,
    @Query('country_code') countryCode?: string
  ) {
    return this.familyEnhancement.bookAppointmentForFamilyMember(
      principal,
      familyMemberId,
      bookingData,
      countryCode
    );
  }

  /**
   * Share health records with family member (1mg-style consent management)
   */
  @Post(':member_id/share-records')
  async shareHealthRecords(
    @CurrentPrincipal() principal: Principal,
    @Param('member_id') familyMemberId: string,
    @Body() body: { record_types: string[] },
    @Query('country_code') countryCode?: string
  ) {
    return this.familyEnhancement.shareHealthRecords(
      principal,
      familyMemberId,
      body.record_types,
      countryCode
    );
  }

  /**
   * Get family analytics (1mg-style family health insights)
   */
  @Get('analytics')
  async getFamilyAnalytics(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string
  ) {
    return this.familyEnhancement.getFamilyAnalytics(principal, countryCode);
  }
}
