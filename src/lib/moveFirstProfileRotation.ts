/** Clé localStorage — offset de rotation du premier profil Move par utilisateur. */
export function moveFirstProfileOffsetStorageKey(userId: string): string {
  return `splove_move_first_profile_offset_${userId}`;
}

/** Incrément cold start déjà consommé dans ce contexte JS (pas au retour arrière-plan). */
let coldStartIncrementDone = false;
/** Offset utilisé au lancement froid courant — réappliqué si loadProfiles est rejoué (pending reload). */
let coldLaunchDisplayOffset: number | null = null;
let coldStartCommittedAt = 0;

/** Fenêtre où un second loadProfiles au même lancement froid réapplique la rotation (ex. profil auth chargé). */
const COLD_LAUNCH_REAPPLY_MS = 15_000;

export function getColdLaunchDisplayOffset(): number | null {
  return coldLaunchDisplayOffset;
}

function readStoredOffset(userId: string): number {
  try {
    const raw = localStorage.getItem(moveFirstProfileOffsetStorageKey(userId));
    if (raw == null || raw === "") return 0;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeStoredOffset(userId: string, offset: number): void {
  try {
    localStorage.setItem(moveFirstProfileOffsetStorageKey(userId), String(offset));
  } catch {
    /* ignore quota / private mode */
  }
}

function computeRotationSteps(count: number, offset: number, forceAdvance: boolean): number {
  if (count <= 1) return 0;
  let steps = ((offset % count) + count) % count;
  if (forceAdvance && steps === 0) steps = 1;
  return steps;
}

/** Rotation circulaire gauche — réordonne uniquement, ne retire aucun profil. */
export function rotateMoveProfileList<T>(items: T[], offset: number): T[] {
  const steps = computeRotationSteps(items.length, offset, false);
  if (steps === 0) return items;
  return [...items.slice(steps), ...items.slice(0, steps)];
}

function rotateBySteps<T>(items: T[], steps: number): T[] {
  if (items.length <= 1 || steps === 0) return items;
  const n = items.length;
  const normalized = ((steps % n) + n) % n;
  if (normalized === 0) return items;
  return [...items.slice(normalized), ...items.slice(0, normalized)];
}

export type ApplyMoveProfileRotationForFeedCommitOptions = {
  /** Réapplique l’offset du lancement froid (second loadProfiles après pending reload). */
  reapplyPendingReload?: boolean;
};

/**
 * Rotation d’ordre uniquement — après scoring/filtres, avant setStableProfiles.
 * Incrémente l’offset localStorage une seule fois par contexte JS (fermeture complète).
 */
export function applyMoveProfileRotationForFeedCommit<T extends { id: string }>(
  userId: string,
  profiles: T[],
  options: ApplyMoveProfileRotationForFeedCommitOptions = {},
): T[] {
  const count = profiles.length;

  if (!userId) {
    console.log("MOVE_FIRST_PROFILE_ROTATION_SKIPPED", { reason: "missing_user", count });
    return profiles;
  }

  if (count <= 1) {
    console.log("MOVE_FIRST_PROFILE_ROTATION_SKIPPED", {
      reason: count === 1 ? "single_profile_after_filters" : "count_lte_1",
      count,
    });
    return profiles;
  }

  if (options.reapplyPendingReload && coldLaunchDisplayOffset !== null) {
    const steps = computeRotationSteps(count, coldLaunchDisplayOffset, false);
    const beforeFirstId = profiles[0]?.id ?? null;
    const rotated = rotateBySteps(profiles, steps);
    const afterFirstId = rotated[0]?.id ?? null;
    console.log("MOVE_FIRST_PROFILE_ROTATION_APPLIED", {
      userId,
      offset: coldLaunchDisplayOffset,
      count,
      beforeFirstId,
      afterFirstId,
      mode: "reapply_pending_reload",
    });
    return rotated;
  }

  if (coldStartIncrementDone) {
    const withinColdLaunchWindow =
      coldLaunchDisplayOffset !== null &&
      coldStartCommittedAt > 0 &&
      Date.now() - coldStartCommittedAt < COLD_LAUNCH_REAPPLY_MS;
    if (withinColdLaunchWindow) {
      const steps = computeRotationSteps(count, coldLaunchDisplayOffset!, false);
      const beforeFirstId = profiles[0]?.id ?? null;
      const rotated = rotateBySteps(profiles, steps);
      const afterFirstId = rotated[0]?.id ?? null;
      console.log("MOVE_FIRST_PROFILE_ROTATION_APPLIED", {
        userId,
        offset: coldLaunchDisplayOffset,
        count,
        beforeFirstId,
        afterFirstId,
        mode: "reapply_cold_launch_window",
      });
      return rotated;
    }
    console.log("MOVE_FIRST_PROFILE_ROTATION_SKIPPED", { reason: "warm_session", count });
    return profiles;
  }

  const offset = readStoredOffset(userId);
  const steps = computeRotationSteps(count, offset, true);
  coldLaunchDisplayOffset = offset;
  coldStartIncrementDone = true;
  coldStartCommittedAt = Date.now();
  writeStoredOffset(userId, offset + 1);

  const beforeFirstId = profiles[0]?.id ?? null;
  const rotated = rotateBySteps(profiles, steps);
  const afterFirstId = rotated[0]?.id ?? null;

  console.log("MOVE_FIRST_PROFILE_ROTATION_APPLIED", {
    userId,
    offset,
    count,
    beforeFirstId,
    afterFirstId,
    mode: "cold_start",
  });

  return rotated;
}

/** Réapplique la rotation du lancement froid après un re-tri local (ex. SPLove+). */
export function reapplyColdLaunchMoveProfileRotation<T extends { id: string }>(
  userId: string,
  profiles: T[],
): T[] {
  if (!userId || profiles.length <= 1 || coldLaunchDisplayOffset === null) return profiles;
  const steps = computeRotationSteps(profiles.length, coldLaunchDisplayOffset, false);
  if (steps === 0) return profiles;
  return rotateBySteps(profiles, steps);
}
