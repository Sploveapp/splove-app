import en from "./en";
import fr from "./fr";

export type TranslationKey = keyof typeof fr;
export type Language = "fr" | "en";

export const LANGUAGE_STORAGE_KEY = "splove_language";
export const DEFAULT_LANGUAGE: Language = "fr";
export const translations: Record<Language, Record<TranslationKey, string>> = {
  fr,
  en: en as Record<TranslationKey, string>,
};

function isLanguage(value: unknown): value is Language {
  return value === "fr" || value === "en";
}

export function getLanguage(): Language {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return isLanguage(saved) ? saved : DEFAULT_LANGUAGE;
}

export function setLanguage(language: Language): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  window.dispatchEvent(new CustomEvent("splove-language-changed", { detail: language }));
}

export function translate(
  language: Language,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const enValue = translations[language]?.[key as TranslationKey];
  let s: string;
  if (typeof enValue === "string") s = enValue;
  else {
    const fallbackValue = translations.fr[key as TranslationKey];
    if (typeof fallbackValue === "string") s = fallbackValue;
    else {
      console.warn(`[i18n] Missing translation key: ${key}`);
      s = key;
    }
  }
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{{${k}}}`).join(String(v));
    }
  }
  return s;
}
