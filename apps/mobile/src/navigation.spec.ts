import { createSessionStore } from '@world-pharma/shell-core';
import { mobileScreen } from './navigation';

describe('mobile navigation foundation', () => {
  it('starts on the public welcome screen', () => {
    const store = createSessionStore();
    expect(mobileScreen(store.snapshot())).toBe('welcome');
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
