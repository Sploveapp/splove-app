/** Mirrors `second_chance_message_is_valid` in DB (no URLs, 1–200 chars, single line). */
const URLISH = /https?:\/\/|www\./i;

export function isSecondChanceMessageTextValid(text: string): boolean {
  const t = text.trim();
  if (t.length < 1 || t.length > 200) return false;
  if (URLISH.test(t)) return false;
  if (/[\r\n]/.test(t)) return false;
  return true;
}

export const SECOND_CHANCE_MAX_LEN = 200;
