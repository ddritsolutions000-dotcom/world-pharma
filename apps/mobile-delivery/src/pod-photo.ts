/** Sandbox POD photo helpers — private object upload, no public CDN. */

/** 1×1 PNG — same fixture as delivery e2e photo POD. */
export const SANDBOX_POD_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export type PodPhotoPayload = {
  content_base64: string;
  content_type: 'image/jpeg' | 'image/png' | 'image/webp' | string;
};

export function sandboxPodPhotoPayload(): PodPhotoPayload {
  return {
    content_base64: SANDBOX_POD_PNG_BASE64,
    content_type: 'image/png',
  };
}

/** Web / Expo-web file picker. Native camera picker remains EXTERNAL until expo-image-picker ships. */
export function pickPodPhotoFromDevice(): Promise<PodPhotoPayload | null> {
  if (typeof document === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result ?? '');
        const content_base64 = result.includes(',') ? result.split(',').pop()! : result;
        const content_type = file.type || 'image/jpeg';
        if (!content_base64) {
          resolve(null);
          return;
        }
        resolve({ content_base64, content_type });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

export function podPhotoStatusLabel(captured: boolean | undefined): string {
  return captured ? 'POD photo attached (private object)' : 'POD photo not attached yet';
}
