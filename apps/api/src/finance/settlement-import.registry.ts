import { Injectable } from '@nestjs/common';
import { Errors } from '../common/problem';
import { assertSandboxSettlementProvider } from './settlement-import.config';
import { MockSettlementImportAdapter } from './mock-settlement-import.adapter';
import { SettlementImportPort } from './settlement-import.port';

@Injectable()
export class SettlementImportRegistry {
  private readonly byCode = new Map<string, SettlementImportPort>();

  constructor(mock: MockSettlementImportAdapter) {
    this.register(mock, ['MOCK', 'MOCK_SETTLEMENT', 'MOCK_SANDBOX']);
  }

  register(adapter: SettlementImportPort, codes: readonly string[]): void {
    for (const code of codes) {
      this.byCode.set(code, adapter);
    }
  }

  isRegistered(providerCode: string): boolean {
    return this.byCode.has(providerCode);
  }

  resolve(providerCode: string, environment = 'sandbox'): SettlementImportPort {
    assertSandboxSettlementProvider(providerCode, environment);
    const adapter = this.byCode.get(providerCode);
    if (!adapter) {
      throw Errors.problem(
        409,
        'UNKNOWN_SETTLEMENT_PROVIDER',
        'Unknown settlement provider',
        `No settlement import adapter registered for provider code "${providerCode}".`,
      );
    }
    return adapter;
  }
}
