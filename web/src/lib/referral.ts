import { isAddress } from "viem";

const STORAGE_KEY = "megajackpot.referrer";

/** Persist ?ref=0x… from the URL so the referrer survives navigation. */
export function captureReferrerFromUrl(): void {
  if (typeof window === "undefined") return;
  const ref = new URLSearchParams(window.location.search).get("ref");
  if (ref && isAddress(ref)) {
    window.localStorage.setItem(STORAGE_KEY, ref);
  }
}

export function getStoredReferrer(): `0x${string}` | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored && isAddress(stored) ? (stored as `0x${string}`) : null;
}

export function referralLink(address: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://megajackpot.example";
  return `${origin}/?ref=${address}`;
}
