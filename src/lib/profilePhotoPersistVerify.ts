import { supabase } from "./supabase";
import { normalizeProfilePhotoStoredRef } from "./profilePhotoUpload";
import {
  PROFILE_PHOTOS_BUCKET,
  profilePhotoObjectPathFromStoredValue,
} from "./profilePhotoSignedUrl";
import { PhotoFlowLog } from "./photoFlowLog";
import { SPLovePhotoLog } from "./profilePhotoPipelineLog";
import { logUserMainPhotoDisplay, getUserMainPhoto } from "./userMainPhoto";
import { logPhotoProfileSaveSuccess } from "./profilePhotoMainLog";
import { logPhotoDebug, photoDebugRowSnapshot } from "./photoDebugLog";
import { buildOnboardingPhotoUpsertPayload } from "./onboardingProfilePhotos";

export const PROFILE_PHOTO_READBACK_SELECT =
  "id, portrait_url, fullbody_url, main_photo_url, avatar_url";

export function profileRowHasCanonicalPhotos(
  row: Record<string, unknown> | null | undefined,
): boolean {
  if (!row) return false;
  const main = getUserMainPhoto(row).storedRef;
  const fullbody =
    typeof row.fullbody_url === "string" ? row.fullbody_url.trim() : "";
  return Boolean(main) || fullbody.length > 0;
}

/** Relit les colonnes photo depuis Supabase (sans écraser le cache auth). */
export async function readProfilePhotoFieldsFromDb(
  userId: string,
): Promise<Record<string, unknown> | null> {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_PHOTO_READBACK_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[profilePhotoPersistVerify] readback failed", {
      userId,
      message: error.message,
      code: error.code,
    });
    return null;
  }

  const row = (data as Record<string, unknown> | null) ?? null;
  if (row) {
    const main = getUserMainPhoto(row, userId);
    logUserMainPhotoDisplay("readProfilePhotoFieldsFromDb", {
      userId,
      readbackUrl: main.storedRef,
      sourceField: main.sourceField,
      storedRef: main.storedRef,
      extra: {
        portrait_url: row.portrait_url ?? null,
        fullbody_url: row.fullbody_url ?? null,
        main_photo_url: row.main_photo_url ?? null,
        avatar_url: row.avatar_url ?? null,
      },
    });
  }
  return row;
}

/** Vérifie que l’objet Storage existe (signed URL HEAD). */
export async function verifyProfilePhotoExistsInStorage(
  storedRef: string | null | undefined,
): Promise<boolean> {
  const normalized = normalizeProfilePhotoStoredRef(storedRef, supabase).trim();
  if (!normalized) return false;

  const objectPath = profilePhotoObjectPathFromStoredValue(normalized);
  if (objectPath) {
    const { data, error } = await supabase.storage
      .from(PROFILE_PHOTOS_BUCKET)
      .createSignedUrl(objectPath, 120);
    if (!error && data?.signedUrl) {
      try {
        const res = await fetch(data.signedUrl, { method: "HEAD" });
        return res.ok;
      } catch {
        return false;
      }
    }
  }

  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    try {
      const res = await fetch(normalized.split("?")[0] ?? normalized, { method: "HEAD" });
      return res.ok;
    } catch {
      return false;
    }
  }

  return false;
}

export type CanonicalPhotoUrls = {
  portraitUrl?: string | null;
  fullbodyUrl?: string | null;
};

/** Écrit les URLs canoniques en BDD (portrait → main + avatar). */
export async function persistCanonicalProfilePhotos(
  userId: string,
  urls: CanonicalPhotoUrls,
  source: string,
): Promise<{ ok: true; row: Record<string, unknown> } | { ok: false; error: string }> {
  const portrait = normalizeProfilePhotoStoredRef(urls.portraitUrl, supabase).trim();
  const fullbody = normalizeProfilePhotoStoredRef(urls.fullbodyUrl, supabase).trim();
  if (!portrait && !fullbody) {
    return { ok: false, error: "no_photo_urls" };
  }

  const payload =
    buildOnboardingPhotoUpsertPayload(
      userId,
      urls.portraitUrl ?? "",
      urls.fullbodyUrl ?? "",
      supabase,
    ) ?? null;
  if (!payload) {
    return { ok: false, error: "no_photo_urls" };
  }

  logUserMainPhotoDisplay(`${source}.persist`, {
    userId,
    uploadedUrl: portrait || fullbody,
    savedUrl: payload.main_photo_url as string,
    sourceField: portrait ? "portrait_url" : "fullbody_url",
    extra: { portrait: Boolean(portrait), fullbody: Boolean(fullbody) },
  });

  PhotoFlowLog.profileSavePayload({
    userId,
    source,
    operation: "upsert",
    payload,
  });

  const { data, error } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id" })
    .select(PROFILE_PHOTO_READBACK_SELECT)
    .maybeSingle();

  if (error) {
    SPLovePhotoLog.dbSaveError({
      source,
      userId,
      storedRef: portrait || fullbody,
      error: error.message,
    });
    return { ok: false, error: error.message };
  }

  const savedRow = (data ?? payload) as Record<string, unknown>;
  const main = getUserMainPhoto(savedRow, userId);

  logPhotoProfileSaveSuccess({
    userId,
    source,
    storedRef: main.storedRef,
    sourceField: main.sourceField,
    portrait_url: typeof savedRow.portrait_url === "string" ? savedRow.portrait_url : null,
    fullbody_url: typeof savedRow.fullbody_url === "string" ? savedRow.fullbody_url : null,
    main_photo_url: typeof savedRow.main_photo_url === "string" ? savedRow.main_photo_url : null,
  });

  SPLovePhotoLog.dbSaveSuccess({
    source,
    userId,
    storedRef: main.storedRef ?? undefined,
    profileRow: savedRow,
  });

  PhotoFlowLog.profileReadback({
    userId,
    source,
    row: savedRow,
  });

  return { ok: true, row: savedRow };
}

/** Persist + readback + vérif Storage pour les URLs uploadées. */
export async function ensureProfilePhotosPersistedWithReadback(
  userId: string,
  urls: CanonicalPhotoUrls,
  source: string,
): Promise<{ ok: true; row: Record<string, unknown> } | { ok: false; error: string }> {
  const portrait = normalizeProfilePhotoStoredRef(urls.portraitUrl, supabase).trim();
  const fullbody = normalizeProfilePhotoStoredRef(urls.fullbodyUrl, supabase).trim();

  let lastError = "photo_readback_missing_canonical_urls";

  for (const attempt of [source, `${source}.retry`] as const) {
    const written = await persistCanonicalProfilePhotos(
      userId,
      { portraitUrl: portrait || null, fullbodyUrl: fullbody || null },
      attempt,
    );
    if (!written.ok) {
      lastError = written.error;
      continue;
    }

    const row = await readProfilePhotoFieldsFromDb(userId);
    if (!row || !profileRowHasCanonicalPhotos(row)) continue;

    const main = getUserMainPhoto(row, userId);
    const storageOk = main.storedRef
      ? await verifyProfilePhotoExistsInStorage(main.storedRef)
      : false;

    logUserMainPhotoDisplay(`${attempt}.readback`, {
      userId,
      uploadedUrl: portrait || fullbody,
      savedUrl: main.storedRef,
      readbackUrl: main.storedRef,
      storedRef: main.storedRef,
      sourceField: main.sourceField,
      storageVerified: storageOk,
    });

    logPhotoDebug("persist_readback", {
      userId,
      source: attempt,
      storageVerified: storageOk,
      urls: photoDebugRowSnapshot(row),
    });

    logPhotoDebug("final_profile_urls", {
      userId,
      source: attempt,
      urls: photoDebugRowSnapshot(row),
    });

    if (!storageOk && main.storedRef) {
      console.warn("[profilePhotoPersistVerify] storage HEAD failed — URLs BDD présentes", {
        userId,
        storedRefPrefix: main.storedRef.slice(0, 96),
        source: attempt,
      });
    }

    return { ok: true, row };
  }

  return { ok: false, error: lastError };
}
