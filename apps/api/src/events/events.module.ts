import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { MetricsModule } from '../common/metrics.module';
import { OutboxDispatcherService } from './dispatcher.service';
import { EventHandlerRegistry } from './handlers';
import { InboxService } from './inbox.service';
import { OutboxService } from './outbox.service';
import { EventWorkerService } from './worker.service';

@Module({
  imports: [MetricsModule],
  providers: [
    PrismaService,
    OutboxService,
    InboxService,
    EventHandlerRegistry,
    OutboxDispatcherService,
    EventWorkerService,
  ],
  exports: [OutboxService, OutboxDispatcherService, EventWorkerService, EventHandlerRegistry],
})
export class EventsModule {}
