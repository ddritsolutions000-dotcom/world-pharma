import { adminAuthHeaders, classifyAdminViewState, isAdminNetworkFailure, AdminHttpError } from './admin-http';

describe('admin cookie transport', () => {
  it('does not send Authorization header for cookie mode', () => {
    expect(adminAuthHeaders('__cookie__')).toEqual({ Accept: 'application/json' });
    expect(adminAuthHeaders('__cookie__', { 'Content-Type': 'application/json' })).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
  });

  it('sends Bearer only for explicit bearer tokens', () => {
    expect(adminAuthHeaders('real-jwt-token').Authorization).toBe('Bearer real-jwt-token');
  });
});

describe('admin failure classification', () => {
  it('treats HTTP 500 as an application error, not a connection problem', () => {
    expect(classifyAdminViewState(new AdminHttpError('server_error', 500))).toBe('error');
    expect(isAdminNetworkFailure(new AdminHttpError('server_error', 500))).toBe(false);
  });

  it('treats unreachable API as a network failure', () => {
    expect(classifyAdminViewState(new AdminHttpError('API is not reachable. Start the API on port 4000, then retry.', 0))).toBe(
      'network',
    );
    expect(isAdminNetworkFailure(new Error('Failed to fetch'))).toBe(true);
    expect(isAdminNetworkFailure(new Error('network'))).toBe(true);
  });

  it('treats 403 as forbidden', () => {
    expect(classifyAdminViewState(new AdminHttpError('forbidden', 403))).toBe('forbidden');
  });
});
