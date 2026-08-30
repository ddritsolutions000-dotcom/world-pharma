import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clock,
  Eye,
  EyeOff,
  Home,
  Info,
  Loader2,
  Lock,
  Menu,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  Siren,
  User,
  X,
  type LucideIcon,
} from 'lucide-react';
import { iconSize } from '../tokens';
import { cx } from './cx';

export const iconNames = {
  check: Check,
  warning: AlertTriangle,
  error: AlertTriangle,
  info: Info,
  chevronDown: ChevronDown,
  close: X,
  search: Search,
  user: User,
  plus: Plus,
  menu: Menu,
  home: Home,
  lock: Lock,
  rx: Shield,
  shield: Shield,
  verified: ShieldCheck,
  clock: Clock,
  panic: Siren,
  eye: Eye,
  eyeOff: EyeOff,
  spinner: Loader2,
} as const;

export type IconName = keyof typeof iconNames;

export function Icon({
  name,
  size = 'md',
  decorative = true,
  label,
  className,
}: {
  name: IconName;
  size?: keyof typeof iconSize;
  decorative?: boolean;
  label?: string;
  className?: string;
}): React.JSX.Element {
  const Glyph: LucideIcon = iconNames[name];
  const px = iconSize[size];
  return (
    <Glyph
      className={cx('wp-icon', name === 'spinner' && 'wp-icon-spin', className)}
      size={px}
      strokeWidth={1.75}
      aria-hidden={decorative && !label}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  );
}
