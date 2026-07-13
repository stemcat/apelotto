"use client";

import { useDeposits } from "@/hooks/useDeposits";
import { formatEth, timeAgo } from "@/lib/format";
import { AddressLabel } from "./AddressLabel";

export function LiveTicker({ deposits }: { deposits: ReturnType<typeof useDeposits> }) {
  const recent = [...deposits.deposits].reverse().slice(0, 8);

  return (
    <section className="w-full max-w-2xl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-zinc-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          Live deposits
        </h3>
        <span className="text-xs text-zinc-500">
          {formatEth(deposits.total24h, 2)} ETH in the last 24h
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {recent.length === 0 && (
          <p className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center text-sm text-zinc-500">
            {deposits.loaded ? "No deposits yet — be the first." : "Loading deposit history…"}
          </p>
        )}
        {recent.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] px-4 py-2.5 text-sm"
          >
            <AddressLabel address={entry.account} />
            <div className="flex items-center gap-3">
              <span className="font-mono font-semibold text-emerald-300">
                +{formatEth(entry.grossAmount)} ETH
              </span>
              <span className="w-16 text-right text-xs text-zinc-500">{timeAgo(deposits.ageOf(entry))}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
