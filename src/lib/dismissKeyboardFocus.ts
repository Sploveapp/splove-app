import type { RefObject } from "react";

/**
 * Ferme le clavier iOS/WKWebView et retire le focus des champs éditables
 * (équivalent Keyboard.dismiss() + inputRef.blur() en React Native).
 */
export function dismissKeyboardAndBlurInputs(
  refs?: Array<RefObject<HTMLElement | null> | null | undefined>,
): void {
  if (typeof document === "undefined") return;

  for (const ref of refs ?? []) {
    ref?.current?.blur();
  }

  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }

  document.querySelectorAll("input, textarea, select, [contenteditable='true']").forEach((el) => {
    if (el instanceof HTMLElement) {
      el.blur();
    }
  });
}
