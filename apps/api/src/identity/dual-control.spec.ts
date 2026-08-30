import { assertMakerChecker } from './dual-control';

describe('assertMakerChecker', () => {
  it('allows when dual control is disabled', () => {
    expect(() =>
      assertMakerChecker({
        dualControlRequired: false,
        createdByPersonId: 'a',
        actorPersonId: 'a',
      }),
    ).not.toThrow();
  });

  it('rejects self-approval when dual control is required', () => {
    try {
      assertMakerChecker({
        dualControlRequired: true,
        createdByPersonId: 'maker',
        actorPersonId: 'maker',
        actionLabel: 'payout',
      });
      fail('expected dual control rejection');
    } catch (error) {
      expect(error).toMatchObject({ code: 'DUAL_CONTROL_REQUIRED', status: 409 });
    }
  });

  it('allows distinct checker', () => {
    expect(() =>
      assertMakerChecker({
        dualControlRequired: true,
        createdByPersonId: 'maker',
        actorPersonId: 'checker',
      }),
    ).not.toThrow();
  });
});
