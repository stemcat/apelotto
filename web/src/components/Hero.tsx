"use client";

import { useAccount, useWriteContract } from "wagmi";
import { megaJackpotAbi } from "@/lib/abi";
import { CONTRACT_ADDRESS, JACKPOT_TARGET_USD } from "@/lib/config";
import { formatEth, formatUsd } from "@/lib/format";
import { Phase, useJackpot } from "@/hooks/useJackpot";
import { Countdown, useCountdownExpired } from "./Countdown";
import { AddressLabel } from "./AddressLabel";
import { ShareButtons } from "./ShareButtons";
import { shareTexts } from "@/lib/share";
import { referralLink } from "@/lib/referral";

export function Hero({
  jackpot,
  onDeposit,
}: {
  jackpot: ReturnType<typeof useJackpot>;
  onDeposit: () => void;
}) {
  const { address } = useAccount();
  const { writeContract, isPending } = useWriteContract();
  const drawDue = useCountdownExpired(jackpot.countdownDeadline);

  const shareUrl = address
    ? referralLink(address)
    : typeof window !== "undefined"
      ? window.location.origin
      : "";

  return (
    <section className="flex flex-col items-center gap-6 text-center">
      <div className="rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
        {jackpot.phase === Phase.Open && "The world's largest lottery"}
        {jackpot.phase === Phase.Countdown && (drawDue ? "Draw is due" : "🔒 Locked in — final countdown")}
        {jackpot.phase === Phase.Drawing && "Drawing the winner"}
        {jackpot.phase === Phase.Complete && "We have a winner"}
      </div>

      <h1 className="bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 bg-clip-text font-black tracking-tight text-transparent">
        <span className="block text-6xl sm:text-8xl">{formatUsd(jackpot.poolUsd)}</span>
        <span className="mt-1 block text-sm font-semibold uppercase tracking-[0.3em] text-amber-500/80">
          of {formatUsd(JACKPOT_TARGET_USD)} jackpot{jackpot.usdIsEstimate ? " (est.)" : ""}
        </span>
      </h1>

      {(jackpot.phase === Phase.Open || jackpot.phase === Phase.Countdown) && (
        <>
          <div className="w-full max-w-xl">
            <div className="h-4 overflow-hidden rounded-full border border-white/10 bg-white/5">
              <div
                className="progress-glow h-full rounded-full bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-300 transition-all duration-1000"
                style={{ width: `${Math.max(jackpot.progress * 100, 0.5)}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-zinc-400">
              <span>
                {formatEth(jackpot.totalPool, 2)} ETH pooled · {jackpot.participantCount.toString()} players
              </span>
              <span>{(jackpot.progress * 100).toFixed(4)}%</span>
            </div>
          </div>

          {jackpot.phase === Phase.Countdown && !drawDue && (
            <div className="flex flex-col items-center gap-2">
              <Countdown deadline={jackpot.countdownDeadline} />
              <p className="max-w-md text-xs text-zinc-400">
                Withdrawals are locked. Every 100 ETH deposited resets the clock to 6 hours
                (30-day max). When it hits zero, one wallet wins everything.
              </p>
            </div>
          )}

          {jackpot.phase === Phase.Countdown && drawDue && (
            <button
              onClick={() =>
                writeContract({ address: CONTRACT_ADDRESS, abi: megaJackpotAbi, functionName: "triggerDraw" })
              }
              disabled={isPending}
              className="rounded-full bg-red-500 px-8 py-3 font-bold text-white transition hover:bg-red-400 disabled:opacity-50"
            >
              {isPending ? "Triggering…" : "🎲 Trigger the draw"}
            </button>
          )}

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={onDeposit}
              className="rounded-full bg-amber-400 px-10 py-4 text-lg font-black text-black shadow-lg shadow-amber-400/25 transition hover:scale-105 hover:bg-amber-300"
            >
              Enter the Jackpot
            </button>
            <ShareButtons text={shareTexts.hero()} url={shareUrl} />
          </div>
          <p className="max-w-lg text-sm text-zinc-400">
            Your win chance = your exact share of the pool. Withdraw your balance anytime
            (24h after your last deposit) until the ${"2.05B"} target locks in the draw.
          </p>
        </>
      )}

      {jackpot.phase === Phase.Drawing && (
        <div className="flex flex-col items-center gap-3">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-amber-400/20 border-t-amber-400" />
          <p className="text-zinc-300">
            Chainlink VRF is generating verifiable randomness on-chain. The winner will be
            selected with odds exactly proportional to each balance.
          </p>
        </div>
      )}

      {jackpot.phase === Phase.Complete && jackpot.winner && (
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 px-8 py-6">
            <p className="mb-2 text-sm uppercase tracking-widest text-amber-300">Winner</p>
            <div className="text-2xl">
              <AddressLabel address={jackpot.winner} highlight />
            </div>
            <p className="mt-2 text-4xl font-black text-amber-300">
              {formatEth(jackpot.prizeAmount, 2)} ETH
            </p>
          </div>
          {address?.toLowerCase() === jackpot.winner.toLowerCase() && !jackpot.prizeClaimed && (
            <button
              onClick={() =>
                writeContract({ address: CONTRACT_ADDRESS, abi: megaJackpotAbi, functionName: "claimPrize" })
              }
              disabled={isPending}
              className="animate-pulse rounded-full bg-amber-400 px-10 py-4 text-lg font-black text-black hover:bg-amber-300 disabled:opacity-50"
            >
              {isPending ? "Claiming…" : "🏆 Claim your jackpot"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
