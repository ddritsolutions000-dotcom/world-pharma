import { Injectable } from '@nestjs/common';
import { isErxRuntimeConfiguredForPackProvider } from './erx.config';
import { ERxPort } from './erx.port';
import { NullERxAdapter } from './null-erx.adapter';
import { SandboxERxAdapter } from './sandbox-erx.adapter';

/** Selects the e-Rx adapter for a country-pack provider code — fail closed on mismatch. */
@Injectable()
export class ErxRouter {
  constructor(
    private readonly nullAdapter: NullERxAdapter,
    private readonly sandboxAdapter: SandboxERxAdapter,
  ) {}

  resolveForPackProvider(packProviderCode: string | null): { adapter: ERxPort; providerCode: string } {
    const normalized = packProviderCode?.trim().toLowerCase() ?? '';
    if (!normalized) {
      return { adapter: this.nullAdapter, providerCode: 'null' };
    }
    if (normalized === this.sandboxAdapter.providerCode && isErxRuntimeConfiguredForPackProvider(normalized)) {
      return { adapter: this.sandboxAdapter, providerCode: normalized };
    }
    return { adapter: this.nullAdapter, providerCode: normalized || 'null' };
  }

  isRuntimeReady(packProviderCode: string | null): boolean {
    const normalized = packProviderCode?.trim().toLowerCase() ?? '';
    return normalized.length > 0 && isErxRuntimeConfiguredForPackProvider(normalized);
  }
}
