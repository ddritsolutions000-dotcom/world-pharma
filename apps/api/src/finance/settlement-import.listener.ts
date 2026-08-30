import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { EventEnvelope } from '../events/envelope';
import { EventHandlerRegistry } from '../events/handlers';
import { SettlementImportService } from './settlement-import.service';

/** Async worker boundary for settlement import batches. */
@Injectable()
export class SettlementImportListenerService implements OnModuleInit {
  private readonly logger = new Logger(SettlementImportListenerService.name);

  constructor(
    private readonly handlers: EventHandlerRegistry,
    private readonly imports: SettlementImportService,
  ) {}

  onModuleInit(): void {
    this.handlers.register('SETTLEMENT_IMPORT_RECEIVED', (envelope) => this.handle(envelope));
    this.logger.log(JSON.stringify({ event: 'settlement_import_listener_registered' }));
  }

  async handle(envelope: EventEnvelope): Promise<void> {
    await this.imports.processImportReceived(envelope.aggregateId);
  }
}
