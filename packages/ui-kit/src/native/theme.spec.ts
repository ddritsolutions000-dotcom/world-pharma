import { nativeColors, nativeSpace, nativeTouch } from './theme';

describe('native tokens', () => {
  it('maps the same semantic colors as web', () => {
    const light = nativeColors('light');
    expect(light.text.primary).toBeTruthy();
    expect(light.clinical.rx).not.toBe(light.status.success);
    expect(nativeSpace(4)).toBe(16);
    expect(nativeTouch).toBe(48);
  });
});
