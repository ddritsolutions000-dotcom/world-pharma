import { resolveNativeVideoMedia } from './native-video-media';

describe('resolveNativeVideoMedia', () => {
  it('returns mock_ui for mock tokens', () => {
    const result = resolveNativeVideoMedia({ isMockToken: true, isMockWsUrl: false });
    expect(result.capability).toBe('mock_ui');
    expect(result.recordingEnabled).toBe(false);
  });

  it('returns unavailable when LiveKit is authorized but native SDK is missing', () => {
    const result = resolveNativeVideoMedia({
      isMockToken: false,
      isMockWsUrl: false,
      livekitNativeSdkAvailable: false,
    });
    expect(result.capability).toBe('unavailable');
  });
});
