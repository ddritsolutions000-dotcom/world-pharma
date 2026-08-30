/**
 * R5-F runtime e-Rx provider selection (fail-closed).
 * Only `sandbox` is wired — no live government/provider integration.
 */
export type ErxRuntimeProvider = 'sandbox';

export function configuredErxRuntimeProvider(): ErxRuntimeProvider | null {
  const raw = process.env['ERX_PROVIDER']?.trim().toLowerCase();
  if (raw === 'sandbox') {
    return 'sandbox';
  }
  return null;
}

export function isErxRuntimeConfiguredForPackProvider(packProviderCode: string | null): boolean {
  if (!packProviderCode) {
    return false;
  }
  const runtime = configuredErxRuntimeProvider();
  if (!runtime) {
    return false;
  }
  return packProviderCode.trim().toLowerCase() === runtime;
}
