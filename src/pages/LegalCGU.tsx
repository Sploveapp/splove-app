import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "../i18n/useTranslation";

export default function LegalCGU() {
  const navigate = useNavigate();
  const { t, language } = useTranslation();

  const lastUpdated = "07/05/2026";
  const title = language === "fr" ? "Conditions générales d’utilisation (CGU)" : "Terms of Use";

  const sections = useMemo(() => {
    if (language === "fr") {
      return [
        {
          h: "Objet du service SPLove",
          p: [
            "SPLove est une application qui aide des personnes majeures à se rencontrer autour d’activités sportives, via un système de profils, de matchs et de propositions d’activité.",
          ],
        },
        { h: "Conditions d’accès", p: ["SPLove est réservé aux personnes âgées d’au moins 18 ans."] },
        {
          h: "Création de compte",
          p: [
            "Pour utiliser SPLove, l’utilisateur crée un compte et renseigne des informations de profil. L’utilisateur est responsable de la confidentialité de ses accès.",
          ],
        },
        {
          h: "Exactitude des informations",
          p: ["L’utilisateur s’engage à fournir des informations exactes, à jour et non trompeuses."] ,
        },
        {
          h: "Photos et profil réel",
          p: ["Les photos et informations de profil doivent représenter l’utilisateur de manière authentique. Les usurpations d’identité et faux profils sont interdits."],
        },
        {
          h: "Règles de comportement",
          p: [
            "L’utilisateur s’engage à adopter un comportement respectueux et à ne pas perturber l’expérience des autres utilisateurs.",
          ],
        },
        {
          h: "Contenus et comportements interdits",
          p: [
            "Sont interdits : harcèlement, menaces, incitation à la haine, contenus discriminatoires, contenus explicitement sexuels, faux profils, et tout contenu illégal.",
          ],
        },
        {
          h: "Coordonnées externes",
          p: [
            "Si une règle interne de l’application l’exige, l’utilisateur s’engage à ne pas partager de coordonnées externes (numéro de téléphone, réseaux sociaux, email, etc.) avant la rencontre, afin de favoriser la sécurité et la modération.",
          ],
        },
        {
          h: "Fonctionnement des matchs et propositions d’activité",
          p: [
            "SPLove met en relation des profils selon des critères de compatibilité et permet de proposer une activité. Les échanges et propositions dépendent des actions des utilisateurs et de la disponibilité des fonctionnalités.",
          ],
        },
        { h: "Absence de garantie de rencontre", p: ["SPLove ne garantit pas l’obtention de matchs, de réponses, ni la réalisation effective d’une rencontre."] },
        {
          h: "Sécurité lors des rencontres physiques",
          p: [
            "En cas de rencontre physique, l’utilisateur est invité à privilégier un lieu public, informer un proche, et adopter toute mesure de prudence. SPLove ne peut se substituer au jugement et à la vigilance des utilisateurs.",
          ],
        },
        {
          h: "Suspension ou suppression de compte",
          p: [
            "SPLove peut suspendre ou supprimer un compte en cas de non-respect des présentes CGU, de signalements sérieux, ou pour des raisons de sécurité et de conformité.",
          ],
        },
        {
          h: "Propriété intellectuelle",
          p: [
            "Les éléments de l’application (marques, logos, textes, interfaces, code, bases de données) sont protégés. Toute reproduction non autorisée est interdite.",
          ],
        },
        {
          h: "Limitation de responsabilité",
          p: [
            "SPLove met à disposition une plateforme. SPLove ne peut être tenue responsable des interactions entre utilisateurs, ni des dommages résultant d’une utilisation non conforme ou d’un comportement d’un tiers.",
          ],
        },
        { h: "Loi applicable", p: ["Les présentes CGU sont régies par le droit français."] },
        {
          h: "Contact support",
          p: ["Support : à remplacer par l’email officiel SPLove (ex. support@splove.app)."],
        },
      ];
    }

    return [
      {
        h: "Purpose of the SPLove service",
        p: ["SPLove is an app designed to help adults meet through sports activities, via profiles, matches, and activity proposals."],
      },
      { h: "Access conditions", p: ["SPLove is for users aged 18 or older."] },
      { h: "Account creation", p: ["To use SPLove, you create an account and provide profile information. You are responsible for keeping your access credentials secure."] },
      { h: "Accuracy of information", p: ["You agree to provide accurate, up-to-date, and non-misleading information."] },
      { h: "Photos and authentic profile", p: ["Photos and profile content must represent you truthfully. Impersonation and fake profiles are prohibited."] },
      { h: "Behavior rules", p: ["You agree to behave respectfully and not disrupt other users’ experience."] },
      { h: "Prohibited content and conduct", p: ["Harassment, threats, hateful or discriminatory content, explicit sexual content, fake profiles, and any illegal content are prohibited."] },
      { h: "External contact details", p: ["If required by the app’s internal rules, you agree not to share external contact details (phone number, social media, email, etc.) before meeting, to support safety and moderation."] },
      { h: "How matches and activity proposals work", p: ["SPLove connects profiles based on compatibility criteria and lets you propose an activity. Outcomes depend on user actions and feature availability."] },
      { h: "No guarantee of meeting", p: ["SPLove does not guarantee matches, replies, or that a meeting will happen."] },
      { h: "Safety for in-person meetups", p: ["If you meet in person, choose a public place, tell a trusted person, and use common-sense safety precautions. SPLove cannot replace your judgement or vigilance."] },
      { h: "Account suspension or deletion", p: ["SPLove may suspend or delete accounts in case of violations of these Terms, serious reports, or for safety/compliance reasons."] },
      { h: "Intellectual property", p: ["App elements (trademarks, logos, text, UI, code, databases) are protected. Unauthorized reproduction is prohibited."] },
      { h: "Limitation of liability", p: ["SPLove provides a platform and cannot be held liable for user-to-user interactions or damages caused by misuse or third-party behavior."] },
      { h: "Governing law", p: ["These Terms are governed by French law."] },
      { h: "Support contact", p: ["Support: replace with SPLove’s official email (e.g. support@splove.app)."] },
    ];
  }, [language]);

  return (
    <div className="min-h-screen bg-app-bg text-app-text">
      <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-6">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/onboarding"))}
          className="mb-4 inline-flex items-center gap-2 rounded-xl border border-app-border bg-app-bg/60 px-3 py-2 text-sm font-semibold text-app-text hover:bg-app-border"
          aria-label={t("back")}
        >
          ← {t("back")}
        </button>

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

