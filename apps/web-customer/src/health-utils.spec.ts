import { classifyHealthApiFailure, formatSourceModule, groupTimelineByDate } from './health-utils';

describe('health-utils', () => {
  it('classifies disabled health pack separately from forbidden', () => {
    expect(
      classifyHealthApiFailure({
        ok: false,
        status: 403,
        error: 'Health timeline is not enabled for this country.',
        kind: 'forbidden',
      }),
    ).toBe('disabled');
    expect(
      classifyHealthApiFailure({
        ok: false,
        status: 403,
        error: 'Permission denied.',
        kind: 'forbidden',
      }),
    ).toBe('forbidden');
    expect(
      classifyHealthApiFailure({
        ok: false,
        status: 403,
        error: 'Consent for this health record access has been revoked.',
        kind: 'forbidden',
      }),
    ).toBe('consent_revoked');
  });

  it('maps network, unauthorized, not found, and generic failures', () => {
    expect(
      classifyHealthApiFailure({ ok: false, status: 0, error: 'Network unavailable.', kind: 'network' }),
    ).toBe('network');
    expect(
      classifyHealthApiFailure({ ok: false, status: 401, error: 'Session expired.', kind: 'unauthorized' }),
    ).toBe('unauthorized');
    expect(
      classifyHealthApiFailure({ ok: false, status: 404, error: 'Not found', kind: 'error' }),
    ).toBe('not_found');
    expect(
      classifyHealthApiFailure({ ok: false, status: 500, error: 'Server error', kind: 'error' }),
    ).toBe('generic');
  });

  it('formats known source modules', () => {
    expect(formatSourceModule('lab')).toBe('Laboratory');
    expect(formatSourceModule('radiology')).toBe('Radiology');
    expect(formatSourceModule(null)).toBeNull();
  });

  it('groups timeline items by date while preserving order within groups', () => {
    const groups = groupTimelineByDate([
      {
        id: '1',
        event_type: 'ARTIFACT_PUBLISHED',
        artifact_id: 'a1',
        artifact_type: 'LAB_REPORT',
        source_module: 'lab',
        source_id: 's1',
        title: 'Morning panel',
        status: 'ACTIVE',
        occurred_at: '2026-08-29T09:00:00.000Z',
        sandbox: true,
      },
      {
        id: '2',
        event_type: 'ARTIFACT_PUBLISHED',
        artifact_id: 'a2',
        artifact_type: 'IMAGING_REPORT',
        source_module: 'radiology',
        source_id: 's2',
        title: 'Chest X-ray',
        status: 'ACTIVE',
        occurred_at: '2026-08-28T15:00:00.000Z',
        sandbox: true,
      },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.items).toHaveLength(1);
    expect(groups[0]?.items[0]?.title).toBe('Morning panel');
  });
});
