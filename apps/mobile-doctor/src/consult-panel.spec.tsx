import { isOnlineAppointmentType } from '@world-pharma/shell-core';

describe('consult video eligibility (mobile doctor)', () => {
  it('only enables video for online appointment types', () => {
    expect(isOnlineAppointmentType('ONLINE')).toBe(true);
    expect(isOnlineAppointmentType('IN_PERSON')).toBe(false);
  });
});
