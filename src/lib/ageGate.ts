/** Âge minimum pour l’accès à l’app (découverte, etc.) — même règle que l’onboarding. */
const MIN_AGE = 18;

/** `birthDate` attendu en ISO `YYYY-MM-DD` (colonne `profiles.birth_date`). */
export function isAdultFromBirthIso(birthDate: string | null | undefined): boolean {
  if (!birthDate) return false;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return false;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age >= MIN_AGE;
}
