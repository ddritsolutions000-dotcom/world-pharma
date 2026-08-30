/**
 * Primitive (reference) tokens.
 * Interim palette — not the legal brand (OD-DS-01). Calm clinical teal + ink.
 * Do not copy these hex values into product screens; consume semantic tokens.
 */

export const colorRef = {
  teal: {
    50: '#EAF6F4',
    100: '#D3EEE9',
    200: '#A8D9D3',
    300: '#6FB8CD',
    400: '#3D9A9A',
    500: '#1A7A76',
    600: '#0F5C5A',
    700: '#0B4746',
    800: '#0A3534',
    900: '#082726',
  },
  ink: {
    50: '#F4F7F8',
    100: '#E6ECF0',
    200: '#C9D4DB',
    300: '#9AABB4',
    400: '#6B7C86',
    500: '#3D4F58',
    600: '#2A3A42',
    700: '#1C2A31',
    800: '#12202A',
    900: '#0B1418',
  },
  sage: {
    50: '#F4F7F6',
    100: '#E4EBE8',
    200: '#C9D7D0',
    300: '#A3B8B0',
    400: '#D3DED9',
    500: '#8FA39B',
  },
  white: '#FFFFFF',
  black: '#071014',
  success: { fg: '#1B6B43', bg: '#E6F5ED', strong: '#145C38' },
  warning: { fg: '#9A6700', bg: '#FDF4DC', strong: '#7A5200' },
  danger: { fg: '#B42318', bg: '#FCEBEA', strong: '#912018' },
  info: { fg: '#175CD3', bg: '#E8F1FC', strong: '#1249A8' },
  rx: { fg: '#5B3A9E', bg: '#F2ECFA', strong: '#472C7A' },
  panic: { fg: '#8F1D3A', bg: '#F9E8EE', strong: '#6E152C' },
  cod: { fg: '#0B4F6C', bg: '#E7F3F8', strong: '#083C52' },
  verified: { fg: '#0E6B4A', bg: '#E5F6EE', strong: '#0A553B' },
} as const;

export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  8: 48,
  10: 64,
} as const;

export const radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 16,
  pill: 999,
} as const;

export const fontFamily = {
  ui: 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
  tabular:
    'ui-monospace, "SFMono-Regular", "Cascadia Mono", "Segoe UI Mono", Consolas, monospace',
} as const;

export const fontSize = {
  display: 40,
  h1: 32,
  h2: 26,
  h3: 22,
  h4: 18,
  bodyLg: 18,
  body: 16,
  bodySm: 14,
  label: 14,
  caption: 12,
} as const;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
} as const;

export const lineHeight = {
  tight: 1.2,
  normal: 1.45,
  relaxed: 1.6,
} as const;

export const breakpoint = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  xxl: 1536,
} as const;

export const layout = {
  pageMax: 1440,
  content: 1120,
  gutterMobile: 16,
  gutterTablet: 24,
  gutterDesktop: 32,
  sectionMobile: 32,
  sectionDesktop: 64,
  gridMobile: 4,
  gridTablet: 8,
  gridDesktop: 12,
} as const;

export const touchTarget = {
  min: 44,
  compact: 40,
} as const;

export const iconSize = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const;

export const duration = {
  fast: 120,
  base: 180,
  slow: 280,
} as const;

export const easing = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
} as const;

export const zIndex = {
  base: 0,
  sticky: 20,
  dropdown: 40,
  overlay: 50,
  modal: 60,
  toast: 70,
} as const;

export const opacity = {
  disabled: 0.48,
  hover: 0.92,
  overlay: 0.56,
} as const;

export const borderWidth = {
  hairline: 1,
  strong: 2,
  focus: 2,
} as const;
