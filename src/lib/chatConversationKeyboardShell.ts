/** Seuil visualViewport (px) — évite les faux positifs sur petits redimensionnements. */
export const CHAT_KEYBOARD_OPEN_THRESHOLD_PX = 50;

export const CHAT_KEYBOARD_SHELL_EVENT = "splove-chat-keyboard-shell";

function dispatchKeyboardShellChange(): void {
  window.dispatchEvent(new CustomEvent(CHAT_KEYBOARD_SHELL_EVENT));
}

/** Conversation ouverte : clavier iOS ouvert → masquer temporairement la bottom nav. */
export function setChatConversationKeyboardOpen(open: boolean): void {
  const next = open ? "true" : "";
  if (document.documentElement.dataset.sploveChatKeyboardOpen === next) return;
  if (next) {
    document.documentElement.dataset.sploveChatKeyboardOpen = next;
  } else {
    delete document.documentElement.dataset.sploveChatKeyboardOpen;
  }
  dispatchKeyboardShellChange();
}

export function isChatConversationKeyboardOpen(): boolean {
  return document.documentElement.dataset.sploveChatKeyboardOpen === "true";
}

export function isChatKeyboardOpenInset(keyboardInsetPx: number): boolean {
  return keyboardInsetPx >= CHAT_KEYBOARD_OPEN_THRESHOLD_PX;
}
