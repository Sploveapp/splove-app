import { useTranslation } from "../i18n/useTranslation";

export default function LanguageSwitcher() {
  const { language, setLanguage } = useTranslation();

  return (
    <div
      style={{
        display: "flex",
        gap: "8px",
        alignItems: "center",
      }}
    >
      <button
        onClick={() => setLanguage("fr")}
        style={{
          padding: "6px 10px",
          borderRadius: "8px",
          border: language === "fr" ? "2px solid #FF3B3B" : "1px solid #ccc",
          background: language === "fr" ? "#FF3B3B" : "transparent",
          color: language === "fr" ? "white" : "#333",
          cursor: "pointer",
        }}
      >
        🇫🇷 FR
      </button>

      <button
        onClick={() => setLanguage("en")}
        style={{
          padding: "6px 10px",
          borderRadius: "8px",
          border: language === "en" ? "2px solid #FF3B3B" : "1px solid #ccc",
          background: language === "en" ? "#FF3B3B" : "transparent",
          color: language === "en" ? "white" : "#333",
          cursor: "pointer",
        }}
      >
        🇬🇧 EN
      </button>
    </div>
  );
}
