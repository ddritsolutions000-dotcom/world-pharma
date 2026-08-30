import { Module, forwardRef } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationService } from './notification.service';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { VendorSupportController } from './vendor-support.controller';
import { PrismaService } from '../app/prisma.service';
import { RedisService } from '../app/redis.service';
import { IdentityModule } from '../identity/identity.module';
import { EventsModule } from '../events/events.module';
import { CrmModule } from '../crm/crm.module';

@Module({
  imports: [IdentityModule, EventsModule, forwardRef(() => CrmModule)],
  controllers: [NotificationController, SupportController, VendorSupportController],
  providers: [PrismaService, RedisService, NotificationService, NotificationDispatchService, SupportService],
  exports: [NotificationService, NotificationDispatchService, SupportService],
})
export class PlatformModule {}
