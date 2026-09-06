import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { MedicationReminderService } from './medication-reminder.service';

@Controller('me/medication-reminders')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer')
export class MedicationReminderController {
  constructor(private readonly reminders: MedicationReminderService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal, @Query('country_code') countryCode?: string) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.reminders.list(principal, countryCode);
  }

  @Post()
  create(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      country_code?: string;
      medicine_label?: string;
      prescription_id?: string | null;
      schedule_times?: string[];
      days_of_week?: number[];
      enabled?: boolean;
      notes?: string | null;
    },
  ) {
    return this.reminders.create(principal, {
      country_code: body.country_code ?? '',
      medicine_label: body.medicine_label ?? '',
      prescription_id: body.prescription_id,
      schedule_times: body.schedule_times ?? [],
      days_of_week: body.days_of_week,
      enabled: body.enabled,
      notes: body.notes,
    });
  }

  @Patch(':id')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body()
    body: {
      country_code?: string;
      medicine_label?: string;
      prescription_id?: string | null;
      schedule_times?: string[];
      days_of_week?: number[];
      enabled?: boolean;
      notes?: string | null;
    },
  ) {
    return this.reminders.update(principal, id, body);
  }

  @Get(':id/buy-again')
  buyAgain(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('country_code') countryCode?: string,
  ) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.reminders.buyAgain(principal, id, countryCode);
  }

  @Delete(':id')
  remove(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.reminders.remove(principal, id);
  }
}
