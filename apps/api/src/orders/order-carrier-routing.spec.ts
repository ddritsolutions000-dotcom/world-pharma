import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import { OutboxService } from '../events/outbox.service';
import { InventoryService } from '../inventory/inventory.service';
import { LogisticsService } from '../logistics/logistics.service';
import { FinanceService } from '../finance/finance.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PersonalizationService } from '../personalization/personalization.service';
import { ConversionEventService } from '../crm/conversion-event.service';
import { CooccurrenceService } from '../recommendations/cooccurrence.service';
import { PolicyResolver } from '../policy/resolver';
import { OrderService } from './order.service';

describe('OrderService carrier routing', () => {
  let service: OrderService;
  const requestBooking = jest.fn().mockResolvedValue(undefined);
  const prisma = {
    shipment: {
      findFirst: jest.fn().mockResolvedValue({ id: 'ship-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: PrismaService, useValue: prisma },
        { provide: OutboxService, useValue: { enqueue: jest.fn() } },
        { provide: InventoryService, useValue: {} },
        { provide: LogisticsService, useValue: { requestBooking } },
        { provide: FinanceService, useValue: {} },
        { provide: LoyaltyService, useValue: {} },
        { provide: PersonalizationService, useValue: {} },
        { provide: ConversionEventService, useValue: {} },
        { provide: CooccurrenceService, useValue: {} },
        { provide: PolicyResolver, useValue: {} },
      ],
    }).compile();
    service = module.get(OrderService);
    jest.spyOn(service as never as { load: () => Promise<unknown> }, 'load').mockResolvedValue({
      id: 'ord-1',
      sellerOrgId: 'org-1',
      countryId: 'country-1',
      shipments: [{ id: 'ship-1' }],
    });
    jest.spyOn(service as never as { assertCanFulfill: () => Promise<void> }, 'assertCanFulfill').mockResolvedValue();
    jest.spyOn(service as never as { transition: () => Promise<unknown> }, 'transition').mockResolvedValue({
      id: 'ord-1',
      status: OrderStatus.READY_TO_SHIP,
    });
  });

  it('uses logistics.requestBooking instead of a noop carrier on markReadyToShip', async () => {
    await service.markReadyToShip({ personId: 'person-1' } as never, 'ord-1');
    expect(requestBooking).toHaveBeenCalledWith('ship-1', 'BOOK_SUCCESS');
    expect(prisma.shipment.update).toHaveBeenCalledWith({
      where: { id: 'ship-1' },
      data: { status: ShipmentStatus.READY },
    });
  });
});
