import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { RedisService } from '../app/redis.service';
import { IdentityModule } from '../identity/identity.module';
import { PaymentGatewayRegistryModule } from '../payment/gateway-registry.module';
import { PolicyAdminController } from './admin.controller';
import { PolicyAdminService } from './admin.service';
import { PolicyCache } from './cache';
import { PolicyPublicController } from './public.controller';
import { PolicyResolver } from './resolver';
import { PolicySeedService } from './seed.service';

@Module({
  imports: [IdentityModule, PaymentGatewayRegistryModule],
  controllers: [PolicyPublicController, PolicyAdminController],
  providers: [
    PrismaService,
    RedisService,
    PolicyCache,
    PolicyResolver,
    PolicyAdminService,
    PolicySeedService,
  ],
  exports: [PolicyResolver, PolicyCache],
})
export class PolicyModule {}
