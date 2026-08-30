import { OutboxDispatcherService } from './dispatcher.service';
import { EventWorkerService } from './worker.service';

describe('queue shutdown', () => {
  it('dispatcher destroy is safe when never started', async () => {
    const dispatcher = new OutboxDispatcherService({} as never, { increment: () => undefined } as never);
    await expect(dispatcher.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('worker destroy is safe when never started', async () => {
    const worker = new EventWorkerService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { increment: () => undefined } as never,
    );
    await expect(worker.onModuleDestroy()).resolves.toBeUndefined();
  });
});
