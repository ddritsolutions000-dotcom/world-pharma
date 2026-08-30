import { contrastRatio } from './contrast';
import { renderThemeCss } from './css';
import { darkColor, lightColor } from './semantic';
import { breakpoint, layout, space, touchTarget } from './primitives';

describe('design tokens', () => {
  it('uses a 4px spacing scale', () => {
    expect(space[1]).toBe(4);
    expect(space[4]).toBe(16);
    expect(space[5]).toBe(24);
  });

  it('meets AA contrast for body text on canvas', () => {
    expect(contrastRatio(lightColor.text.primary, lightColor.background.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(lightColor.text.primary, lightColor.background.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(darkColor.text.primary, darkColor.background.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(darkColor.text.primary, darkColor.background.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('meets AA contrast for primary action label', () => {
    expect(contrastRatio(lightColor.action.onPrimary, lightColor.action.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(darkColor.action.onPrimary, darkColor.action.primary)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps clinical hues distinct from success and generic danger', () => {
    expect(lightColor.clinical.rx).not.toBe(lightColor.status.success);
    expect(lightColor.clinical.panic).not.toBe(lightColor.status.error);
    expect(lightColor.clinical.rx).not.toBe(lightColor.action.primary);
  });

  it('emits CSS variables for both themes', () => {
    const css = renderThemeCss();
    expect(css).toContain('--wp-color-text-primary');
    expect(css).toContain('[data-theme="dark"]');
    expect(css).toContain('--wp-space-4');
  });

  it('encodes the placeholder breakpoint and layout tokens', () => {
    expect(breakpoint.md).toBe(768);
    expect(layout.pageMax).toBe(1440);
    expect(touchTarget.min).toBe(44);
  });
});
