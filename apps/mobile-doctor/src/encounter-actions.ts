export type EncounterAction = 'confirm' | 'check-in' | 'start' | 'complete';
export type EncounterSecondaryAction = 'cancel' | 'no-show';

export function availableEncounterActions(status: string): EncounterAction[] {
  switch (status.toUpperCase()) {
    case 'REQUESTED':
      return ['confirm'];
    case 'CONFIRMED':
    case 'RESCHEDULED':
      return ['check-in'];
    case 'CHECKED_IN':
      return ['start'];
    case 'IN_CONSULTATION':
      return ['complete'];
    default:
      return [];
  }
}

export function availableEncounterSecondaryActions(status: string): EncounterSecondaryAction[] {
  switch (status.toUpperCase()) {
    case 'REQUESTED':
      return ['cancel'];
    case 'CONFIRMED':
    case 'RESCHEDULED':
    case 'CHECKED_IN':
      return ['cancel', 'no-show'];
    default:
      return [];
  }
}
