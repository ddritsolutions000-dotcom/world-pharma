import {
  pickPodPhotoFromDevice,
  podPhotoStatusLabel,
  sandboxPodPhotoPayload,
  SANDBOX_POD_PNG_BASE64,
} from './pod-photo';

describe('pod-photo helpers', () => {
  it('provides sandbox png payload', () => {
    const payload = sandboxPodPhotoPayload();
    expect(payload.content_type).toBe('image/png');
    expect(payload.content_base64).toBe(SANDBOX_POD_PNG_BASE64);
  });

  it('labels capture status honestly', () => {
    expect(podPhotoStatusLabel(true)).toMatch(/attached/i);
    expect(podPhotoStatusLabel(false)).toMatch(/not attached/i);
  });

  it('returns null from device picker when document is unavailable', async () => {
    await expect(pickPodPhotoFromDevice()).resolves.toBeNull();
  });
});
