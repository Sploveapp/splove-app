/**
 * Logs structurés du pipeline photos SPLove — repérer où les URLs disparaissent.
 * Préfixe unique : [SPLovePhoto] — filtrable dans Xcode / Safari Web Inspector.
 */

export type ProfilePhotoPipelineSlot = "portrait" | "activity" | "full" | "primary" | "secondary";

export type ProfilePhotoFieldsSnapshot = {
  portrait_url: string | null;
  fullbody_url: string | null;
  main_photo_url: string | null;
  avatar_url: string | null;
  has_portrait: boolean;
  has_fullbody: boolean;
  has_main: boolean;
  has_avatar: boolean;
};

type BaseCtx = {
  /** Identifiant de l’étape appelante (ex. onboarding.assignPhoto, profile.hydrate). */
  source: string;
  userId?: string | null;
  slot?: ProfilePhotoPipelineSlot;
  objectPath?: string | null;
  storedRef?: string | null;
  displayUrl?: string | null;
  error?: string | null;
  profileRow?: Record<string, unknown> | null;
  extra?: Record<string, unknown>;
};

function truncateUserId(id?: string | null): string | null {
  if (!id) return null;
  const s = id.trim();
  if (!s) return null;
  return s.length > 8 ? `${s.slice(0, 8)}…` : s;
}

/** URL tronquée — jamais de token JWT / query signée complète. */
export function photoUrlPrefix(url?: string | null): string | null {
  if (url == null) return null;
  const t = String(url).trim();
  if (!t) return null;
  const withoutQuery = t.split("?")[0] ?? t;
  if (withoutQuery.length <= 96) return withoutQuery;
  return `${withoutQuery.slice(0, 96)}…`;
}

/** Extrait les champs photo d’une ligne `profiles` pour comparaison entre étapes. */
export function snapshotProfilePhotoFields(
  row?: Record<string, unknown> | null,
): ProfilePhotoFieldsSnapshot | null {
  if (!row || typeof row !== "object") return null;
  const portrait = typeof row.portrait_url === "string" ? row.portrait_url.trim() : "";
  const fullbody = typeof row.fullbody_url === "string" ? row.fullbody_url.trim() : "";
  const main = typeof row.main_photo_url === "string" ? row.main_photo_url.trim() : "";
  const avatar = typeof row.avatar_url === "string" ? row.avatar_url.trim() : "";
  return {
    portrait_url: photoUrlPrefix(portrait),
    fullbody_url: photoUrlPrefix(fullbody),
    main_photo_url: photoUrlPrefix(main),
    avatar_url: photoUrlPrefix(avatar),
    has_portrait: portrait.length > 0,
    has_fullbody: fullbody.length > 0,
    has_main: main.length > 0,
    has_avatar: avatar.length > 0,
  };
}

function basePayload(ctx: BaseCtx): Record<string, unknown> {
  return {
    source: ctx.source,
    userId: truncateUserId(ctx.userId),
    slot: ctx.slot ?? null,
    objectPath: ctx.objectPath ?? null,
    storedRef: photoUrlPrefix(ctx.storedRef),
    displayUrl: photoUrlPrefix(ctx.displayUrl),
    photos: snapshotProfilePhotoFields(ctx.profileRow),
    ...ctx.extra,
  };
}

export const SPLovePhotoLog = {
  /** Étape 1 — fichier sélectionné, upload Storage en cours. */
  uploadStarted(
    ctx: BaseCtx & { fileSize?: number; fileType?: string },
  ): void {
    console.log("[SPLovePhoto] 1/5 Upload démarré", {
      ...basePayload(ctx),
      fileSize: ctx.fileSize ?? null,
      fileType: ctx.fileType ?? null,
    });
  },

  /** Étape 2 — objet présent dans le bucket `profile-photos`. */
  uploadSuccess(ctx: BaseCtx): void {
    console.log("[SPLovePhoto] 2/5 Upload réussi", basePayload(ctx));
  },

  /** Étape 3 — URL publique (référence canonique BDD) ou URL d’aperçu générée. */
  urlGenerated(ctx: BaseCtx): void {
    console.log("[SPLovePhoto] 3/5 URL générée", basePayload(ctx));
  },

  /** Étape 4 — colonnes photo persistées dans `profiles`. */
  dbSaveSuccess(ctx: BaseCtx): void {
    console.log("[SPLovePhoto] 4/5 Sauvegarde base réussie", basePayload(ctx));
  },

  dbSaveError(ctx: BaseCtx): void {
    console.error("[SPLovePhoto] 4/5 Sauvegarde base ÉCHEC", {
      ...basePayload(ctx),
      error: ctx.error ?? "unknown",
    });
  },

  /** Étape 5 — profil relu depuis Supabase (SELECT / cache / hydrate). */
  profileLoadSuccess(ctx: BaseCtx): void {
    const photos = snapshotProfilePhotoFields(ctx.profileRow);
    const anyPhoto =
      photos?.has_portrait || photos?.has_fullbody || photos?.has_main || photos?.has_avatar;
    console.log("[SPLovePhoto] 5/5 Chargement profil réussi", {
      ...basePayload(ctx),
      hasAnyPhotoUrl: Boolean(anyPhoto),
    });
  },

  profileLoadEmpty(ctx: BaseCtx): void {
    console.warn("[SPLovePhoto] 5/5 Chargement profil SANS photo", basePayload(ctx));
  },

  /** Résolution BDD → `<img src>` (signed / public). */
  displayResolved(ctx: BaseCtx): void {
    console.log("[SPLovePhoto] display OK", basePayload(ctx));
  },

  displayFailed(ctx: BaseCtx): void {
    console.warn("[SPLovePhoto] display ÉCHEC", {
      ...basePayload(ctx),
      error: ctx.error ?? "resolve_failed",
    });
  },
};
