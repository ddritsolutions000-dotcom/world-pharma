import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { IdentityModule } from '../identity/identity.module';
import { PersonalizationModule } from '../personalization/personalization.module';
import { WishlistController } from './wishlist.controller';
import { WishlistService } from './wishlist.service';

@Module({
  imports: [IdentityModule, PersonalizationModule],
  controllers: [WishlistController],
  providers: [PrismaService, WishlistService],
  exports: [WishlistService],
})
export class WishlistModule {}
