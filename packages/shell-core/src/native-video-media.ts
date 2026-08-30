/**
 * Native media plane boundary for telemedicine sandbox.
 * Does not invent LiveKit credentials or fake WebRTC.
 * Web uses livekit-client; native requires a future authorized RN SDK CR.
 */
export type NativeVideoMediaCapability = 'unavailable' | 'mock_ui' | 'livekit_native';

export type NativeVideoMediaSession = {
  capability: NativeVideoMediaCapability;
  reason: string;
  recordingEnabled: false;
};

export function resolveNativeVideoMedia(input: {
  isMockToken: boolean;
  isMockWsUrl: boolean;
  livekitNativeSdkAvailable?: boolean;
}): NativeVideoMediaSession {
  if (input.isMockToken || input.isMockWsUrl) {
    return {
      capability: 'mock_ui',
      reason: 'MockVideoProvider active — native UI shows lifecycle only; no SFU media.',
      recordingEnabled: false,
    };
  }
  if (input.livekitNativeSdkAvailable) {
    return {
      capability: 'livekit_native',
      reason: 'Native LiveKit SDK available for sandbox media.',
      recordingEnabled: false,
    };
  }
  return {
    capability: 'unavailable',
    reason:
      'LiveKit sandbox authorized server-side, but native WebRTC SDK is not packaged. Use customer/doctor web for media in this phase.',
    recordingEnabled: false,
  };
}
