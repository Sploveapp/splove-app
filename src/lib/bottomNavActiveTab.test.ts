import { describe, expect, it } from "vitest";
import {
  isNativeBottomNavVisibleRoute,
  matchActiveMove,
  matchActiveProfile,
  matchActiveMessages,
  resolveBottomNavActiveTab,
} from "./bottomNavActiveTab";

describe("resolveBottomNavActiveTab", () => {
  it("pathname /move => Move actif, Profil inactif", () => {
    expect(resolveBottomNavActiveTab("/move")).toBe("move");
    expect(matchActiveMove("/move")).toBe(true);
    expect(matchActiveProfile("/move")).toBe(false);
  });

  it("pathname /profile => Profil actif, Move inactif", () => {
    expect(resolveBottomNavActiveTab("/profile")).toBe("profile");
    expect(matchActiveProfile("/profile")).toBe(true);
    expect(matchActiveMove("/profile")).toBe(false);
  });

  it("navigation /profile vers /move => mise à jour immédiate (dérivé du pathname seul)", () => {
    let path = "/profile";
    expect(resolveBottomNavActiveTab(path)).toBe("profile");
    expect(matchActiveMove(path)).toBe(false);
    expect(matchActiveProfile(path)).toBe(true);

    path = "/move";
    expect(resolveBottomNavActiveTab(path)).toBe("move");
    expect(matchActiveMove(path)).toBe(true);
    expect(matchActiveProfile(path)).toBe(false);
  });

  it("active /move/*, /discover et /profil", () => {
    expect(resolveBottomNavActiveTab("/move/extra")).toBe("move");
    expect(resolveBottomNavActiveTab("/discover")).toBe("move");
    expect(resolveBottomNavActiveTab("/profil")).toBe("profile");
    expect(resolveBottomNavActiveTab("/profile/edit")).toBe("profile");
  });

  it("conversation /chat/:id => Messages actif", () => {
    expect(resolveBottomNavActiveTab("/chat/abc-123")).toBe("messages");
    expect(matchActiveMessages("/chat/abc-123")).toBe(true);
    expect(matchActiveMove("/chat/abc-123")).toBe(false);
  });

  it("barre native visible sur Messages et conversations ouvertes", () => {
    expect(isNativeBottomNavVisibleRoute("/messages")).toBe(true);
    expect(isNativeBottomNavVisibleRoute("/chat/conv-1")).toBe(true);
    expect(isNativeBottomNavVisibleRoute("/onboarding")).toBe(false);
    expect(isNativeBottomNavVisibleRoute("/auth")).toBe(false);
  });
});
