/** Actions exposed in doctor encounter UI — mirrors backend appointment state machine entry points. */
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

export function encounterActionLabel(action: EncounterAction): string {
  switch (action) {
    case 'confirm':
      return 'Confirm appointment';
    case 'check-in':
      return 'Check in patient';
    case 'start':
      return 'Start consultation';
    case 'complete':
      return 'Complete consultation';
  }
}

export function encounterSecondaryActionLabel(action: EncounterSecondaryAction): string {
  switch (action) {
    case 'cancel':
      return 'Cancel appointment';
    case 'no-show':
      return 'Mark no-show';
  }
}
