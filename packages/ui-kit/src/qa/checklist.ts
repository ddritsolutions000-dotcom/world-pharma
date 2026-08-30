export const visualQaChecklist = [
  'Use space tokens only (4px grid)',
  'Use type roles, not raw font-size in product CSS',
  'Use semantic color tokens, never raw hex in components',
  'Use radius tokens',
  'Use elevation tokens; no decorative drop shadows',
  'Icons 16 / 20 / 24 / 32 from iconSize',
  'Focus ring visible; never outline: none without a replacement',
  'Loading never leaves a blank canvas',
  'Errors include text and icon, not color alone',
  'Empty states: title + explanation + one action slot',
] as const;
