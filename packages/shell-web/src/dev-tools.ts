/** Hide engineering / sandbox controls in production customer-facing builds. */
export function showDevTools(): boolean {
  return process.env.NEXT_PUBLIC_SHOW_DEV_TOOLS === 'true';
}
