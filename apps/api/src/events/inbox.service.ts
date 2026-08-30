import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../app/prisma.service';

@Injectable()
export class InboxService {
  constructor(private readonly prisma: PrismaService) {}

  async tryBegin(consumerName: string, eventId: string): Promise<boolean> {
    try {
      await this.prisma.inboxReceipt.create({
        data: { consumerName, eventId },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }

  async release(consumerName: string, eventId: string): Promise<void> {
    await this.prisma.inboxReceipt.deleteMany({
      where: { consumerName, eventId },
    });
  }
}
