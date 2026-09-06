import { createSessionStore, snapshotContainsSecrets } from './session';
import { canAccessProtected, visibleNavItems } from './nav';

describe('session store', () => {
  it('keeps tokens out of the public snapshot', () => {
    const store = createSessionStore();
    store.authenticate({
      accessToken: 'access-secret-token',
      refreshToken: 'refresh-secret-token',
      audience: 'customer',
      permissions: ['session:read'],
    });
    const snap = store.snapshot();
    expect(snap.status).toBe('authenticated');
    expect(snapshotContainsSecrets(snap)).toBe(false);
    expect(JSON.stringify(snap)).not.toMatch(/access-secret-token|refresh-secret-token/);
    expect(store.getAccessToken()).toBe('access-secret-token');
  });

  it('expires an authenticated session without leftover tokens', () => {
    const store = createSessionStore();
    store.authenticate({
      accessToken: 'access-secret-token',
      refreshToken: 'refresh-secret-token',
      audience: 'admin',
    });
    store.expire();
    expect(store.snapshot().status).toBe('expired');
    expect(store.getAccessToken()).toBeNull();
    expect(canAccessProtected(store.snapshot(), 'admin')).toBe(false);
  });

  it('hides nav items the session cannot use', () => {
    const store = createSessionStore();
    store.authenticate({
      accessToken: 'a',
      refreshToken: 'b',
      audience: 'admin',
      permissions: [],
    });
    const items = visibleNavItems(store.snapshot(), [
      { id: 'home', label: 'Home', href: '/' },
      { id: 'ops', label: 'Operations', href: '/ops', permission: 'admin:ops' },
    ]);
    expect(items.map((item) => item.id)).toEqual(['home']);
  });

  it('keeps permissions when re-authenticating without a permissions field', () => {
    const store = createSessionStore();
    store.authenticate({
      accessToken: 'a',
      refreshToken: 'b',
      audience: 'admin',
      permissions: ['cms:read', 'order:read'],
    });
    store.authenticate({
      accessToken: 'a2',
      refreshToken: 'b2',
      audience: 'admin',
    });
    expect(store.snapshot().permissions).toEqual(['cms:read', 'order:read']);
  });
});
