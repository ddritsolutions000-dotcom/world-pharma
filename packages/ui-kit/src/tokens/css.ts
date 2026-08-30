import {
  borderWidth,
  breakpoint,
  duration,
  easing,
  fontFamily,
  fontSize,
  fontWeight,
  iconSize,
  layout,
  lineHeight,
  opacity,
  radius,
  space,
  touchTarget,
  zIndex,
} from './primitives';
import { darkColor, elevation, elevationDark, lightColor, type SemanticColor } from './semantic';

function flatten(obj: object, prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const next = `${prefix}-${camelToKebab(key)}`;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flatten(value as object, next));
    } else {
      out[next] = String(value);
    }
  }
  return out;
}

function camelToKebab(value: string): string {
  return value.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function colorVars(color: SemanticColor): Record<string, string> {
  return flatten(color, '--wp-color');
}

function sharedVars(): Record<string, string> {
  const out: Record<string, string> = {
    '--wp-font-ui': fontFamily.ui,
    '--wp-font-tabular': fontFamily.tabular,
    '--wp-font-weight-regular': String(fontWeight.regular),
    '--wp-font-weight-medium': String(fontWeight.medium),
    '--wp-font-weight-semibold': String(fontWeight.semibold),
    '--wp-line-tight': String(lineHeight.tight),
    '--wp-line-normal': String(lineHeight.normal),
    '--wp-line-relaxed': String(lineHeight.relaxed),
    '--wp-ease-standard': easing.standard,
    '--wp-touch': `${touchTarget.min}px`,
    '--wp-page-max': `${layout.pageMax}px`,
    '--wp-content-max': `${layout.content}px`,
  };
  for (const [k, v] of Object.entries(space)) {
    out[`--wp-space-${k}`] = `${v}px`;
  }
  for (const [k, v] of Object.entries(radius)) {
    out[`--wp-radius-${k}`] = k === 'pill' ? `${v}px` : `${v}px`;
  }
  for (const [k, v] of Object.entries(fontSize)) {
    out[`--wp-font-size-${camelToKebab(k)}`] = `${v}px`;
  }
  for (const [k, v] of Object.entries(duration)) {
    out[`--wp-duration-${k}`] = `${v}ms`;
  }
  for (const [k, v] of Object.entries(zIndex)) {
    out[`--wp-z-${k}`] = String(v);
  }
  for (const [k, v] of Object.entries(iconSize)) {
    out[`--wp-icon-${k}`] = `${v}px`;
  }
  for (const [k, v] of Object.entries(opacity)) {
    out[`--wp-opacity-${k}`] = String(v);
  }
  for (const [k, v] of Object.entries(borderWidth)) {
    out[`--wp-border-${k}`] = `${v}px`;
  }
  for (const [k, v] of Object.entries(breakpoint)) {
    out[`--wp-bp-${k}`] = `${v}px`;
  }
  return out;
}

function decls(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}

export function renderThemeCss(): string {
  const shared = sharedVars();
  const light = {
    ...shared,
    ...colorVars(lightColor),
    '--wp-elev-none': elevation.none,
    '--wp-elev-raised': elevation.raised,
    '--wp-elev-overlay': elevation.overlay,
    '--wp-elev-modal': elevation.modal,
  };
  const dark = {
    ...colorVars(darkColor),
    '--wp-elev-none': elevationDark.none,
    '--wp-elev-raised': elevationDark.raised,
    '--wp-elev-overlay': elevationDark.overlay,
    '--wp-elev-modal': elevationDark.modal,
  };
  return [
    `:root,[data-theme="light"]{${decls(light)}}`,
    `[data-theme="dark"]{${decls(dark)}}`,
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${decls(dark)}}}`,
  ].join('');
}

export const cssVar = {
  color: (path: string) => `var(--wp-color-${path.replaceAll('.', '-')})`,
  space: (step: keyof typeof space) => `var(--wp-space-${step})`,
};
