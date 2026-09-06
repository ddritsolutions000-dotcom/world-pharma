import { Controller, Get, Query } from '@nestjs/common';
import { OrderService } from './order.service';

/** Guest order tracking — verify with order number + delivery postal code (1mg-style). */
@Controller('orders')
export class OrderPublicController {
  constructor(private readonly orders: OrderService) {}

  @Get('track')
  track(
    @Query('order_number') orderNumber: string,
    @Query('postal_code') postalCode: string,
  ) {
    return this.orders.trackPublic(orderNumber ?? '', postalCode ?? '');
  }
}
