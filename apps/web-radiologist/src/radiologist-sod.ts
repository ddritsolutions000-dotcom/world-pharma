/** Radiologist separation-of-duties — author cannot verify their own report. */
export function canRadiologistVerify(
  enteredByPersonId: string | null | undefined,
  currentPersonId: string | null | undefined,
): boolean {
  if (!enteredByPersonId || !currentPersonId) {
    return false;
  }
  return enteredByPersonId !== currentPersonId;
}
