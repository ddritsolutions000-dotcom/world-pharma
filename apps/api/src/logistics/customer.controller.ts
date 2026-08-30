import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { LogisticsService } from './logistics.service';

@Controller()
export class LogisticsCustomerController {
  constructor(private readonly logistics: LogisticsService) {}

  @Get('shipping/quotes')
  quote(
    @Query('country') country: string,
    @Query('origin') origin: string,
    @Query('dest') dest: string,
    @Query('currency') currency = 'XXX',
    @Query('international') international?: string,
  ) {
    return this.logistics.quote({
      countryIso2: country ?? 'XX',
      originIso2: origin ?? country ?? 'XX',
      destIso2: dest ?? country ?? 'XX',
      currency,
      international: international === 'true' || Boolean(origin && dest && origin !== dest),
    });
  }

  @Get('me/shipments')
  @UseGuards(JwtAuthGuard)
  list(@CurrentPrincipal() principal: Principal) {
    return this.logistics.listCustomer(principal);
  }

  @Get('me/shipments/:id')
  @UseGuards(JwtAuthGuard)
  get(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.logistics.getCustomer(principal, id);
  }
}
