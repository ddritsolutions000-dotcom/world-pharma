import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

export function IconStore(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden {...props}>
      <path d="M3 9l2.5-5h13L21 9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9" strokeLinecap="round" />
      <path d="M9 14h6" strokeLinecap="round" />
    </svg>
  );
}

export function IconTrending(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden {...props}>
      <path d="M3 17l6-6 4 4 8-10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 5h7v7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconPackage(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden {...props}>
      <path d="M12 22V12" strokeLinecap="round" />
      <path d="M12 12L3 7l9-5 9 5-9 5z" strokeLinejoin="round" />
      <path d="M3 7v10l9 5 9-5V7" strokeLinejoin="round" />
    </svg>
  );
}

export function IconWallet(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden {...props}>
      <path d="M3 7h15a3 3 0 013 3v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" strokeLinejoin="round" />
      <path d="M17 12h4" strokeLinecap="round" />
      <circle cx="17" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconShield(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden {...props}>
      <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconSpark(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden {...props}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
    </svg>
  );
}
