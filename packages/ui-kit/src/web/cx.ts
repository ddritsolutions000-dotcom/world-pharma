export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function omitPopover<T extends object>(props: T): Omit<T, 'popover'> {
  const clone = { ...props } as T & { popover?: unknown };
  delete clone.popover;
  return clone;
}
