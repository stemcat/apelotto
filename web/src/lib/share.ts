export function tweetUrl(text: string, url?: string): string {
  const params = new URLSearchParams({ text });
  if (url) params.set("url", url);
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

export async function nativeShareOrCopy(text: string, url: string): Promise<"shared" | "copied"> {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ text, url });
      return "shared";
    } catch {
      // fall through to clipboard (user cancelled or unsupported payload)
    }
  }
  await navigator.clipboard.writeText(`${text} ${url}`);
  return "copied";
}

export const shareTexts = {
  hero: () =>
    "The world's biggest lottery is live: a $2.05B on-chain jackpot. Deposit ETH, your odds = your share of the pool. Withdraw everything anytime before lock-in — you can't lose. 🎰",
  afterDeposit: (ethAmount: string, chancePct: string) =>
    `I just put ${ethAmount} ETH into the $2.05B MegaJackpot 🎰 My win chance: ${chancePct}. 100% refundable until lock-in — no fees unless the draw happens.`,
  referral: () =>
    "Join me in the $2.05B MegaJackpot — the biggest lottery ever, fully on-chain. Deposit ETH, withdraw everything anytime before lock-in. 🎰",
  countdown: (remaining: string) =>
    `⏳ ${remaining} left! The $2.05B MegaJackpot is locked in and counting down. One wallet takes it all.`,
};
