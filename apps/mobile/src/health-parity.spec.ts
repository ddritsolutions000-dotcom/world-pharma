import { classifyHealthApiFailure, formatArtifactType } from './health-utils';

describe('mobile health parity helpers', () => {
  it('classifies disabled health pack and artifact type labels', () => {
    expect(
      classifyHealthApiFailure({
        ok: false,
        status: 403,
        error: 'Health timeline is not enabled for this country.',
        kind: 'forbidden',
      }),
    ).toBe('disabled');
    expect(formatArtifactType('IMAGING_REPORT')).toBe('Imaging report');
  });

  it('maps unauthorized and network failures for screen state transitions', () => {
    expect(
      classifyHealthApiFailure({ ok: false, status: 401, error: 'Session expired.', kind: 'unauthorized' }),
    ).toBe('unauthorized');
    expect(
      classifyHealthApiFailure({ ok: false, status: 0, error: 'Network unavailable.', kind: 'network' }),
    ).toBe('network');
  });
});
