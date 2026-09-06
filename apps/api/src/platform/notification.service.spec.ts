import { ProblemException } from '../common/problem';
import { NotificationService, type InboxItem } from './notification.service';

function item(id: string, title: string, read = false): InboxItem {
  return {
    id,
    channel: 'in_app',
    title,
    body: 'Open the app for details. External channels remain disabled in sandbox.',
    read,
    created_at: '2026-08-30T10:00:00.000Z',
  };
}

function createService(store: Map<string, string[]>, kv = new Map<string, string>()) {
  const client = {
    get: async (key: string) => kv.get(key) ?? null,
    set: async (key: string, value: string, ...args: unknown[]) => {
      const nx = args.includes('NX');
      if (nx && kv.has(key)) {
        return null;
      }
      kv.set(key, value);
      return 'OK';
    },
    lpush: async (key: string, value: string) => {
      const list = store.get(key) ?? [];
      list.unshift(value);
      store.set(key, list);
      return list.length;
    },
    ltrim: async () => 'OK',
    expire: async () => 1,
    lrange: async (key: string) => store.get(key) ?? [],
    ttl: async () => 60,
    multi() {
      const ops: Array<() => void> = [];
      return {
        del: (key: string) => {
          ops.push(() => {
            store.delete(key);
          });
          return this;
        },
        rpush: (key: string, ...values: string[]) => {
          ops.push(() => {
            store.set(key, values);
          });
          return this;
        },
        expire: () => {
          ops.push(() => undefined);
          return this;
        },
        exec: async () => {
          for (const op of ops) {
            op();
          }
          return [];
        },
      };
    },
  };
  const redis = {
    ensureConnected: async () => undefined,
    client,
  };
  const marketing = {
    getForPerson: async () => ({ marketing_allowed: false }),
    updateForPerson: async () => undefined,
  };
  const prisma = {
    person: { findUnique: async () => null },
    country: { findUnique: async () => ({ isoAlpha2: 'XX' }) },
    outboxEvent: { count: async () => 0, findMany: async () => [] },
  };
  return new NotificationService(redis as never, prisma as never, marketing as never);
}

describe('NotificationService.markRead', () => {
  it('marks only the matching item on the person-scoped list', async () => {
    const store = new Map<string, string[]>([
      [
        'notification:inbox:person-a',
        [JSON.stringify(item('n2', 'Second')), JSON.stringify(item('n1', 'First'))],
      ],
    ]);
    const service = createService(store);
    const listed = await service.markRead('person-a', 'n1');
    expect(listed.find((row) => row.id === 'n1')?.read).toBe(true);
    expect(listed.find((row) => row.id === 'n2')?.read).toBe(false);
    expect(listed.map((row) => row.id)).toEqual(['n2', 'n1']);
  });

  it('does not mutate another person inbox key', async () => {
    const other = [JSON.stringify(item('secret', 'Other person'))];
    const store = new Map<string, string[]>([
      ['notification:inbox:person-a', [JSON.stringify(item('n1', 'Mine'))]],
      ['notification:inbox:person-b', other],
    ]);
    const service = createService(store);
    await expect(service.markRead('person-a', 'secret')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(store.get('notification:inbox:person-b')).toEqual(other);
  });

  it('rejects a missing id', async () => {
    const service = createService(new Map());
    await expect(service.markRead('person-a', '   ')).rejects.toBeInstanceOf(ProblemException);
  });
});

describe('NotificationService.enqueueInbox idempotency', () => {
  it('dedupes by occurrence key', async () => {
    const store = new Map<string, string[]>();
    const service = createService(store);
    const first = await service.enqueueInbox('person-a', item('n1', 'Order placed'), {
      occurrenceKey: 'notif:ORDER_CREATED:agg:person-a',
    });
    const second = await service.enqueueInbox('person-a', item('n2', 'Order placed'), {
      occurrenceKey: 'notif:ORDER_CREATED:agg:person-a',
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(store.get('notification:inbox:person-a')?.length).toBe(1);
  });

  it('marks external channels as EXTERNAL_GATED not live delivered', async () => {
    const store = new Map<string, string[]>();
    const service = createService(store);
    await service.enqueueInbox('person-a', {
      ...item('n1', 'SMS notice'),
      channel: 'sms',
    });
    const raw = store.get('notification:inbox:person-a')?.[0];
    const parsed = JSON.parse(raw!) as InboxItem;
    expect(parsed.delivery_status).toBe('EXTERNAL_GATED');
    expect(parsed.sandbox).toBe(true);
    expect(parsed.external_gated).toBe(true);
  });
});

describe('NotificationService mandatory preferences', () => {
  it('clamps operational prefs on and keeps marketing optional', async () => {
    const kv = new Map<string, string>([
      [
        'notification:prefs:person-a',
        JSON.stringify({
          email_enabled: true,
          push_enabled: false,
          sms_enabled: false,
          order_updates: false,
          appointment_updates: false,
          delivery_updates: false,
          settlement_updates: false,
          support_updates: false,
          marketing: true,
        }),
      ],
    ]);
    const service = createService(new Map(), kv);
    const prefs = await service.getPreferences('person-a');
    expect(prefs.order_updates).toBe(true);
    expect(prefs.appointment_updates).toBe(true);
    expect(prefs.marketing).toBe(false);
  });
});
