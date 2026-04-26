import { describe, expect, it } from "vitest";
import { antiExitValidator } from "./antiExitValidator";

const blocked = (text: string) => expect(antiExitValidator(text).isBlocked).toBe(true);
const allowed = (text: string) => expect(antiExitValidator(text).isBlocked).toBe(false);

describe("antiExitValidator", () => {
  it("autorise des messages de conversation classiques", () => {
    allowed("On se voit samedi pour le footing ?");
    allowed("J’adore le trail, surtout le matin.");
    allowed("Tu préfères plutôt natation ou muscu ?");
    allowed("Super match, hâte de courir avec toi !");
    allowed("C’est vraiment instantané, top !");
    allowed("J’adore l’installation du nouveau parc");
  });

  it("bloque contournement par lettres espacées et ponctuation", () => {
    blocked("i n s t a : john");
    blocked("i n s t a");
    blocked("insta : john");
    blocked("snap = john_13");
  });

  it("bloque numéro FR et e-mail contourné", () => {
    blocked("06 12 34 56 78");
    blocked("john (at) gmail.com");
  });

  it("bloque URLs, domaines, manœuvres d’où contacter ailleurs", () => {
    blocked("https://mauvais-site.com/xyz");
    blocked("regarde mon blog www.ici.fr stp");
    blocked("c’est sur meetup.io en fait");
    blocked("Suis-moi @pseudo_insta");
    blocked("jette un œil sur mon IG");
    blocked("moi@domaine.com");
  });

  it("bloque tournures d’esquive in-app (sauf formules sûres)", () => {
    blocked("ajoute-moi stv");
    blocked("mon insta c’est clair en bio");
    blocked("écris-moi sur le Telegram");
  });

  it("laisse écrire rester sur l’appli / SPLove / le chat", () => {
    allowed("écris-moi sur l’appli quand tu veux");
    allowed("écris-moi sur le chat, je réponds vite");
    allowed("contacte-moi sur SPLove, je suis dispo");
  });
});
