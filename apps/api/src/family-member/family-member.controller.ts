import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { FamilyMemberService } from './family-member.service';

@Controller('me/family-members')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer')
export class FamilyMemberController {
  constructor(private readonly members: FamilyMemberService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal, @Query('country_code') countryCode?: string) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.members.list(principal, countryCode);
  }

  @Post()
  create(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      country_code?: string;
      display_name?: string;
      relationship_code?: string;
      age_years?: number | null;
      phone?: string | null;
      notes?: string | null;
    },
  ) {
    return this.members.create(principal, {
      country_code: body.country_code ?? '',
      display_name: body.display_name ?? '',
      relationship_code: body.relationship_code,
      age_years: body.age_years,
      phone: body.phone,
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
      display_name?: string;
      relationship_code?: string;
      age_years?: number | null;
      phone?: string | null;
      notes?: string | null;
    },
  ) {
    return this.members.update(principal, id, body);
  }

  @Delete(':id')
  remove(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.members.remove(principal, id);
  }
}
