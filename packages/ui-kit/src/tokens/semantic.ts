import { colorRef } from './primitives';

export type ColorMode = 'light' | 'dark';

export interface SemanticColor {
  background: {
    primary: string;
    surface: string;
    elevated: string;
    sunken: string;
    overlay: string;
  };
  text: {
    primary: string;
    secondary: string;
    muted: string;
    inverse: string;
    disabled: string;
  };
  action: {
    primary: string;
    primaryHover: string;
    onPrimary: string;
    secondary: string;
    tertiary: string;
    danger: string;
    onDanger: string;
    accent: string;
  };
  status: {
    success: string;
    successBg: string;
    warning: string;
    warningBg: string;
    error: string;
    errorBg: string;
    info: string;
    infoBg: string;
    pending: string;
    pendingBg: string;
  };
  border: {
    default: string;
    strong: string;
    focus: string;
    divider: string;
  };
  clinical: {
    rx: string;
    rxBg: string;
    panic: string;
    panicBg: string;
    restricted: string;
    confidential: string;
  };
  commerce: {
    cod: string;
    codBg: string;
  };
  trust: {
    verified: string;
    verifiedBg: string;
  };
}

export const lightColor: SemanticColor = {
  background: {
    primary: colorRef.sage[50],
    surface: colorRef.white,
    elevated: colorRef.white,
    sunken: colorRef.ink[50],
    overlay: 'rgba(7, 16, 20, 0.56)',
  },
  text: {
    primary: colorRef.ink[800],
    secondary: colorRef.ink[500],
    muted: colorRef.ink[400],
    inverse: colorRef.white,
    disabled: colorRef.ink[300],
  },
  action: {
    primary: colorRef.teal[600],
    primaryHover: colorRef.teal[700],
    onPrimary: colorRef.white,
    secondary: colorRef.ink[700],
    tertiary: colorRef.teal[600],
    danger: colorRef.danger.fg,
    onDanger: colorRef.white,
    accent: colorRef.teal[500],
  },
  status: {
    success: colorRef.success.fg,
    successBg: colorRef.success.bg,
    warning: colorRef.warning.fg,
    warningBg: colorRef.warning.bg,
    error: colorRef.danger.fg,
    errorBg: colorRef.danger.bg,
    info: colorRef.info.fg,
    infoBg: colorRef.info.bg,
    pending: colorRef.warning.fg,
    pendingBg: colorRef.warning.bg,
  },
  border: {
    default: colorRef.sage[400],
    strong: colorRef.sage[300],
    focus: colorRef.teal[500],
    divider: colorRef.sage[100],
  },
  clinical: {
    rx: colorRef.rx.fg,
    rxBg: colorRef.rx.bg,
    panic: colorRef.panic.fg,
    panicBg: colorRef.panic.bg,
    restricted: colorRef.ink[600],
    confidential: colorRef.ink[700],
  },
  commerce: {
    cod: colorRef.cod.fg,
    codBg: colorRef.cod.bg,
  },
  trust: {
    verified: colorRef.verified.fg,
    verifiedBg: colorRef.verified.bg,
  },
};

export const darkColor: SemanticColor = {
  background: {
    primary: '#0C1416',
    surface: '#152022',
    elevated: '#1C2C2F',
    sunken: '#0A1012',
    overlay: 'rgba(0, 0, 0, 0.64)',
  },
  text: {
    primary: '#E7EEEC',
    secondary: '#B3C2C0',
    muted: '#8A9C9A',
    inverse: colorRef.ink[900],
    disabled: '#6B7C7A',
  },
  action: {
    primary: '#4DB8B3',
    primaryHover: '#6BC9C4',
    onPrimary: '#082726',
    secondary: '#C9D4DB',
    tertiary: '#8FD4CF',
    danger: '#F97066',
    onDanger: '#2A0A0A',
    accent: '#6BC9C4',
  },
  status: {
    success: '#6CE9A6',
    successBg: '#0F2E20',
    warning: '#FEC84B',
    warningBg: '#2E2408',
    error: '#F97066',
    errorBg: '#3B1210',
    info: '#84CAFF',
    infoBg: '#102A44',
    pending: '#FEC84B',
    pendingBg: '#2E2408',
  },
  border: {
    default: '#2A3C3E',
    strong: '#3D5558',
    focus: '#4DB8B3',
    divider: '#243336',
  },
  clinical: {
    rx: '#C4B5FD',
    rxBg: '#2A2150',
    panic: '#FDA4AF',
    panicBg: '#3F1220',
    restricted: '#9AABAA',
    confidential: '#D3E0DC',
  },
  commerce: {
    cod: '#7CD4F0',
    codBg: '#0C3140',
  },
  trust: {
    verified: '#6CE9A6',
    verifiedBg: '#0F2E20',
  },
};

export const semanticColor: Record<ColorMode, SemanticColor> = {
  light: lightColor,
  dark: darkColor,
};

export const elevation = {
  none: 'none',
  raised: '0 1px 2px rgba(18, 32, 42, 0.06)',
  overlay: '0 8px 24px rgba(18, 32, 42, 0.12)',
  modal: '0 16px 40px rgba(18, 32, 42, 0.16)',
} as const;

export const elevationDark = {
  none: 'none',
  raised: '0 1px 2px rgba(0, 0, 0, 0.4)',
  overlay: '0 8px 24px rgba(0, 0, 0, 0.45)',
  modal: '0 16px 40px rgba(0, 0, 0, 0.55)',
} as const;
