/** Une fente photo onboarding n’est « remplie » que si l’upload Storage + upsert profil a réussi. */
export function onboardingPhotoSlotPersisted(savedUrl: string): boolean {
  return savedUrl.trim() !== "";
}

export function countOnboardingPersistedPhotoSlots(
  portraitSavedUrl: string,
  bodySavedUrl: string,
): number {
  let count = 0;
  if (onboardingPhotoSlotPersisted(portraitSavedUrl)) count += 1;
  if (onboardingPhotoSlotPersisted(bodySavedUrl)) count += 1;
  return count;
}

export function onboardingPhotosFullyPersisted(
  portraitSavedUrl: string,
  bodySavedUrl: string,
): boolean {
  return countOnboardingPersistedPhotoSlots(portraitSavedUrl, bodySavedUrl) === 2;
}
