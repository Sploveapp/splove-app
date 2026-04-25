import { useCallback, useEffect, useState } from "react";
import { getLanguage, setLanguage as persistLanguage, translate, type Language } from "./index";

export function useTranslation() {
  const [language, setLanguageState] = useState<Language>(() => getLanguage());

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "splove_language") {
        setLanguageState(getLanguage());
      }
    };
    const handleLanguageChanged = () => setLanguageState(getLanguage());
    window.addEventListener("storage", handleStorage);
    window.addEventListener("splove-language-changed", handleLanguageChanged as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("splove-language-changed", handleLanguageChanged as EventListener);
    };
  }, []);

  const setLanguage = useCallback((nextLanguage: Language) => {
    persistLanguage(nextLanguage);
    setLanguageState(nextLanguage);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      return translate(language, key, vars);
    },
    [language],
  );

  return { t, language, setLanguage };
}
