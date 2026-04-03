/**
 * Utilitaires SPLove
 */

import {
  PHOTO_VERIFICATION_PLACEHOLDER,
  PHOTO_VALIDATION_CRITERIA,
} from "../constants";

/** Résultat de la validation d'une photo de profil */
export type PhotoValidationResult = {
  valid: boolean;
  reason?: string;
  /** Présence d'un visage détecté (future intégration) */
  faceDetected?: boolean;
  /** Présence d'un corps détecté (future intégration) */
  bodyDetected?: boolean;
};

/**
 * Valide une photo de profil SPLove (anti-fake).
 *
 * Règles produit :
 * - La photo doit montrer une vraie personne
 * - Interdit : paysages, objets, nourriture, jambes seules, silhouettes floues, photos vides
 * - Minimum : présence d'un visage
 * - Idéal : visage + corps
 *
 * Placeholder : à brancher sur face detection (ex: Face-API.js, AWS Rekognition)
 * ou API de modération (ex: Sightengine, Google Cloud Vision).
 */
export async function validatePhotoForProfile(
  _file: File | string
): Promise<PhotoValidationResult> {
  if (PHOTO_VERIFICATION_PLACEHOLDER) {
    return {
      valid: true,
      faceDetected: true,
      bodyDetected: true,
    };
  }

  // TODO: intégrer face detection ou moderation API
  // Exemple de structure attendue :
  // const analysis = await faceDetectionApi.analyze(file);
  // if (!analysis.faces?.length) return { valid: false, reason: "Aucun visage détecté" };
  // const hasBody = await bodyDetectionApi.analyze(file);
  // return { valid: true, faceDetected: true, bodyDetected: hasBody };

  if (!PHOTO_VALIDATION_CRITERIA.FACE_REQUIRED) {
    return { valid: false, reason: "Vérification non configurée" };
  }

  return {
    valid: false,
    reason: "Vérification photo non disponible",
    faceDetected: false,
    bodyDetected: false,
  };
}
