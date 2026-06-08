/** Retire le splash HTML statique (index.html) une fois React monté. */
export function dismissStaticBootSplash(): void {
  if (typeof document === "undefined") return;
  document.getElementById("splove-boot-splash")?.remove();
}
