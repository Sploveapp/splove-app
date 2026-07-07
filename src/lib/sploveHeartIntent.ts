/**
 * Intention émotionnelle SPLove — exprimée au moment du like (pas un critère Discover).
 * Clés DB stables (`likes.heart_intent`) ; libellés utilisateur dans i18n :
 * - decouvrir → Découvrir
 * - compatibles → Activité
 * - ressemblent → Connexion
 * - coup_de_coeur → Coup de cœur
 */
export type SploveHeartIntent = "decouvrir" | "compatibles" | "ressemblent" | "coup_de_coeur";

export const SPLOVE_HEART_INTENTS: readonly SploveHeartIntent[] = [
  "decouvrir",
  "compatibles",
  "ressemblent",
  "coup_de_coeur",
] as const;

export const DEFAULT_SPLOVE_HEART_INTENT: SploveHeartIntent = "decouvrir";

/** Emoji d’intention pour notifications (le texte reçu inclut déjà l’emoji). */
export const SPLOVE_HEART_INTENT_EMOJI: Record<SploveHeartIntent, string> = {
  decouvrir: "💙",
  compatibles: "💚",
  ressemblent: "💛",
  coup_de_coeur: "🩷",
};

export type SploveHeartVisual = {
  imageUrl: string;
  orbitColor: string;
  glowRgb: string;
  premium: boolean;
  labelKey: string;
  descriptionKey: string;
  receivedIntentKey: string;
};

const HEARTS_BASE = `${import.meta.env.BASE_URL}hearts`.replace(/\/{2,}/g, "/");

export const SPLOVE_HEART_VISUALS: Record<SploveHeartIntent, SploveHeartVisual> = {
  decouvrir: {
    imageUrl: `${HEARTS_BASE}/heart-decouvrir.svg`,
    orbitColor: "#3B9EFF",
    glowRgb: "59, 158, 255",
    premium: false,
    labelKey: "sploveHeart.decouvrir",
    descriptionKey: "sploveHeart.desc.decouvrir",
    receivedIntentKey: "likes.receivedIntent.decouvrir",
  },
  compatibles: {
    imageUrl: `${HEARTS_BASE}/heart-compatibles.svg`,
    orbitColor: "#4CD964",
    glowRgb: "76, 217, 100",
    premium: false,
    labelKey: "sploveHeart.compatibles",
    descriptionKey: "sploveHeart.desc.compatibles",
    receivedIntentKey: "likes.receivedIntent.compatibles",
  },
  ressemblent: {
    imageUrl: `${HEARTS_BASE}/heart-ressemblent.svg`,
    orbitColor: "#FFD60A",
    glowRgb: "255, 214, 10",
    premium: false,
    labelKey: "sploveHeart.ressemblent",
    descriptionKey: "sploveHeart.desc.ressemblent",
    receivedIntentKey: "likes.receivedIntent.ressemblent",
  },
  coup_de_coeur: {
    imageUrl: `${HEARTS_BASE}/heart-coup_de_coeur.svg`,
    orbitColor: "#FF2D92",
    glowRgb: "255, 45, 146",
    premium: true,
    labelKey: "sploveHeart.coup_de_coeur",
    descriptionKey: "sploveHeart.desc.coup_de_coeur",
    receivedIntentKey: "likes.receivedIntent.coup_de_coeur",
  },
};

export function isSploveHeartIntent(value: unknown): value is SploveHeartIntent {
  return typeof value === "string" && (SPLOVE_HEART_INTENTS as readonly string[]).includes(value);
}

export function resolveHeartIntent(value: unknown): SploveHeartIntent {
  return isSploveHeartIntent(value) ? value : DEFAULT_SPLOVE_HEART_INTENT;
}

export function formatReceivedHeartIntentLine(
  t: (key: string, vars?: Record<string, string | number>) => string,
  intent: unknown,
  name: string,
): string {
  const resolved = resolveHeartIntent(intent);
  return t(SPLOVE_HEART_VISUALS[resolved].receivedIntentKey, { name });
}
