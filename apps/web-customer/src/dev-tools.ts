/** Hide sandbox / engineering controls in customer-facing UI unless explicitly enabled. */
export function showDevTools(): boolean {
  return process.env.NEXT_PUBLIC_SHOW_DEV_TOOLS === 'true';
}
