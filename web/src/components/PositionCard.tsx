"use client";

import { useAccount } from "wagmi";
import { useMyPosition, Phase } from "@/hooks/useJackpot";
import { formatEth, formatDuration, winChanceLabel } from "@/lib/format";
import { useEffect, useState } from "react";

export function PositionCard({
  phase,
  onWithdraw,
  onReferral,
}: {
  phase: Phase;
  onWithdraw: () => void;
  onReferral: () => void;
}) {
  const { isConnected } = useAccount();
  const position = useMyPosition();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!isConnected || position.balance === 0n) return null;

  const secondsUntilUnlock = Math.max(position.withdrawUnlockAt - now, 0);
  const locked = phase !== Phase.Open;

  return (
    <section className="w-full max-w-2xl rounded-2xl border border-amber-400/20 bg-gradient-to-br from-amber-400/10 to-transparent p-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Your balance" value={`${formatEth(position.balance)} ETH`} />
        <Stat label="Win chance" value={winChanceLabel(position.winChancePpm)} accent />
        <Stat label="Referral earnings" value={`${formatEth(position.earnedFromReferrals)} ETH`} />
        <Stat
          label="Withdrawals"
          value={locked ? "🔒 Locked in" : secondsUntilUnlock > 0 ? `in ${formatDuration(secondsUntilUnlock)}` : "Unlocked"}
        />
      </div>
      <div className="mt-4 flex gap-2">
        <button
          onClick={onWithdraw}
          disabled={locked || secondsUntilUnlock > 0}
          className="rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm font-semibold transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Withdraw
        </button>
        <button
          onClick={onReferral}
          className="rounded-full border border-amber-400/40 bg-amber-400/10 px-5 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-400/20"
        >
          Earn from referrals
        </button>
      </div>
    </section>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-widest text-zinc-500">{label}</p>
      <p className={`mt-0.5 font-mono text-lg font-bold ${accent ? "text-amber-300" : "text-white"}`}>{value}</p>
    </div>
  );
}
