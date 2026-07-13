"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { aggregateLeaderboard, useDeposits } from "@/hooks/useDeposits";
import { formatEth } from "@/lib/format";
import { AddressLabel } from "./AddressLabel";
import { Modal } from "./Modal";

const WINDOWS = [
  { key: "24h", label: "24h", seconds: 86_400 },
  { key: "7d", label: "7 days", seconds: 604_800 },
  { key: "all", label: "All time", seconds: 0 },
] as const;

export function LeaderboardModal({
  deposits,
  onClose,
}: {
  deposits: ReturnType<typeof useDeposits>;
  onClose: () => void;
}) {
  const { address } = useAccount();
  const [window, setWindow] = useState<(typeof WINDOWS)[number]>(WINDOWS[0]);

  const rows = useMemo(() => {
    const cutoff = window.seconds === 0 ? 0n : deposits.cutoffBlock(window.seconds);
    return aggregateLeaderboard(deposits.deposits, cutoff).slice(0, 25);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deposits.deposits, window]);

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <Modal title="Top depositors" onClose={onClose}>
      <div className="mb-4 flex gap-1 rounded-full border border-white/10 bg-white/5 p-1">
        {WINDOWS.map((w) => (
          <button
            key={w.key}
            onClick={() => setWindow(w)}
            className={`flex-1 rounded-full py-1.5 text-sm font-semibold transition ${
              window.key === w.key ? "bg-amber-400 text-black" : "text-zinc-400 hover:text-white"
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>

      <div className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto pr-1">
        {rows.length === 0 && (
          <p className="p-6 text-center text-sm text-zinc-500">
            {deposits.loaded ? "No deposits in this window yet." : "Loading…"}
          </p>
        )}
        {rows.map((row, i) => (
          <div
            key={row.account}
            className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${
              address?.toLowerCase() === row.account.toLowerCase()
                ? "border border-amber-400/30 bg-amber-400/10"
                : "bg-white/[0.03]"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="w-7 text-center font-mono text-zinc-500">{medals[i] ?? i + 1}</span>
              <AddressLabel
                address={row.account}
                highlight={address?.toLowerCase() === row.account.toLowerCase()}
              />
            </div>
            <div className="text-right">
              <p className="font-mono font-bold text-white">{formatEth(row.total, 2)} ETH</p>
              <p className="text-[10px] text-zinc-500">
                {row.count} deposit{row.count === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
