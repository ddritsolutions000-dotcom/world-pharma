import { createSessionStore } from '@world-pharma/shell-core';
import { mobileScreen } from './navigation';

describe('mobile navigation foundation', () => {
  it('opens the public store home for guests', () => {
    const store = createSessionStore();
    expect(mobileScreen(store.snapshot())).toBe('home');
  });

  it('keeps welcome as the landing chooser', () => {
    const store = createSessionStore();
    expect(mobileScreen(store.snapshot(), 'welcome')).toBe('welcome');
    expect(mobileScreen(store.snapshot(), 'sign-in')).toBe('sign-in');
    expect(mobileScreen(store.snapshot(), 'sign-up')).toBe('sign-up');
  });

  it('moves to the empty workspace when authenticated', () => {
    const store = createSessionStore();
    store.authenticate({
      accessToken: 'a',
      refreshToken: 'b',
      audience: 'customer',
    });
    expect(mobileScreen(store.snapshot())).toBe('home');
  });

  it('exposes inbox as a signed-in customer destination', () => {
    const store = createSessionStore();
    store.authenticate({
      accessToken: 'a',
      refreshToken: 'b',
      audience: 'customer',
    });
    expect(mobileScreen(store.snapshot(), 'inbox')).toBe('inbox');
  });

  it('lets guests browse lab, programs, and care plan', () => {
    const store = createSessionStore();
    expect(mobileScreen(store.snapshot(), 'account')).toBe('account');
    expect(mobileScreen(store.snapshot(), 'doctors')).toBe('doctors');
    expect(mobileScreen(store.snapshot(), 'programs')).toBe('programs');
    expect(mobileScreen(store.snapshot(), 'care-plan')).toBe('care-plan');
    expect(mobileScreen(store.snapshot(), 'pet-care')).toBe('pet-care');
  });

  it('exposes health and appointments as signed-in customer destinations', () => {
    const store = createSessionStore();
    store.authenticate({
      accessToken: 'a',
      refreshToken: 'b',
      audience: 'customer',
    });
    expect(mobileScreen(store.snapshot(), 'health-home')).toBe('health-home');
    expect(mobileScreen(store.snapshot(), 'appointments')).toBe('appointments');
  });

  it('redirects protected health routes to sign-in for guests', () => {
    const store = createSessionStore();
    expect(mobileScreen(store.snapshot(), 'health-home')).toBe('sign-in');
    expect(mobileScreen(store.snapshot(), 'appointments')).toBe('sign-in');
  });

  it('shows the session-expired screen after expire', () => {
    const store = createSessionStore();
    store.authenticate({
      accessToken: 'a',
      refreshToken: 'b',
      audience: 'customer',
    });
    store.expire();
    expect(mobileScreen(store.snapshot())).toBe('expired');
  });
});
