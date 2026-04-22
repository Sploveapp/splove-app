export type ProfileCompletionInput = {
    first_name?: string | null;
    birth_date?: string | null;
    gender?: string | null;
    interested_in?: string | null;
    intent?: string | null;
    sports?: string[] | null;
    main_photo_url?: string | null;
  };
  
  function hasText(value?: string | null): boolean {
    return typeof value === "string" && value.trim().length > 0;
  }
  
  function hasAtLeastOneSport(sports?: string[] | null): boolean {
    return Array.isArray(sports) && sports.filter(Boolean).length >= 1;
  }
  
  export function computeOnboardingCompleted(profile: ProfileCompletionInput): boolean {
    return (
      hasText(profile.first_name) &&
      hasText(profile.birth_date) &&
      hasText(profile.gender) &&
      hasText(profile.interested_in) &&
      hasText(profile.intent) &&
      hasAtLeastOneSport(profile.sports)
    );
  }
  
  export function computeProfileCompleted(profile: ProfileCompletionInput): boolean {
    return (
      computeOnboardingCompleted(profile) &&
      hasText(profile.main_photo_url)
    );
  }
  
  export function computeProfileCompletionFlags(profile: ProfileCompletionInput) {
    const onboarding_completed = computeOnboardingCompleted(profile);
    const profile_completed = computeProfileCompleted(profile);
  
    return {
      onboarding_completed,
      profile_completed,
    };
  }