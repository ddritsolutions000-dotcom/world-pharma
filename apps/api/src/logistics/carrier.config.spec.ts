import {
  isLiveCarrierEnabled,
  isMockCarrierCode,
  readLogisticsEnvironment,
} from './carrier.config';

describe('carrier.config', () => {
  const prevEnv = process.env['LOGISTICS_ENVIRONMENT'];
  const prevLive = process.env['CARRIER_LIVE_ENABLED'];
  const prevAlt = process.env['LOGISTICS_LIVE_ENABLED'];

  afterEach(() => {
    if (prevEnv === undefined) delete process.env['LOGISTICS_ENVIRONMENT'];
    else process.env['LOGISTICS_ENVIRONMENT'] = prevEnv;
    if (prevLive === undefined) delete process.env['CARRIER_LIVE_ENABLED'];
    else process.env['CARRIER_LIVE_ENABLED'] = prevLive;
    if (prevAlt === undefined) delete process.env['LOGISTICS_LIVE_ENABLED'];
    else process.env['LOGISTICS_LIVE_ENABLED'] = prevAlt;
  });

  it('defaults to sandbox with live disabled', () => {
    delete process.env['LOGISTICS_ENVIRONMENT'];
    delete process.env['CARRIER_LIVE_ENABLED'];
    expect(readLogisticsEnvironment()).toBe('sandbox');
    expect(isLiveCarrierEnabled()).toBe(false);
  });

  it('reads production environment aliases', () => {
    process.env['LOGISTICS_ENVIRONMENT'] = 'production';
    expect(readLogisticsEnvironment()).toBe('production');
    process.env['LOGISTICS_ENVIRONMENT'] = 'live';
    expect(readLogisticsEnvironment()).toBe('production');
  });

  it('enables live only when explicitly true', () => {
    process.env['CARRIER_LIVE_ENABLED'] = 'true';
    expect(isLiveCarrierEnabled()).toBe(true);
    process.env['CARRIER_LIVE_ENABLED'] = 'yes';
    delete process.env['LOGISTICS_LIVE_ENABLED'];
    expect(isLiveCarrierEnabled()).toBe(false);
  });

  it('treats empty carrier code as not mock', () => {
    expect(isMockCarrierCode(null)).toBe(false);
    expect(isMockCarrierCode('')).toBe(false);
  });
});
