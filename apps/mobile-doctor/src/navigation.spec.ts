import { createSessionStore } from '@world-pharma/shell-core';
import { doctorMobileScreen } from './navigation';

describe('doctor mobile navigation foundation', () => {
  it('starts on sign-in', () => {
    const store = createSessionStore();
    expect(doctorMobileScreen(store.snapshot())).toBe('sign-in');
  });

  it('moves to dashboard after doctor authentication', () => {
    const store = createSessionStore();
    store.authenticate({
      accessToken: 'a',
      refreshToken: 'b',
      audience: 'doctor',
    });
    expect(doctorMobileScreen(store.snapshot())).toBe('dashboard');
  });

  it('opens appointment detail when an id is selected', () => {
    const store = createSessionStore();
    store.authenticate({
      accessToken: 'a',
      refreshToken: 'b',
      audience: 'doctor',
    });
    expect(doctorMobileScreen(store.snapshot(), 'appointments', 'appt-1')).toBe('appointment-detail');
  });

  it('opens prescription detail when an id is selected', () => {
    const store = createSessionStore();
    store.authenticate({
      accessToken: 'a',
      refreshToken: 'b',
      audience: 'doctor',
    });
    expect(doctorMobileScreen(store.snapshot(), 'prescriptions', null, 'rx-1')).toBe('prescription-detail');
  });

  it('opens patient health when a patient is selected', () => {
    const store = createSessionStore();
    store.authenticate({
      accessToken: 'a',
      refreshToken: 'b',
      audience: 'doctor',
    });
    expect(doctorMobileScreen(store.snapshot(), 'patients', null, null, 'patient-1')).toBe('patient-health');
  });

  it('opens health artifact when patient and artifact are selected', () => {
    const store = createSessionStore();
    store.authenticate({
      accessToken: 'a',
      refreshToken: 'b',
      audience: 'doctor',
    });
    expect(doctorMobileScreen(store.snapshot(), 'patients', null, null, 'patient-1', 'art-1')).toBe(
      'health-artifact',
    );
  });

  it('opens credentials tab when selected', () => {
    const store = createSessionStore();
    store.authenticate({
      accessToken: 'a',
      refreshToken: 'b',
      audience: 'doctor',
    });
    expect(doctorMobileScreen(store.snapshot(), 'credentials')).toBe('credentials');
  });

  it('opens settings tab when selected', () => {
    const store = createSessionStore();
    store.authenticate({
      accessToken: 'a',
      refreshToken: 'b',
      audience: 'doctor',
    });
    expect(doctorMobileScreen(store.snapshot(), 'settings')).toBe('settings');
  });

  it('shows expired screen', () => {
    const store = createSessionStore();
    store.authenticate({
      accessToken: 'a',
      refreshToken: 'b',
      audience: 'doctor',
    });
    store.expire();
    expect(doctorMobileScreen(store.snapshot())).toBe('expired');
  });
});
