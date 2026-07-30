import { describe, expect, it } from "vitest";
import {
  CHAT_COMMERCE_BLOCK_MESSAGE,
  CHAT_CONTACT_BLOCK_MESSAGE,
  isChatCommercialSolicitationBlocked,
  isChatContactSharingBlocked,
  moderateChatComposerText,
} from "./chatComposerModeration";

describe("chatComposerModeration — contact", () => {
  it("bloque un numéro de téléphone", () => {
    expect(isChatContactSharingBlocked("appelle-moi au 06 12 34 56 78")).toBe(true);
    const phone = moderateChatComposerText("06.12.34.56.78");
    expect(phone.blocked).toBe(true);
    if (phone.blocked) expect(phone.kind).toBe("contact");
  });

  it("bloque une adresse e-mail", () => {
    expect(isChatContactSharingBlocked("écris-moi @gmail.com non monmail@gmail.com")).toBe(true);
    const mail = moderateChatComposerText("contacte moi@hotmail.com");
    expect(mail.blocked).toBe(true);
    if (mail.blocked) expect(mail.message).toBe(CHAT_CONTACT_BLOCK_MESSAGE);
  });

  it("bloque un lien", () => {
    expect(isChatContactSharingBlocked("regarde https://exemple.com")).toBe(true);
    expect(isChatContactSharingBlocked("www.site.fr")).toBe(true);
  });

  it("bloque Instagram / Snapchat et variantes", () => {
    expect(isChatContactSharingBlocked("mon Instagram c’est jane")).toBe(true);
    expect(isChatContactSharingBlocked("ajoute mon Snap")).toBe(true);
    expect(isChatContactSharingBlocked("i n s t a")).toBe(true);
    expect(isChatContactSharingBlocked("s n a p")).toBe(true);
  });

  it("laisse un message sportif normal", () => {
    expect(moderateChatComposerText("On se fait un footing samedi matin ?")).toEqual({
      blocked: false,
    });
  });

  it("ne bloque pas le partage du prix du terrain", () => {
    expect(isChatCommercialSolicitationBlocked("On partage le prix du terrain de tennis ?")).toBe(
      false,
    );
    expect(moderateChatComposerText("On partage le prix du terrain de tennis ?")).toEqual({
      blocked: false,
    });
  });

  it("conserve le texte après un blocage (API ne mute pas l’entrée)", () => {
    const draft = "voici mon insta : jane_doe";
    const result = moderateChatComposerText(draft);
    expect(result.blocked).toBe(true);
    expect(draft).toBe("voici mon insta : jane_doe");
  });
});

describe("chatComposerModeration — commerce", () => {
  it("bloque une combinaison prostitution + paiement", () => {
    expect(isChatCommercialSolicitationBlocked("escort tarif 150 cash")).toBe(true);
    const blocked = moderateChatComposerText("massage privé paypal virement");
    expect(blocked.blocked).toBe(true);
    if (blocked.blocked) expect(blocked.message).toBe(CHAT_COMMERCE_BLOCK_MESSAGE);
  });

  it("ne bloque pas un mot ambigu isolé", () => {
    expect(isChatCommercialSolicitationBlocked("Quel est le prix ?")).toBe(false);
    expect(isChatCommercialSolicitationBlocked("paiement sur place ok ?")).toBe(false);
    expect(isChatCommercialSolicitationBlocked("On réserve le terrain")).toBe(false);
  });
});
