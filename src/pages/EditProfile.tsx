import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import {
  APP_BG,
  APP_BORDER,
  APP_CARD,
  APP_TEXT,
  APP_TEXT_MUTED,
  BRAND_BG,
  CTA_DISABLED_BG,
  TEXT_ON_BRAND,
} from "../constants/theme";

type SportOption = { id: string | number; name: string; category?: string | null };
type LookingForValue =
  | "women"
  | "men"
  | "trans_women"
  | "trans_men"
  | "non_binary"
  | "all";

const LOOKING_FOR_OPTIONS: { value: LookingForValue; label: string }[] = [
  { value: "women", label: "Femmes" },
  { value: "men", label: "Hommes" },
  { value: "trans_women", label: "Femmes trans" },
  { value: "trans_men", label: "Hommes trans" },
  { value: "non_binary", label: "Personnes non-binaires" },
  { value: "all", label: "Tous" },
];

const INTENT_OPTIONS = [
  { value: "dating_feeling", label: "Rencontre" },
  { value: "sport_social", label: "Sport" },
  { value: "both", label: "Les deux" },
] as const;

const TIME_OPTIONS = ["Matin", "Soir"] as const;
const INTENSITY_OPTIONS = [
  { value: "chill", label: "Chill" },
  { value: "intense", label: "Intense" },
] as const;
const PLANNING_OPTIONS = [
  { value: "spontaneous", label: "Spontané" },
  { value: "planned", label: "Planifié" },
] as const;

const PHOTO_BUCKET = "profile-photos";
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_ACCEPT_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

function mapDbIntentToUi(raw: unknown): (typeof INTENT_OPTIONS)[number]["value"] {
  const n = String(raw ?? "").trim().toLowerCase();
  if (n === "amical" || n === "friendly" || n === "sport_social") return "sport_social";
  if (n === "both") return "both";
  return "dating_feeling";
}

function mapUiIntentToDb(raw: (typeof INTENT_OPTIONS)[number]["value"]): string {
  if (raw === "sport_social") return "Amical";
  if (raw === "both") return "both";
  return "Amoureux";
}

function parseLookingFor(raw: unknown): LookingForValue[] {
  const list = Array.isArray(raw)
    ? raw.map((x) => String(x ?? ""))
    : String(raw ?? "")
        .split(",")
        .map((x) => x.trim());
  const out: LookingForValue[] = [];
  for (const item of list) {
    const n = item.toLowerCase();
    const mapped =
      n === "women" || n === "femme" || n === "femmes"
        ? "women"
        : n === "men" || n === "homme" || n === "hommes"
          ? "men"
          : n === "trans_women" || n === "femmes trans"
            ? "trans_women"
            : n === "trans_men" || n === "hommes trans"
              ? "trans_men"
              : n === "non_binary" || n === "non-binaire"
                ? "non_binary"
                : n === "all" || n === "tous"
                  ? "all"
                  : "";
    if (mapped && !out.includes(mapped as LookingForValue)) out.push(mapped as LookingForValue);
  }
  return out.includes("all") ? ["all"] : out;
}

export default function EditProfile() {
  const navigate = useNavigate();
  const { user, profile, refetchProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [sportsCatalog, setSportsCatalog] = useState<SportOption[]>([]);
  const [selectedSports, setSelectedSports] = useState<SportOption[]>([]);
  const [sportSearch, setSportSearch] = useState("");

  const [intent, setIntent] = useState<(typeof INTENT_OPTIONS)[number]["value"]>("dating_feeling");
  const [lookingFor, setLookingFor] = useState<LookingForValue[]>([]);
  const [sportTime, setSportTime] = useState<(typeof TIME_OPTIONS)[number] | "">("");
  const [sportIntensity, setSportIntensity] = useState<"chill" | "intense" | "">("");
  const [planningStyle, setPlanningStyle] = useState<"spontaneous" | "planned" | "">("");
  const [bio, setBio] = useState("");

  const [portraitUrl, setPortraitUrl] = useState("");
  const [bodyUrl, setBodyUrl] = useState("");
  const [portraitFile, setPortraitFile] = useState<File | null>(null);
  const [bodyFile, setBodyFile] = useState<File | null>(null);
  const [portraitPreviewUrl, setPortraitPreviewUrl] = useState<string>("");
  const [bodyPreviewUrl, setBodyPreviewUrl] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    async function loadCatalogAndSports() {
      const { data: sportsData } = await supabase
        .from("sports")
        .select("id, label, category")
        .eq("active", true)
        .order("label", { ascending: true });
      if (cancelled) return;
      const catalog: SportOption[] = (sportsData ?? []).map((r) => ({
        id: r.id,
        name: String(r.label ?? "").trim(),
        category: (r.category as string | null) ?? null,
      }));
      setSportsCatalog(catalog);

      if (!user?.id) return;
      const { data: links } = await supabase
        .from("profile_sports")
        .select("sport_id")
        .eq("profile_id", user.id);
      if (cancelled || !links) return;
      const chosen = links
        .map((l) => catalog.find((c) => String(c.id) === String(l.sport_id)))
        .filter((x): x is SportOption => x != null)
        .slice(0, 3);
      setSelectedSports(chosen);
    }
    void loadCatalogAndSports();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!profile) return;
    setIntent(mapDbIntentToUi(profile.intent));
    setLookingFor(parseLookingFor(profile.looking_for));
    const st = String((profile as Record<string, unknown>).sport_time ?? "");
    setSportTime(st === "Matin" || st === "Soir" ? st : "");
    const si = String((profile as Record<string, unknown>).sport_intensity ?? "");
    setSportIntensity(si === "chill" || si === "intense" ? si : "");
    const ps = String((profile as Record<string, unknown>).planning_style ?? "");
    setPlanningStyle(ps === "spontaneous" || ps === "planned" ? ps : "");
    setBio(String((profile as Record<string, unknown>).sport_phrase ?? ""));
    setPortraitUrl(String(profile.portrait_url ?? ""));
    setBodyUrl(String(profile.fullbody_url ?? ""));
  }, [profile]);

  useEffect(() => {
    if (!portraitFile) {
      setPortraitPreviewUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(portraitFile);
    setPortraitPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [portraitFile]);

  useEffect(() => {
    if (!bodyFile) {
      setBodyPreviewUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(bodyFile);
    setBodyPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [bodyFile]);

  const searchMatches = useMemo(() => {
    const q = sportSearch.trim().toLowerCase();
    if (q.length < 2) return [];
    return sportsCatalog
      .filter((s) => {
        const hay = `${s.name} ${s.category ?? ""}`.toLowerCase();
        const already = selectedSports.some((x) => String(x.id) === String(s.id));
        return !already && hay.includes(q);
      })
      .slice(0, 10);
  }, [sportSearch, sportsCatalog, selectedSports]);

  function toggleSport(sport: SportOption): void {
    setSelectedSports((prev) => {
      const exists = prev.some((x) => String(x.id) === String(sport.id));
      if (exists) return prev.filter((x) => String(x.id) !== String(sport.id));
      if (prev.length >= 3) return prev;
      return [...prev, sport];
    });
  }

  function toggleLookingFor(value: LookingForValue): void {
    setLookingFor((prev) => {
      if (value === "all") return prev.includes("all") ? [] : ["all"];
      const withoutAll = prev.filter((x) => x !== "all");
      if (withoutAll.includes(value)) return withoutAll.filter((x) => x !== value);
      return [...withoutAll, value];
    });
  }

  async function uploadPhoto(userId: string, file: File, kind: "portrait" | "full"): Promise<string> {
    if (!PHOTO_ACCEPT_MIMES.has(file.type)) throw new Error("Formats acceptés : JPG, PNG, WebP.");
    if (file.size > PHOTO_MAX_BYTES) throw new Error("Chaque photo doit faire 5 Mo maximum.");
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${userId}/${kind}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, {
      upsert: true,
      contentType: file.type,
    });
    if (error) throw error;
    return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  async function handleSave(): Promise<void> {
    if (!user?.id) return;
    setLoading(true);
    setMessage(null);
    try {
      let nextPortrait = portraitUrl;
      let nextBody = bodyUrl;
      if (portraitFile) nextPortrait = await uploadPhoto(user.id, portraitFile, "portrait");
      if (bodyFile) nextBody = await uploadPhoto(user.id, bodyFile, "full");

      // Keep PATCH payload minimal and schema-safe to avoid PostgREST 400 on unknown columns.
      const payload: Record<string, unknown> = {
        intent: mapUiIntentToDb(intent),
        looking_for: lookingFor.length ? lookingFor.join(",") : null,
        sport_phrase: bio.trim() || null,
        portrait_url: nextPortrait || null,
        fullbody_url: nextBody || null,
        main_photo_url: nextPortrait || nextBody || null,
        updated_at: new Date().toISOString(),
      };

      const { error: profileError } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", user.id);
      if (profileError) {
        console.error("[EditProfile] profiles update error", {
          profileId: user.id,
          payload,
          code: profileError.code,
          message: profileError.message,
          details: profileError.details,
          hint: profileError.hint,
          error: profileError,
        });
        throw profileError;
      }

      const selectedSportIds = Array.from(
        new Set(
          selectedSports
            .map((s) => String(s.id).trim())
            .filter((id) => id.length > 0)
        )
      );

      const { error: delErr } = await supabase
        .from("profile_sports")
        .delete()
        .eq("profile_id", user.id);
      if (delErr) {
        console.error("[EditProfile] profile_sports delete error", {
          profileId: user.id,
          selectedSportIds,
          code: delErr.code,
          message: delErr.message,
          details: delErr.details,
          hint: delErr.hint,
          error: delErr,
        });
        throw delErr;
      }

      if (selectedSportIds.length > 0) {
        const rows = selectedSportIds.map((sportId) => ({
          profile_id: user.id,
          sport_id: sportId,
          level: "regular",
          is_primary: false,
        }));
        if (rows.length > 0) {
          rows[0] = { ...rows[0], is_primary: true };
        }
        const { error: insErr } = await supabase
          .from("profile_sports")
          .insert(rows);
        if (insErr) {
          console.error("[EditProfile] profile_sports insert error", {
            profileId: user.id,
            selectedSportIds,
            rows,
            code: insErr.code,
            message: insErr.message,
            details: insErr.details,
            hint: insErr.hint,
            error: insErr,
          });
          throw insErr;
        }
      }

      await refetchProfile();
      setMessage("Profil mis à jour.");
      setPortraitFile(null);
      setBodyFile(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Impossible d’enregistrer les modifications.";
      setMessage(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: APP_BG, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" }}>
      <main style={{ padding: "24px", maxWidth: "560px", margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 18px 0", fontSize: "22px", fontWeight: 700, color: APP_TEXT }}>Modifier mon profil</h1>

        <section style={{ background: APP_CARD, borderRadius: 16, border: `1px solid ${APP_BORDER}`, padding: 16, marginBottom: 14 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 15, color: APP_TEXT }}>Sports (max 3)</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {selectedSports.map((s) => (
              <button key={String(s.id)} type="button" onClick={() => toggleSport(s)} style={{ border: `1px solid ${BRAND_BG}`, background: BRAND_BG, color: TEXT_ON_BRAND, borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 600 }}>
                {s.name} ×
              </button>
            ))}
          </div>
          <input value={sportSearch} onChange={(e) => setSportSearch(e.target.value)} placeholder="Rechercher un sport" style={{ width: "100%", boxSizing: "border-box", marginBottom: 8, padding: "10px 12px", borderRadius: 12, border: `1px solid ${APP_BORDER}`, background: APP_BG, color: APP_TEXT }} />
          {searchMatches.length > 0 ? (
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {searchMatches.map((s) => (
                <button key={String(s.id)} type="button" onClick={() => toggleSport(s)} style={{ border: `1px solid ${APP_BORDER}`, background: APP_BG, color: APP_TEXT_MUTED, borderRadius: 12, padding: "8px 10px", fontSize: 13, fontWeight: 600 }}>
                  {s.name}
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section style={{ background: APP_CARD, borderRadius: 16, border: `1px solid ${APP_BORDER}`, padding: 16, marginBottom: 14 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 15, color: APP_TEXT }}>Intentions</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {INTENT_OPTIONS.map((opt) => {
              const active = intent === opt.value;
              return (
                <button key={opt.value} type="button" onClick={() => setIntent(opt.value)} style={{ border: `1px solid ${active ? BRAND_BG : APP_BORDER}`, background: active ? BRAND_BG : APP_BG, color: active ? TEXT_ON_BRAND : APP_TEXT, borderRadius: 12, padding: "10px 12px", fontSize: 14, fontWeight: 600 }}>
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        <section style={{ background: APP_CARD, borderRadius: 16, border: `1px solid ${APP_BORDER}`, padding: 16, marginBottom: 14 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 15, color: APP_TEXT }}>Attirance</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
            {LOOKING_FOR_OPTIONS.map((opt) => {
              const active = lookingFor.includes(opt.value);
              return (
                <button key={opt.value} type="button" onClick={() => toggleLookingFor(opt.value)} style={{ border: `1px solid ${active ? BRAND_BG : APP_BORDER}`, background: active ? BRAND_BG : APP_BG, color: active ? TEXT_ON_BRAND : APP_TEXT, borderRadius: 12, padding: "10px 8px", fontSize: 13, fontWeight: 600 }}>
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        <section style={{ background: APP_CARD, borderRadius: 16, border: `1px solid ${APP_BORDER}`, padding: 16, marginBottom: 14 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 15, color: APP_TEXT }}>Style</h2>
          <div style={{ display: "grid", gap: 8, marginBottom: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
              {TIME_OPTIONS.map((v) => (
                <button key={v} type="button" onClick={() => setSportTime(v)} style={{ border: `1px solid ${sportTime === v ? BRAND_BG : APP_BORDER}`, background: sportTime === v ? BRAND_BG : APP_BG, color: sportTime === v ? TEXT_ON_BRAND : APP_TEXT, borderRadius: 12, padding: "10px 8px", fontSize: 13, fontWeight: 600 }}>
                  {v}
                </button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
              {INTENSITY_OPTIONS.map((v) => (
                <button key={v.value} type="button" onClick={() => setSportIntensity(v.value)} style={{ border: `1px solid ${sportIntensity === v.value ? BRAND_BG : APP_BORDER}`, background: sportIntensity === v.value ? BRAND_BG : APP_BG, color: sportIntensity === v.value ? TEXT_ON_BRAND : APP_TEXT, borderRadius: 12, padding: "10px 8px", fontSize: 13, fontWeight: 600 }}>
                  {v.label}
                </button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
              {PLANNING_OPTIONS.map((v) => (
                <button key={v.value} type="button" onClick={() => setPlanningStyle(v.value)} style={{ border: `1px solid ${planningStyle === v.value ? BRAND_BG : APP_BORDER}`, background: planningStyle === v.value ? BRAND_BG : APP_BG, color: planningStyle === v.value ? TEXT_ON_BRAND : APP_TEXT, borderRadius: 12, padding: "10px 8px", fontSize: 13, fontWeight: 600 }}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section style={{ background: APP_CARD, borderRadius: 16, border: `1px solid ${APP_BORDER}`, padding: 16, marginBottom: 14 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 15, color: APP_TEXT }}>Bio</h2>
          <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 500))} rows={4} placeholder="Parle un peu de toi..." style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 12, border: `1px solid ${APP_BORDER}`, background: APP_BG, color: APP_TEXT, resize: "vertical" }} />
        </section>

        <section style={{ background: APP_CARD, borderRadius: 16, border: `1px solid ${APP_BORDER}`, padding: 16, marginBottom: 18 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 15, color: APP_TEXT }}>Photos</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <div style={{ border: `1px solid ${APP_BORDER}`, borderRadius: 14, padding: 10, background: APP_BG }}>
              <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: APP_TEXT_MUTED }}>Photo principale</p>
              {portraitPreviewUrl || portraitUrl ? (
                <img
                  src={portraitPreviewUrl || portraitUrl}
                  alt="Photo principale"
                  style={{ width: "100%", aspectRatio: "4 / 5", objectFit: "cover", borderRadius: 12, marginBottom: 10 }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "4 / 5",
                    borderRadius: 12,
                    marginBottom: 10,
                    border: `1px dashed ${APP_BORDER}`,
                    color: APP_TEXT_MUTED,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                  }}
                >
                  Aucun aperçu
                </div>
              )}
              <input
                id="edit-profile-portrait-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setPortraitFile(e.target.files?.[0] ?? null)}
                style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
              />
              <label
                htmlFor="edit-profile-portrait-file"
                style={{
                  display: "inline-flex",
                  width: "100%",
                  justifyContent: "center",
                  border: `1px solid ${APP_BORDER}`,
                  borderRadius: 10,
                  background: APP_CARD,
                  color: APP_TEXT,
                  padding: "10px 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Remplacer la photo
              </label>
            </div>
            <div style={{ border: `1px solid ${APP_BORDER}`, borderRadius: 14, padding: 10, background: APP_BG }}>
              <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: APP_TEXT_MUTED }}>Photo secondaire</p>
              {bodyPreviewUrl || bodyUrl ? (
                <img
                  src={bodyPreviewUrl || bodyUrl}
                  alt="Photo secondaire"
                  style={{ width: "100%", aspectRatio: "4 / 5", objectFit: "cover", borderRadius: 12, marginBottom: 10 }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "4 / 5",
                    borderRadius: 12,
                    marginBottom: 10,
                    border: `1px dashed ${APP_BORDER}`,
                    color: APP_TEXT_MUTED,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                  }}
                >
                  Aucun aperçu
                </div>
              )}
              <input
                id="edit-profile-body-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setBodyFile(e.target.files?.[0] ?? null)}
                style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
              />
              <label
                htmlFor="edit-profile-body-file"
                style={{
                  display: "inline-flex",
                  width: "100%",
                  justifyContent: "center",
                  border: `1px solid ${APP_BORDER}`,
                  borderRadius: 10,
                  background: APP_CARD,
                  color: APP_TEXT,
                  padding: "10px 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Remplacer la photo
              </label>
            </div>
          </div>
        </section>

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={() => navigate("/profile")} style={{ flex: 1, borderRadius: 12, border: `1px solid ${APP_BORDER}`, background: APP_CARD, color: APP_TEXT, padding: "12px 14px", fontWeight: 600 }}>
            Retour
          </button>
          <button type="button" onClick={() => void handleSave()} disabled={loading} style={{ flex: 1, borderRadius: 12, border: "none", background: loading ? CTA_DISABLED_BG : BRAND_BG, color: TEXT_ON_BRAND, padding: "12px 14px", fontWeight: 700 }}>
            {loading ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
        {message ? <p style={{ margin: "10px 2px 0", color: APP_TEXT_MUTED, fontSize: 13 }}>{message}</p> : null}
      </main>
    </div>
  );
}

