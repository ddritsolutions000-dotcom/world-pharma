import {
  APPLICATION_REGISTRY,
  FORBIDDEN_APPLICATIONS,
  applicationByPath,
  applicationsByStatus,
} from './app-topology';

describe('global application topology', () => {
  it('lists six mobile and twelve web product apps', () => {
    const mobile = APPLICATION_REGISTRY.filter((app) => app.surface === 'mobile');
    const web = APPLICATION_REGISTRY.filter((app) => app.surface === 'web');
    expect(mobile).toHaveLength(6);
    expect(web).toHaveLength(12);
  });

  it('does not invent an affiliate mobile or generic partner app', () => {
    expect(APPLICATION_REGISTRY.some((app) => /affiliate/i.test(app.name) && app.surface === 'mobile')).toBe(
      false,
    );
    expect(APPLICATION_REGISTRY.some((app) => /^partner app$/i.test(app.name))).toBe(false);
    expect(FORBIDDEN_APPLICATIONS).toEqual(
      expect.arrayContaining(['Generic Partner App', 'Affiliate mobile app']),
    );
  });

  it('marks partner ops clients as functional and vendor/lab as foundation after pre-R4 hardening', () => {
    expect(applicationByPath('apps/web-vendor')?.status).toBe('FOUNDATION');
    expect(applicationByPath('apps/web-lab')?.status).toBe('FOUNDATION');
    expect(applicationByPath('apps/web-lab')?.currentPath).toBe('apps/web-lab');
    expect(applicationByPath('apps/web-radiology')?.status).toBe('FOUNDATION');
    expect(applicationByPath('apps/web-radiology')?.currentPath).toBe('apps/web-radiology');
    expect(applicationByPath('apps/web-radiologist')?.status).toBe('IMPLEMENTED');
    expect(applicationByPath('apps/web-radiologist')?.currentPath).toBe('apps/web-radiologist');
    expect(applicationByPath('apps/web-affiliate')?.status).toBe('IMPLEMENTED');
    expect(applicationByPath('apps/web-join')?.status).toBe('FUNCTIONAL');
    expect(applicationByPath('apps/web-store')?.status).toBe('FUNCTIONAL');
    expect(applicationByPath('apps/mobile-store')?.status).toBe('FUNCTIONAL');
    expect(applicationByPath('apps/mobile-delivery')?.status).toBe('FUNCTIONAL');
    expect(applicationByPath('apps/mobile')?.status).toBe('FOUNDATION');
    expect(applicationByPath('apps/web-admin')?.status).toBe('FOUNDATION');
    expect(applicationByPath('apps/mobile-doctor')?.status).toBe('FOUNDATION');
    expect(applicationsByStatus('IMPLEMENTED').map((app) => app.path)).toEqual([
      'apps/web-radiologist',
      'apps/web-affiliate',
    ]);
  });

  it('binds admin to company audience and doctors to doctor audience', () => {
    expect(applicationByPath('apps/web-admin')?.jwtAudiences).toEqual(['admin']);
    expect(applicationByPath('apps/web-doctor')?.jwtAudiences).toEqual(['doctor']);
    expect(applicationByPath('apps/web-customer')?.jwtAudiences).toEqual(['customer']);
  });

  it('records R4 sandbox as implemented without claiming production telemedicine', () => {
    const doctorWeb = applicationByPath('apps/web-doctor');
    const doctorMobile = applicationByPath('apps/mobile-doctor');
    for (const app of [doctorWeb, doctorMobile]) {
      expect(app).toBeDefined();
      expect(app!.futureStatus.toLowerCase()).not.toMatch(/r4 not started/);
      expect(app!.futureStatus.toLowerCase()).toMatch(/r4 telemedicine sandbox implemented/);
      expect(app!.futureStatus.toLowerCase()).toMatch(/production livekit not enabled/);
      expect(app!.futureStatus.toLowerCase()).toMatch(/production telemedicine not ready/);
      expect(app!.futureStatus.toLowerCase()).not.toMatch(/production[- ]ready/);
    }
  });
});
