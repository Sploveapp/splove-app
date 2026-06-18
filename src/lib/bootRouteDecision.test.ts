import { describe, expect, it } from "vitest";
import { resolveBootRoute } from "./bootRouteDecision";

const baseAuth = {
  isAuthInitialized: true,
  isLoading: false,
  isProfileLoading: false,
  profileBootstrapSettled: true,
  session: { user: { id: "u1" } } as never,
  profile: null,
  isProfileComplete: false,
};

describe("resolveBootRoute", () => {
  it("loading tant que session bootstrap", () => {
    expect(
      resolveBootRoute({
        ...baseAuth,
        isAuthInitialized: false,
        isLoading: true,
        session: null,
      }),
    ).toEqual({ status: "loading", reason: "session_bootstrap" });
  });

  it("auth sans session → /auth", () => {
    expect(
      resolveBootRoute({
        ...baseAuth,
        session: null,
      }),
    ).toEqual({ status: "ready", route: "/auth", reason: "no_session" });
  });

  it("session + profil en chargement → splash (pas de flash onboarding)", () => {
    expect(
      resolveBootRoute({
        ...baseAuth,
        isProfileLoading: true,
        profileBootstrapSettled: false,
      }),
    ).toEqual({ status: "loading", reason: "profile_pending" });
  });

  it("session + bootstrap profil non terminé → splash", () => {
    expect(
      resolveBootRoute({
        ...baseAuth,
        profileBootstrapSettled: false,
      }),
    ).toEqual({ status: "loading", reason: "profile_pending" });
  });

  it("session + profil en chargement mais déjà complet → /move", () => {
    expect(
      resolveBootRoute({
        ...baseAuth,
        isProfileLoading: true,
        profile: { id: "u1", profile_completed: true } as never,
        isProfileComplete: true,
      }),
    ).toEqual({ status: "ready", route: "/move", reason: "profile_complete" });
  });

  it("session + profil absent après chargement → /onboarding", () => {
    expect(resolveBootRoute(baseAuth)).toEqual({
      status: "ready",
      route: "/onboarding",
      reason: "profile_missing",
    });
  });

  it("profil incomplet → /onboarding", () => {
    expect(
      resolveBootRoute({
        ...baseAuth,
        profile: { id: "u1", profile_completed: false } as never,
      }),
    ).toEqual({ status: "ready", route: "/onboarding", reason: "profile_incomplete" });
  });

  it("drapeaux null + bootstrap non terminé → splash (pas onboarding)", () => {
    expect(
      resolveBootRoute({
        ...baseAuth,
        profileBootstrapSettled: false,
        profile: {
          id: "u1",
          first_name: "Alex",
          profile_completed: null,
          onboarding_completed: null,
        } as never,
      }),
    ).toEqual({ status: "loading", reason: "profile_flags_pending" });
  });

  it("drapeaux null + bootstrap terminé sans données critiques → splash ambigu", () => {
    expect(
      resolveBootRoute({
        ...baseAuth,
        profile: {
          id: "u1",
          first_name: "Alex",
          birth_date: "2000-01-01",
          gender: "homme",
          looking_for: "femme",
          city: "Paris",
          latitude: 48.85,
          longitude: 2.35,
          discovery_radius_km: 50,
          portrait_url: "https://x/p.jpg",
          fullbody_url: "https://x/f.jpg",
          onboarding_sports_count: 2,
          profile_completed: null,
          onboarding_completed: null,
        } as never,
      }),
    ).toEqual({ status: "loading", reason: "profile_flags_ambiguous" });
  });

  it("profil complet → /move", () => {
    expect(
      resolveBootRoute({
        ...baseAuth,
        profile: { id: "u1", profile_completed: true } as never,
        isProfileComplete: true,
      }),
    ).toEqual({ status: "ready", route: "/move", reason: "profile_complete" });
  });
});
