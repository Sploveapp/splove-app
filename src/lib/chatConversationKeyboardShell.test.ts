import { describe, expect, it } from "vitest";
import {
  CHAT_KEYBOARD_OPEN_THRESHOLD_PX,
  isChatKeyboardOpenInset,
} from "./chatConversationKeyboardShell";

describe("chatConversationKeyboardShell", () => {
  it("seuil clavier ouvert", () => {
    expect(isChatKeyboardOpenInset(CHAT_KEYBOARD_OPEN_THRESHOLD_PX - 1)).toBe(false);
    expect(isChatKeyboardOpenInset(CHAT_KEYBOARD_OPEN_THRESHOLD_PX)).toBe(true);
  });
});
