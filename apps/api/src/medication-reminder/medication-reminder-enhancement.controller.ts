import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { requireCountryCode } from '../catalog/catalog-country';
import { MedicationReminderEnhancementService } from './medication-reminder-enhancement.service';

/**
 * Enhanced medication reminder controller - 1mg-style smart reminders
 * Provides intelligent refill alerts, adherence tracking, and drug interaction checks
 */
@Controller('customer/medication-reminders')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer')
export class MedicationReminderEnhancementController {
  constructor(
    private readonly reminderEnhancement: MedicationReminderEnhancementService
  ) {}

  /**
   * Get smart refill reminders (1mg-style intelligent reminders)
   */
  @Get('refill-alerts')
  async getSmartRefillReminders(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string
  ) {
    return this.reminderEnhancement.getSmartRefillReminders(principal, countryCode);
  }

  /**
   * Create intelligent medication reminder (1mg-style smart reminders)
   */
  @Post('smart-reminder')
  async createSmartReminder(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      country_code?: string;
      prescription_id?: string;
      medicine_label: string;
      dosage: string;
      frequency: string;
      start_date: string;
      end_date?: string;
      reminder_times: string[];
      instructions?: string;
    }
  ) {
    return this.reminderEnhancement.createSmartReminder(principal, body);
  }

  /**
   * Get medication adherence insights (1mg-style adherence tracking)
   */
  @Get('adherence-insights')
  async getAdherenceInsights(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string
  ) {
    return this.reminderEnhancement.getAdherenceInsights(principal, countryCode);
  }

  /**
   * Get drug interaction alerts (1mg-style safety checks)
   */
  @Post('drug-interactions')
  async getDrugInteractionAlerts(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      medicine_ids: string[];
      country_code?: string;
    }
  ) {
    return this.reminderEnhancement.getDrugInteractionAlerts(
      principal,
      body.medicine_ids,
      requireCountryCode(body.country_code)
    );
  }
}
