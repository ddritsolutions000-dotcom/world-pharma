import { HelpApiError } from './help-api';

describe('mobile help parity', () => {
  it('classifies network failures from HelpApiError', () => {
    const err = new HelpApiError('network_failure', 0);
    expect(err.status).toBe(0);
  });

  it('classifies validation failures from HelpApiError', () => {
    const err = new HelpApiError('query_too_long', 400);
    expect(err.status).toBe(400);
  });
});

describe('navigation public help screens', () => {
  it('allows help routes without authentication', async () => {
    const { resolveMobileScreen, PUBLIC_HELP_SCREENS } = await import('./navigation');
    expect(PUBLIC_HELP_SCREENS).toContain('help-home');
    expect(
      resolveMobileScreen({ status: 'anonymous', audience: null, permissions: [] } as never, 'help-home'),
    ).toBe('help-home');
  });
});
