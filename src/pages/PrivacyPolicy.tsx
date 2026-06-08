import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "../i18n/useTranslation";

export default function PrivacyPolicy() {
  const navigate = useNavigate();
  const { t, language } = useTranslation();

  const lastUpdated = "07/05/2026";
  const title = language === "fr" ? "Politique de confidentialité" : "Privacy Policy";

  const sections = useMemo(() => {
    if (language === "fr") {
      return [
        {
          h: "Données collectées",
          p: [
            "SPLove peut collecter des données liées au compte (email/identifiants), au profil (prénom, âge, description), aux photos, aux sports, aux préférences, aux messages, à la géolocalisation si elle est activée, ainsi que des données techniques (appareil, journaux, diagnostics).",
          ],
        },
        {
          h: "Finalités",
          p: [
            "Les données sont utilisées pour : créer et gérer le compte, proposer du matching, faciliter les échanges et les propositions d’activité, assurer la sécurité et la modération, améliorer le service, et répondre au support.",
          ],
        },
        {
          h: "Base légale",
          p: [
            "Selon les cas, les traitements reposent sur : le consentement (ex. géolocalisation si activée), l’exécution du service (création et gestion du compte), et l’intérêt légitime (sécurité, lutte contre les abus, amélioration du service).",
          ],
        },
        {
          h: "Données sensibles",
          p: [
            "Certaines informations peuvent révéler indirectement des préférences personnelles (ex. habitudes, centres d’intérêt sportifs, localisation approximative). Elles ne doivent être utilisées que pour le fonctionnement du service, la sécurité et la modération.",
          ],
        },
        {
          h: "Hébergement et prestataires techniques",
          p: [
            "SPLove s’appuie sur des prestataires techniques pour héberger et traiter certaines données, notamment Supabase. Des services de vérification ou d’hébergement complémentaires peuvent être utilisés si activés.",
          ],
        },
        {
          h: "Données non vendues",
          p: ["SPLove ne vend pas les données personnelles de ses utilisateurs."],
        },
        {
          h: "Durée de conservation",
          p: [
            "Les données sont conservées pendant la durée nécessaire aux finalités décrites, puis supprimées ou anonymisées, sous réserve des obligations légales et de sécurité.",
          ],
        },
        {
          h: "Droits RGPD",
          p: [
            "Conformément au RGPD, vous disposez de droits : accès, rectification, suppression, limitation, opposition, et portabilité, lorsque applicable.",
          ],
        },
        {
          h: "Suppression du compte",
          p: [
            "Vous pouvez demander la suppression du compte depuis l’application (si disponible) ou via le support. Certaines données peuvent être conservées temporairement pour des raisons légales ou de sécurité.",
          ],
        },
        {
          h: "Sécurité des données",
          p: [
            "SPLove met en œuvre des mesures techniques et organisationnelles raisonnables pour protéger les données (contrôles d’accès, chiffrement lorsque pertinent, surveillance des abus).",
          ],
        },
        {
          h: "Contact privacy",
          p: ["Privacy : à remplacer par l’email officiel SPLove (ex. privacy@splove.app)."],
        },
      ];
    }

    return [
      {
        h: "Data we collect",
        p: [
          "SPLove may collect account data (email/identifiers), profile data (name, age, bio), photos, sports, preferences, messages, geolocation if enabled, and technical data (device, logs, diagnostics).",
        ],
      },
      {
        h: "Purposes",
        p: [
          "We use data to create and manage your account, provide matching, enable messaging and activity proposals, ensure safety and moderation, improve the service, and handle support.",
        ],
      },
      {
        h: "Legal bases",
        p: [
          "Depending on the context, processing is based on: consent (e.g., geolocation if enabled), performance of the service (account creation and management), and legitimate interest (safety, abuse prevention, service improvement).",
        ],
      },
      {
        h: "Sensitive data",
        p: [
          "Some information may indirectly reveal personal preferences (e.g., habits, sports interests, approximate location). It should only be used for providing the service, safety, and moderation.",
        ],
      },
      {
        h: "Hosting and technical providers",
        p: [
          "SPLove relies on technical providers to host and process some data, including Supabase. Additional verification or hosting services may be used when enabled.",
        ],
      },
      {
        h: "We do not sell data",
        p: ["SPLove does not sell its users’ personal data."],
      },
      {
        h: "Retention",
        p: [
          "We keep data for as long as needed for the purposes described, then delete or anonymize it, subject to legal and security obligations.",
        ],
      },
      {
        h: "Your GDPR rights",
        p: [
          "Under GDPR, you have rights including access, rectification, deletion, restriction, objection, and portability where applicable.",
        ],
      },
      {
        h: "Account deletion",
        p: [
          "You can request account deletion from the app (when available) or via support. Some data may be retained temporarily for legal or safety reasons.",
        ],
      },
      {
        h: "Data security",
        p: [
          "SPLove uses reasonable technical and organizational measures to protect data (access controls, encryption when relevant, abuse monitoring).",
        ],
      },
      {
        h: "Privacy contact",
        p: ["Privacy: replace with SPLove’s official email (e.g. privacy@splove.app)."],
      },
    ];
  }, [language]);

  return (
    <div className="min-h-screen bg-app-bg text-app-text">
      <header
        className="sticky top-0 z-20 border-b border-app-border/30 bg-app-bg/95 backdrop-blur-md"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        <div className="mx-auto w-full max-w-3xl px-4 pb-3">
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/onboarding"))}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-app-border bg-app-bg/60 px-3 py-2 text-sm font-semibold text-app-text hover:bg-app-border"
            aria-label={t("back")}
          >
            ← {t("back")}
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-4">
        <div className="rounded-2xl border border-app-border bg-app-card/70 p-4 sm:p-6">
          <div className="space-y-1">
            <h1 className="text-lg font-bold">{title}</h1>
            <p className="text-xs text-app-muted">
              {language === "fr" ? "Dernière mise à jour" : "Last updated"} : {lastUpdated}
            </p>
            <p className="text-xs text-app-muted">
              {language === "fr"
                ? "Document à faire relire par un professionnel du droit avant publication officielle."
                : "Internal note: this document must be reviewed by a legal professional before official publication."}
            </p>
          </div>

          <div className="mt-4 max-h-[70vh] space-y-5 overflow-auto pr-1">
            {sections.map((s) => (
              <section key={s.h} className="space-y-2">
                <h2 className="text-sm font-semibold">{s.h}</h2>
                <div className="space-y-2 text-sm leading-relaxed text-app-text/90">
                  {s.p.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

