import { trackPopupOpen } from "@/lib/dapp/tx-match";

/** Watch window.open for a wallet URL the browser refused to show. */
export function installPopupCapture(onUrl: (url: string) => void) {
  if (typeof window === "undefined") return () => {};
  const original = window.open.bind(window);
  window.open = trackPopupOpen(original, onUrl) as typeof window.open;
  return () => {
    window.open = original;
  };
}
