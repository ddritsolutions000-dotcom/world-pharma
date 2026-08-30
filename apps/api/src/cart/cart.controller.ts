import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PaymentService } from '../payment/payment.service';
import { CartService } from './cart.service';

@Controller('me')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer')
export class CartController {
  constructor(
    private readonly carts: CartService,
    private readonly payments: PaymentService,
  ) {}

  @Get('cart')
  cart(@CurrentPrincipal() principal: Principal, @Query('country') country: string) {
    if (!country) {
      throw Errors.validation('country is required.');
    }
    return this.carts.getCart(principal, country);
  }

  @Post('cart/items')
  add(
    @CurrentPrincipal() principal: Principal,
    @Query('country') country: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: { offer_id?: string; qty?: number; prescription_case_id?: string },
  ) {
    if (!country || !body.offer_id || body.qty === undefined) {
      throw Errors.validation('country, offer_id and qty are required.');
    }
    return this.carts.addItem(
      principal,
      country,
      { offerId: body.offer_id, qty: Number(body.qty), prescriptionCaseId: body.prescription_case_id },
      idempotencyKey,
    );
  }

  @Patch('cart/items/:id')
  patch(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: { qty?: number },
  ) {
    if (body.qty === undefined) {
      throw Errors.validation('qty is required.');
    }
    return this.carts.patchItem(principal, id, Number(body.qty), idempotencyKey);
  }

  @Delete('cart/items/:id')
  remove(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.carts.removeItem(principal, id, idempotencyKey);
  }

  @Get('addresses')
  addresses(@CurrentPrincipal() principal: Principal) {
    return this.carts.listAddresses(principal);
  }

  @Post('addresses')
  createAddress(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      country_code?: string;
      recipient_name?: string;
      phone?: string;
      region?: string;
      city?: string;
      postal_code?: string;
      line1?: string;
      line2?: string;
      is_default?: boolean;
    },
  ) {
    return this.carts.createAddress(principal, {
      countryCode: String(body.country_code ?? ''),
      recipientName: String(body.recipient_name ?? ''),
      phone: body.phone,
      region: body.region,
      city: String(body.city ?? ''),
      postalCode: body.postal_code,
      line1: String(body.line1 ?? ''),
      line2: body.line2,
      isDefault: body.is_default,
    });
  }

  @Patch('addresses/:id')
  patchAddress(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body()
    body: {
      recipient_name?: string;
      phone?: string;
      region?: string;
      city?: string;
      postal_code?: string;
      line1?: string;
      line2?: string;
      is_default?: boolean;
    },
  ) {
    return this.carts.updateAddress(principal, id, {
      recipientName: body.recipient_name,
      phone: body.phone,
      region: body.region,
      city: body.city,
      postalCode: body.postal_code,
      line1: body.line1,
      line2: body.line2,
      isDefault: body.is_default,
    });
  }

  @Delete('addresses/:id')
  removeAddress(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.carts.deleteAddress(principal, id);
  }

  @Post('checkout/sessions')
  start(
    @CurrentPrincipal() principal: Principal,
    @Query('country') country: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: { affiliate_code?: string },
  ) {
    if (!country) {
      throw Errors.validation('country is required.');
    }
    return this.carts.startCheckout(principal, country, idempotencyKey, body.affiliate_code);
  }

  @Post('checkout/sessions/:id/fulfillment')
  fulfillment(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { address_id?: string },
  ) {
    if (!body.address_id) {
      throw Errors.validation('address_id is required.');
    }
    return this.carts.attachAddress(principal, id, body.address_id);
  }

  @Post('checkout/sessions/:id/promo')
  promo(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { promo_code?: string },
  ) {
    return this.carts.setPromo(principal, id, body.promo_code);
  }

  @Post('checkout/sessions/:id/quote')
  quote(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.carts.quoteSession(principal, id, idempotencyKey, false);
  }

  @Post('checkout/sessions/:id/validate')
  validate(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.carts.validateSession(principal, id);
  }

  @Post('checkout/sessions/:id/revalidate')
  revalidate(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.carts.quoteSession(principal, id, idempotencyKey, true);
  }

  @Post('checkout/sessions/:id/pay')
  pay(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body?: { method?: string; scenario?: string; amount_minor?: string },
  ) {
    const payload = body && typeof body === 'object' ? body : {};
    if (payload.amount_minor) {
      throw Errors.problem(400, 'AMOUNT_TAMPER', 'Amount rejected', 'Client totals are ignored. Pay uses the frozen quote.');
    }
    return this.payments.payCheckout(
      principal,
      id,
      { method: payload.method, scenario: payload.scenario },
      idempotencyKey ?? '',
    );
  }
}
