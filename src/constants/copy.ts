/**
 * Textes UI SPLove+ — UX writing centralisé
 * Ton : premium, chaleureux, direct, élégant. Fil rouge : Trouver l'amour par le sport.
 */

// ——— 1. Page SPLove+ ———
export const PAGE_PLUS_TITLE = "SPLove+";
export const PAGE_PLUS_SUBTITLE = "Mettez le sport au service de vos rencontres.";
export const PAGE_PLUS_TEASER =
  "Voir qui vous a liké, affiner vos critères et passer plus vite à la sortie sport.";

// ——— 2. Paywall principal ———
export const PAYWALL_TITLE = "Rencontrer vraiment, pas juste matcher";
export const PAYWALL_SUBTITLE =
  "SPLove+ vous aide à passer plus vite du match à la rencontre sportive réelle.";
export const PAYWALL_BULLETS = [
  "Booster votre présence localement au bon moment.",
  "Mettre vos propositions d’activité en avant dans le chat.",
  "Prolonger de 24h la fenêtre pour concrétiser une sortie.",
];
export const PAYWALL_PRICE_LABEL = "Annulable à tout moment";
export const PAYWALL_CTA_PRIMARY = "Passer à SPLove+";
export const PAYWALL_CTA_SECONDARY = "Plus tard";
export const PAYWALL_LEGAL =
  "En passant à SPLove+, vous acceptez nos Conditions d'utilisation et notre Politique de confidentialité. L'abonnement se renouvelle automatiquement sauf annulation.";

// ——— 3. Paywall contextuel ———
export const PAYWALL_CONTEXT = {
  likes_you: {
    title: "Voir qui vous a liké. Rencontrer pour de bon.",
    subtitle: "Voyez qui vous a liké et augmentez vos chances de vraie rencontre.",
  },
  filters: {
    title: "Affinez vos critères avec SPLove+",
    subtitle: "Filtrez par sport, moment et intention pour des matchs plus pertinents.",
  },
  passport: {
    title: "Découvrez une autre ville avec SPLove+",
    subtitle: "Indiquez une ville et découvrez des profils sur place (week-end, voyage).",
  },
  agenda: {
    title: "Vos créneaux sport avec SPLove+",
    subtitle: "Indiquez quand vous pratiquez ; voyez les compatibilités avec vos matchs.",
  },
  radar: {
    title: "Qui est dispo maintenant ? — SPLove+",
    subtitle: "Voyez qui souhaite faire une activité dans les prochaines heures.",
  },
  badge: {
    title: "Badge SPLove+",
    subtitle: "Mettez en avant votre profil et montrez que vous misez sur la rencontre.",
  },
  boost: {
    title: "Booster ma présence",
    subtitle: "Soyez visible en priorité autour de vos sports pendant une durée courte.",
  },
} as const;

// ——— 4. Likes You ———
export const LIKES_YOU_TITLE = "Qui m'a liké";
export const LIKES_YOU_LOADING = "Chargement…";
export const LIKES_YOU_EMPTY =
  "Personne ne vous a liké pour le moment. Continuez à découvrir des profils.";
export const LIKES_YOU_BLUR_MESSAGE = "Débloquez avec SPLove+ pour voir ce profil.";
export const LIKES_YOU_BLUR_CTA = "Voir qui m'a liké";
export const LIKES_YOU_PASS = "Pass";
export const LIKES_YOU_LIKE = "Like";

// ——— 5. Filtres avancés ———
export const FILTERS_TITLE = "Filtres";
export const FILTERS_SPORT = "Sport";
export const FILTERS_SPORT_PLACEHOLDER = "Choisir un sport";
export const FILTERS_DISTANCE = "Distance";
export const FILTERS_DISTANCE_PLACEHOLDER = "Autour de moi";
export const FILTERS_INTENT = "Type de rencontre";
export const FILTERS_INTENT_OPTIONS = "Amicale · Amoureuse";
export const FILTERS_MOMENT = "Ils pratiquent plutôt…";
export const FILTERS_MOMENT_OPTIONS = "Matin · Midi · Soir · Week-end";
export const FILTERS_RECENT = "Profils actifs récemment";
export const FILTERS_APPLY = "Appliquer";
export const FILTERS_RESET = "Réinitialiser";
export const FILTERS_UPSELL =
  "Les filtres avancés sont réservés à SPLove+. Débloquez pour affiner vos critères.";

// ——— 6. Passeport sportif ———
export const PASSPORT_TITLE = "Passeport sportif";
export const PASSPORT_SUBTITLE = "Découvrez des profils dans une autre ville.";
export const PASSPORT_DESCRIPTION =
  "Idéal pour un week-end, un déplacement ou un voyage : indiquez une ville et voyez les profils sur place.";
export const PASSPORT_LABEL = "Ville de découverte";
export const PASSPORT_PLACEHOLDER = "Ex. Lyon, Bordeaux";
export const PASSPORT_SAVE = "Enregistrer";
export const PASSPORT_REMOVE = "Retirer cette ville";
export const PASSPORT_UPSELL = "Le passeport sportif est inclus dans SPLove+.";

// ——— 7. Agenda sportif ———
export const AGENDA_TITLE = "Mon agenda sportif";
export const AGENDA_SUBTITLE = "Indiquez vos créneaux habituels.";
export const AGENDA_DESCRIPTION =
  "Nous afficherons les créneaux compatibles avec vos matchs pour proposer une sortie plus facilement.";
export const AGENDA_DAY = "Jour";
export const AGENDA_SLOT = "Créneau";
export const AGENDA_EXAMPLE = "Ex. Mardi 18h, Dimanche matin";
export const AGENDA_ADD = "Ajouter un créneau";
export const AGENDA_SAVE = "Sauvegarder";
export const AGENDA_EMPTY = "Aucun créneau pour le moment. Ajoutez vos habitudes.";
export const AGENDA_UPSELL = "L'agenda sportif est inclus dans SPLove+.";

// ——— 8. Radar disponibles ———
export const RADAR_TITLE = "Disponibles maintenant";
export const RADAR_SUBTITLE = "Proposez une sortie dans les prochaines heures.";
export const RADAR_DESCRIPTION =
  "Ces personnes ont indiqué vouloir faire une activité bientôt. Idéal pour une session spontanée.";
export const RADAR_ME_AVAILABLE = "Je suis dispo dans les 2h";
export const RADAR_ME_NOT_AVAILABLE = "Je ne suis plus dispo";
export const RADAR_EMPTY =
  "Personne de dispo pour le moment. Revenez plus tard ou proposez à un match.";
export const RADAR_UPSELL = "Le radar « disponibles maintenant » est inclus dans SPLove+.";

// ——— 9. Badge SPLove+ ———
export const BADGE_PLUS_LABEL = "SPLove+";
export const BADGE_PLUS_TOOLTIP = "Membre SPLove+ — plus de chances de vraie rencontre.";

// ——— 10. Boost ———
export const BOOST_TITLE = "Boost";
export const BOOST_SUBTITLE = "Apparaissez en priorité pendant 30 minutes.";
export const BOOST_DESCRIPTION =
  "Votre profil sera mis en avant auprès des personnes qui partagent vos sports. Une fois par jour recommandé.";
export const BOOST_DURATION_LABEL = "30 min";
export const BOOST_CTA_ONE = "Booster (1)";
export const BOOST_CTA_PACK = "Pack 3 boosts";
export const BOOST_ACTIVE = "Votre profil est en boost pendant X min.";
export const BOOST_UPSELL = "Le boost est un achat séparé. Disponible à tous.";

// ——— 11. Confirmations ———
export const CONFIRM_SUBSCRIPTION = "Bienvenue dans SPLove+. Bonnes rencontres.";
export const CONFIRM_BOOST = "Votre profil est en avant. Bonne chance.";
export const CONFIRM_PASSPORT = "Ville enregistrée. Vous verrez les profils sur place.";
export const CONFIRM_AGENDA = "Créneaux enregistrés. Nous afficherons les compatibilités.";
export const CONFIRM_RADAR = "Vous apparaissez dans le radar. Les autres pourront vous proposer une sortie.";

// ——— 12. États vides ———
export const EMPTY_NO_LIKES =
  "Pas encore de like. Continuez: la bonne rencontre sportive arrive.";
export const EMPTY_NO_MATCHES = "Pas encore de match. Le prochain peut mener à une vraie sortie.";
export const EMPTY_NO_FILTERS = "Aucun filtre. Tous les profils compatibles s'affichent.";
export const EMPTY_NO_PROFILES = "Aucun nouveau profil pour le moment. Revenez dans quelques heures.";

// ——— Accessibilité / activités adaptées (ton sobre, non médical) ———
/** Texte d’introduction — onboarding & profil. */
export const ACCESSIBILITY_SECTION_INTRO =
  "Pour te proposer des profils alignés avec toi — tu peux changer ça quand tu veux.";
export const ACCESSIBILITY_SELF_LABEL =
  "Je bouge plutôt avec des activités adaptées à ma mobilité";
export const ACCESSIBILITY_PREF_STANDARD_LABEL = "Rencontrer des profils « classiques »";
export const ACCESSIBILITY_PREF_ADAPTED_LABEL =
  "Rencontrer des profils ouverts aux activités adaptées";
export const ACCESSIBILITY_PREF_BOTH_REQUIRED =
  "Choisis au moins une des deux options ci-dessous.";

// ——— Safety (message filter + reports) ———
/** Message unique pour refus modération (chat, bio, propositions). */
export const SAFETY_CONTENT_REFUSAL =
  "Pour votre sécurité, les échanges restent sur SPLove jusqu'à la rencontre.";
/** @deprecated Utiliser SAFETY_CONTENT_REFUSAL */
export const SAFETY_MESSAGE_BLOCKED = SAFETY_CONTENT_REFUSAL;
/** Chat — couple F/H amoureux : l’homme ne peut pas envoyer le premier message texte (activité OK). */
export const CHAT_FIRST_MESSAGE_HINT_HOMME =
  "Ici, le premier message écrit revient à votre correspondante. Vous pouvez lui proposer un créneau d’activité ci-dessous.";
export const REPORT_TITLE = "Signaler ce profil";
export const REPORT_REASON_LABEL = "Motif du signalement";
export const REPORT_SUBMIT = "Envoyer le signalement";
export const REPORT_CONFIRM = "Merci. Votre signalement a bien été enregistré.";
export const REPORT_CANCEL = "Annuler";
export const REPORT_LINK_LABEL = "Signaler ce profil";

/** @deprecated Préférer les listes actionnables sur Mon profil */
export const PROFILE_SAFETY_HINT =
  "Depuis un profil ou un chat : menu ⋯ pour signaler ou ne plus voir quelqu’un.";

// ——— Vérification identité / photos (Veriff) ———
export const VERIFY_BADGE_LABEL = "Profil vérifié";
/** Texte sous le badge sur la fiche « Mon profil » */
export const VERIFY_OWN_VERIFIED =
  "Ton profil est vérifié — les autres voient que c’est bien toi.";
export const VERIFY_OWN_PENDING =
  "Vérification en cours — le badge s’affiche dès que c’est bon.";
export const VERIFY_OWN_NOT_VERIFIED =
  "Photos nettes, visage visible, silhouette en pied — on valide et tu es prêt·e.";
/** @deprecated Ancien libellé — préférer VERIFY_OWN_NOT_VERIFIED */
export const VERIFY_COMING_SOON = VERIFY_OWN_NOT_VERIFIED;

// ——— 13. Erreurs ———
export const ERROR_GENERIC = "Une erreur s'est produite. Réessayez.";
export const ERROR_NETWORK = "Vérifiez votre connexion et réessayez.";
export const ERROR_LIKE = "Le like n'a pas pu être enregistré. Réessayez.";
export const ERROR_LIKE_TARGET = "Impossible d'aimer ce profil.";
export const ERROR_LIKE_ACTION = "Action impossible pour le moment";
export const ONBOARDING_AVATAR_REQUIRED =
  "Ajoutez une photo pour continuer.";
export const ONBOARDING_FULLBODY_REQUIRED =
  "Ajoutez une photo en pied pour continuer.";

/** Onboarding — engagement conformité (remplace une simple case « c’est moi »). */
export const ONBOARDING_PHOTO_COMPLIANCE_LABEL =
  "Je confirme que ces photos me représentent, respectent les consignes ci-dessus (visage clair, silhouette visible, pas d’objets ni paysages, pas de logos ni captures d’écran) et sont des photos personnelles.";

/** Discover — validation photos en cours ou refusée */
export const PHOTO_VERIFY_GATE_PENDING_TITLE = "Tes photos sont en cours de validation";
export const PHOTO_VERIFY_GATE_PENDING_BODY =
  "Nous vérifions ta photo portrait et ta photo silhouette. Tu recevras l’accès à la découverte dès qu’elles seront validées.";
export const PHOTO_VERIFY_GATE_REJECTED_TITLE = "Tes photos n’ont pas pu être validées";
export const PHOTO_VERIFY_GATE_REJECTED_BODY =
  "Merci d’envoyer de nouvelles photos conformes aux consignes. Tu peux rafraîchir cette page après mise à jour de ton profil.";
export const PHOTO_VERIFY_GATE_REFRESH = "Rafraîchir";
export const PHOTO_VERIFY_GATE_REJECTED_FALLBACK =
  "Une ou plusieurs photos ne correspondent pas aux règles de la communauté. Merci d’en proposer de nouvelles.";

export const ERROR_LOAD_PROFILES = "Impossible de charger les profils. Réessayez.";
export const ERROR_PAYMENT = "Le paiement n'a pas abouti. Vérifiez vos informations.";

// ——— 14. Boutons ———
export const BTN_PASS = "Pass";
export const BTN_LIKE = "Like";
export const BTN_PROPOSE_ACTIVITY = "Proposer une activité";
export const BTN_CHAT = "Discuter";
export const BTN_CONTINUE_DISCOVER = "Continuer à découvrir";
export const BTN_APPLY = "Appliquer";
export const BTN_SAVE = "Sauvegarder";
export const BTN_CANCEL = "Annuler";
export const BTN_CLOSE = "Fermer";
export const BTN_LATER = "Plus tard";
export const BTN_STAY_FREE = "Rester en gratuit";

/** Confirmation silencieuse (pas de mention « bloqué » à l’autre personne). */
export const BLOCK_PROFILE_CONFIRM =
  "Cette personne ne vous sera plus proposée et vous ne pourrez plus échanger. Continuer ?";
export const BLOCK_PROFILE_LINK_LABEL = "Ne plus voir ce profil";

// ——— 16. Upsell in-app (courtes) ———
export const UPSELL_LIKES_YOU = "Débloquez avec SPLove+ pour voir qui vous a liké.";
export const UPSELL_FILTERS = "Affinez avec SPLove+ : sport, moment, intention.";
export const UPSELL_PASSPORT = "Découvrez une autre ville avec le passeport sportif (SPLove+).";
export const UPSELL_AGENDA = "Indiquez vos créneaux et voyez les compatibilités (SPLove+).";
export const UPSELL_RADAR = "Voyez qui est dispo maintenant avec SPLove+.";
export const UPSELL_BADGE = "Montrez que vous misez sur la rencontre avec le badge SPLove+.";
export const UPSELL_AFTER_MATCH =
  "Proposez une sortie — SPLove+ peut suggérer des créneaux compatibles.";
