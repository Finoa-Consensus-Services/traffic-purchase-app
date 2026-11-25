export const LOCAL_PREVIEW_WALLET_ID = "local-preview";
export const LOCAL_PREVIEW_PARTY_ID = "local::1220abcdpreview";
export const LOCAL_PREVIEW_CC = 1_000_000;

/** Client-side gate. Production builds inline NODE_ENV, so this stays off when deployed. */
export function localPreviewWalletEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_UI_FIXTURES === "1";
}

export function isWalletUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
