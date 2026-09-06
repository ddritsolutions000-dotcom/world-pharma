import { phleboPrimaryStep, type PhleboPrimaryStep } from './phlebotomist-status-labels';
import type { CollectionJob } from './phlebotomist-api';

function job(partial: Partial<CollectionJob>): CollectionJob {
  return {
    id: 'j1',
    status: 'ASSIGNED',
    coc_status: 'ASSIGNED',
    collection_mode: 'HOME',
    test_title: 'CBC',
    customer_display: 'A***',
    city: 'Gurugram',
    line1_masked: null,
    container_barcode: null,
    assignee_id: null,
    is_mine: false,
    ...partial,
  };
}

describe('phleboPrimaryStep', () => {
  it('asks unassigned collectors to accept', () => {
    expect(phleboPrimaryStep(job({}))).toBe('accept');
  });

  it('walks the home-collection happy path', () => {
    const mine = { is_mine: true, assignee_id: 'p1' };
    const steps: Array<[string, PhleboPrimaryStep]> = [
      ['ACCEPTED', 'arrive'],
      ['ARRIVED', 'verify'],
      ['VERIFIED', 'collect'],
      ['COLLECTED', 'seal'],
      ['SEALED', 'handover'],
      ['HANDED_OVER', 'done'],
    ];
    for (const [status, expected] of steps) {
      expect(phleboPrimaryStep(job({ ...mine, coc_status: status, status }))).toBe(expected);
    }
  });
});
