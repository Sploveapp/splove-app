import { isSplovePlayMonetizationEnabled, ENABLE_PLAY_PACK } from "../constants/splovePlayFlags";
import { hasPremiumAccess } from "../services/premium.service";
import { userHasFeature } from "../services/features.service";
import { FeatureKey } from "../types/features.types";
import { isPremiumSplovePlay, type SplovePlayType } from "./splovePlay";

export type SplovePlayAccess = {
  canSendPremiumPlays: boolean;
  canReadReceivedPlays: boolean;
  viaSplovePlus: boolean;
  viaPlayPack: boolean;
  /** Quota essai serveur (futur) — `null` = non actif côté serveur. */
  trialQuotaRemaining: number | null;
};

export const SPLOVE_PLAY_OPEN_ACCESS: SplovePlayAccess = {
  canSendPremiumPlays: true,
  canReadReceivedPlays: true,
  viaSplovePlus: true,
  viaPlayPack: false,
  trialQuotaRemaining: null,
};

const LOCKED_ACCESS: SplovePlayAccess = {
  canSendPremiumPlays: false,
  canReadReceivedPlays: false,
  viaSplovePlus: false,
  viaPlayPack: false,
  trialQuotaRemaining: null,
};

/**
 * Quota d’essai Play (futur, côté serveur — pas basé sur l’e-mail).
 * Retourne `null` tant qu’aucun endpoint n’est branché.
 */
export async function resolveSplovePlayTrialQuota(
  _userId: string,
): Promise<number | null> {
  void _userId;
  return null;
}

/** Résout les droits Play premium via SPLove+ / Pack Play existants. */
export async function resolveSplovePlayAccess(userId: string | null | undefined): Promise<SplovePlayAccess> {
  if (!userId) return LOCKED_ACCESS;

  const trialQuotaRemaining = await resolveSplovePlayTrialQuota(userId);

  const plus = await hasPremiumAccess(userId);
  if (plus) {
    return {
      canSendPremiumPlays: true,
      canReadReceivedPlays: true,
      viaSplovePlus: true,
      viaPlayPack: false,
      trialQuotaRemaining,
    };
  }

  if (ENABLE_PLAY_PACK && isSplovePlayMonetizationEnabled()) {
    const pack = await userHasFeature(FeatureKey.playPack);
    if (pack) {
      return {
        canSendPremiumPlays: true,
        canReadReceivedPlays: true,
        viaSplovePlus: false,
        viaPlayPack: true,
        trialQuotaRemaining,
      };
    }
  }

  if (trialQuotaRemaining != null && trialQuotaRemaining > 0) {
    return {
      canSendPremiumPlays: true,
      canReadReceivedPlays: true,
      viaSplovePlus: false,
      viaPlayPack: false,
      trialQuotaRemaining,
    };
  }

  return { ...LOCKED_ACCESS, trialQuotaRemaining };
}

export function canSelectSplovePlay(play: SplovePlayType, access: SplovePlayAccess): boolean {
  if (!isPremiumSplovePlay(play)) return true;
  return access.canSendPremiumPlays;
}
