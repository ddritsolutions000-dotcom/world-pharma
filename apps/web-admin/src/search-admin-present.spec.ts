import { presentSearchJobs } from './search-admin-present';

describe('presentSearchJobs', () => {
  it('maps Prisma camelCase jobs', () => {
    expect(
      presentSearchJobs({
        data: [
          {
            id: 'j1',
            indexKind: 'CATALOG',
            status: 'PENDING',
            sourceType: 'admin_reindex',
            sourceId: 'item-1',
            locale: 'en',
            attempts: 1,
            lastError: null,
            createdAt: '2026-09-01T00:00:00.000Z',
          },
        ],
      }),
    ).toEqual([
      {
        id: 'j1',
        index_kind: 'CATALOG',
        status: 'PENDING',
        source_type: 'admin_reindex',
        source_id: 'item-1',
        locale: 'en',
        attempts: 1,
        last_error: '',
        created_at: '2026-09-01T00:00:00.000Z',
      },
    ]);
  });
});
