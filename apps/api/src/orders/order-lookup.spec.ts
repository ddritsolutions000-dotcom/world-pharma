import { orderIdOrNumberWhere } from './order-lookup';

describe('orderIdOrNumberWhere', () => {
  it('looks up UUIDs by id or orderNumber', () => {
    const id = '01a06977-640d-741b-91c2-f6c2ff405b79';
    expect(orderIdOrNumberWhere(id)).toEqual({ OR: [{ id }, { orderNumber: id }] });
  });

  it('looks up human order numbers without casting to uuid', () => {
    expect(orderIdOrNumberWhere('DEMO-SBX-REORDER-IN')).toEqual({
      orderNumber: 'DEMO-SBX-REORDER-IN',
    });
    expect(orderIdOrNumberWhere(' WP-IN-87A48F6287 ')).toEqual({
      orderNumber: 'WP-IN-87A48F6287',
    });
  });
});
