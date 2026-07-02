import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { photoFlowFieldsFromRow, PhotoFlowLog } from "./photoFlowLog";

describe("photoFlowLog", () => {
  let logs: unknown[][];

  beforeEach(() => {
    logs = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("photoFlowFieldsFromRow extrait les 8 champs photo", () => {
    const fields = photoFlowFieldsFromRow({
      portrait_url: "https://x.co/p.jpg",
      photo2_path: "https://x.co/b.jpg",
    });
    expect(fields.portrait_url).toContain("p.jpg");
    expect(fields.photo2_path).toContain("b.jpg");
    expect(fields.fullbody_url).toBeNull();
  });

  it("émet uniquement des logs préfixés [PhotoFlow]", () => {
    PhotoFlowLog.onboardingUploadStart({
      userId: "user-1",
      slot: "portrait",
      objectPath: "user-1/portrait_1.jpg",
    });
    expect(logs.length).toBeGreaterThan(0);
    expect(String(logs[0]?.[0])).toBe("[PhotoFlow] upload_started");
  });

  it("profile_save_payload inclut photoFields", () => {
    PhotoFlowLog.profileSavePayload({
      userId: "user-1",
      source: "test",
      payload: {
        portrait_url: "https://x.co/p.jpg",
        photo2_path: "https://x.co/b.jpg",
      },
    });
    const payload = logs[0]?.[1] as { photoFields?: { portrait_url?: string } };
    expect(payload.photoFields?.portrait_url).toContain("p.jpg");
  });
});
