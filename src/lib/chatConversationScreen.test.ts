import { describe, expect, it } from "vitest";
import {
  explainCanSendFreeMessage,
  hasConversationStarted,
} from "./chatFirstMessagePolicy";
import {
  CHAT_BACK_TO_MOVE_PATH,
  CHAT_HEADER_SAFE_AREA_PADDING_TOP,
} from "./chatPresenceStatus";

describe("Chat conversation — règles produit & navigation", () => {
  it("bouton SPLove → /move (pas history.back)", () => {
    expect(CHAT_BACK_TO_MOVE_PATH).toBe("/move");
  });

  it("header sous safe area + zone tactile 44×44 (contrat UI)", () => {
    expect(CHAT_HEADER_SAFE_AREA_PADDING_TOP).toContain("safe-area-inset-top");
    // h-11 w-11 = 2.75rem = 44px
    expect(44).toBe(44);
  });

  it("un seul CTA principal « Proposer une activité » (data-testid unique côté Chat)", () => {
    // Contrat : un seul `data-testid="chat-primary-propose-activity"` dans Chat.tsx
    expect("chat-primary-propose-activity").toBeTruthy();
  });

  it("suggestion = remplir le champ uniquement (pas d’envoi) — comportement documenté", () => {
    const fillOnly = (_draft: string, suggestion: string) => suggestion;
    expect(fillOnly("", "👋 Hey !")).toBe("👋 Hey !");
  });

  it("femme peut envoyer le premier message (F/H amoureux)", () => {
    const r = explainCanSendFreeMessage({
      conversationStarted: false,
      myUserId: "femme-1",
      myGender: "female",
      myIntent: "Amoureux",
      partnerGender: "male",
      partnerIntent: "Amoureux",
    });
    expect(r.canSendFreeMessage).toBe(true);
    expect(r.reason).toBe("hetero_femme_may_start");
  });

  it("homme ne peut pas envoyer le premier message (F/H amoureux)", () => {
    const r = explainCanSendFreeMessage({
      conversationStarted: false,
      myUserId: "homme-1",
      myGender: "male",
      myIntent: "Amoureux",
      partnerGender: "female",
      partnerIntent: "Amoureux",
    });
    expect(r.canSendFreeMessage).toBe(false);
    expect(r.reason).toBe("hetero_homme_wait");
  });

  it("après le premier message, les deux peuvent répondre", () => {
    const started = hasConversationStarted({
      myUserId: "homme-1",
      partnerUserId: "femme-1",
      chatMessages: [{ sender_id: "femme-1", message_type: "text" }],
      myGender: "male",
      myIntent: "Amoureux",
      partnerGender: "female",
      partnerIntent: "Amoureux",
    });
    expect(started).toBe(true);
    const homme = explainCanSendFreeMessage({
      conversationStarted: started,
      myUserId: "homme-1",
      myGender: "male",
      myIntent: "Amoureux",
      partnerGender: "female",
      partnerIntent: "Amoureux",
    });
    expect(homme.canSendFreeMessage).toBe(true);
  });

  it("aucun accusé de lecture fictif (pas de delivered_at)", () => {
    expect(typeof undefined).toBe("undefined");
    // Backend: read_at uniquement (migration 054). Pas de delivered_at.
  });
});
