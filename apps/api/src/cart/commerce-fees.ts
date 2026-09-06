/** Policy-pack-driven commerce fee breakdown (integer minor units). */
export type CommerceFeeInput = {
  sell_minor: bigint;
  discount_minor: bigint;
  platform_fee_bps: number;
  platform_fee_flat_minor: number;
  delivery_fee_minor: number;
  packaging_fee_minor: number;
  handling_fee_minor: number;
  payment_convenience_fee_minor: number;
  free_delivery_threshold_minor: number | null;
  carrier_cost_estimate_minor: number;
};

export type CommerceFeeBreakdown = {
  subtotal_minor: string;
  discount_minor: string;
  platform_fee_minor: string;
  packaging_fee_minor: string;
  handling_fee_minor: string;
  payment_convenience_fee_minor: string;
  delivery_fee_minor: string;
  carrier_actual_cost_minor: string;
  delivery_subsidy_minor: string;
  tax_minor: string;
  shipping_minor: string;
  total_minor: string;
  shipping_status: 'QUOTED' | 'UNAVAILABLE';
  shipping_quoted: boolean;
};

export function computeCommerceFees(input: CommerceFeeInput): CommerceFeeBreakdown {
  const subtotal = input.sell_minor - input.discount_minor;
  const platformFee =
    (subtotal * BigInt(input.platform_fee_bps)) / 10000n + BigInt(input.platform_fee_flat_minor);
  const packagingFee = BigInt(input.packaging_fee_minor);
  const handlingFee = BigInt(input.handling_fee_minor);
  const paymentFee = BigInt(input.payment_convenience_fee_minor);
  const carrierActual = BigInt(input.carrier_cost_estimate_minor);
  let customerDelivery = BigInt(input.delivery_fee_minor);
  if (
    input.free_delivery_threshold_minor !== null &&
    subtotal >= BigInt(input.free_delivery_threshold_minor)
  ) {
    customerDelivery = 0n;
  }
  const deliverySubsidy =
    carrierActual > customerDelivery ? carrierActual - customerDelivery : 0n;
  const tax = 0n;
  const total =
    subtotal + platformFee + packagingFee + handlingFee + paymentFee + customerDelivery + tax;
  const shippingQuoted = customerDelivery > 0n || carrierActual > 0n;
  return {
    subtotal_minor: subtotal.toString(),
    discount_minor: input.discount_minor.toString(),
    platform_fee_minor: platformFee.toString(),
    packaging_fee_minor: packagingFee.toString(),
    handling_fee_minor: handlingFee.toString(),
    payment_convenience_fee_minor: paymentFee.toString(),
    delivery_fee_minor: customerDelivery.toString(),
    carrier_actual_cost_minor: carrierActual.toString(),
    delivery_subsidy_minor: deliverySubsidy.toString(),
    tax_minor: tax.toString(),
    shipping_minor: customerDelivery.toString(),
    total_minor: total.toString(),
    shipping_status: shippingQuoted ? 'QUOTED' : 'UNAVAILABLE',
    shipping_quoted: shippingQuoted,
  };
}
