"use client";

import { useMemo, useState } from "react";
import { parseEther } from "viem";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { megaJackpotAbi } from "@/lib/abi";
import { CONTRACT_ADDRESS, MIN_DEPOSIT_ETH } from "@/lib/config";
import { formatEth, shortAddress, winChanceLabel } from "@/lib/format";
import { getStoredReferrer, referralLink } from "@/lib/referral";
import { shareTexts } from "@/lib/share";
import { useJackpot, useMyPosition } from "@/hooks/useJackpot";
import { Modal } from "./Modal";
import { ShareButtons } from "./ShareButtons";

const QUICK_AMOUNTS = ["0.01", "0.1", "1", "10"];

export function DepositModal({
  jackpot,
  onClose,
}: {
  jackpot: ReturnType<typeof useJackpot>;
  onClose: () => void;
}) {
  const { address, isConnected } = useAccount();
  const position = useMyPosition();
  const [amount, setAmount] = useState("0.1");
  const referrer = useMemo(() => getStoredReferrer(), []);

  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isSuccess: confirmed, isLoading: confirming } = useWaitForTransactionReceipt({ hash: txHash });

  const parsed = useMemo(() => {
    try {
      return parseEther(amount || "0");
    } catch {
      return 0n;
    }
  }, [amount]);

  // 100% is credited — the 2% fee only exists if the draw actually happens
  const feeAtDraw = (parsed * 200n) / 10_000n;

  // projected win chance after this deposit
  const newBalance = position.balance + parsed;
  const newPool = jackpot.totalPool + parsed;
  const projectedPpm = newPool > 0n ? (newBalance * 1_000_000n) / newPool : 0n;

  const tooSmall = parsed > 0n && Number(amount) < MIN_DEPOSIT_ETH;

  if (confirmed) {
    return (
      <Modal title="You're in! 🎉" onClose={onClose}>
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-5xl">🎰</p>
          <p className="text-zinc-300">
            <span className="font-bold text-white">{formatEth(parsed)} ETH</span> is now in the
            jackpot. Your win chance:{" "}
            <span className="font-bold text-amber-300">{winChanceLabel(projectedPpm)}</span>
          </p>
          <p className="text-sm text-zinc-400">
            Share your link — everyone you refer earns you 10% of the house fee they generate,
            paid out when the draw happens.
          </p>
          <ShareButtons
            text={shareTexts.afterDeposit(formatEth(parsed), winChanceLabel(projectedPpm))}
            url={address ? referralLink(address) : window.location.origin}
          />
          <button onClick={onClose} className="text-sm text-zinc-500 underline hover:text-zinc-300">
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Enter the Jackpot" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-widest text-zinc-500">
            Deposit amount (ETH)
          </label>
          <input
            type="number"
            min={MIN_DEPOSIT_ETH}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 font-mono text-xl text-white outline-none focus:border-amber-400/60"
          />
          <div className="mt-2 flex gap-2">
            {QUICK_AMOUNTS.map((quick) => (
              <button
                key={quick}
                onClick={() => setAmount(quick)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  amount === quick
                    ? "bg-amber-400 text-black"
                    : "border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
                }`}
              >
                {quick} ETH
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3 text-sm">
          <Row label="Goes into your jackpot balance" value={`${formatEth(parsed)} ETH (100%)`} />
          <Row label="House fee — only if the draw happens" value={`${formatEth(feeAtDraw)} ETH (2%)`} muted />
          {referrer && (
            <Row label={`Referrer ${shortAddress(referrer)} gets 10% of that fee`} value="at the draw" muted />
          )}
          <div className="my-2 border-t border-white/5" />
          <Row label="Your projected win chance" value={winChanceLabel(projectedPpm)} accent />
        </div>

        {tooSmall && <p className="text-sm text-red-400">Minimum deposit is {MIN_DEPOSIT_ETH} ETH.</p>}
        {error && (
          <p className="break-words text-sm text-red-400">
            {(error as { shortMessage?: string }).shortMessage ?? error.message}
          </p>
        )}

        <button
          onClick={() =>
            writeContract({
              address: CONTRACT_ADDRESS,
              abi: megaJackpotAbi,
              functionName: "deposit",
              args: [referrer ?? "0x0000000000000000000000000000000000000000"],
              value: parsed,
            })
          }
          disabled={!isConnected || parsed === 0n || tooSmall || isPending || confirming}
          className="rounded-full bg-amber-400 py-3.5 text-lg font-black text-black transition hover:bg-amber-300 disabled:opacity-40"
        >
          {!isConnected
            ? "Connect a wallet first"
            : isPending
              ? "Confirm in wallet…"
              : confirming
                ? "Confirming on-chain…"
                : `Deposit ${amount || "0"} ETH`}
        </button>
        <p className="text-center text-xs text-zinc-500">
          Withdraw your full balance anytime, 24h after your last deposit — you can never lose
          money before the $2.05B lock-in.
        </p>
      </div>
    </Modal>
  );
}

function Row({
  label,
  value,
  muted = false,
  accent = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className={muted ? "text-zinc-500" : "text-zinc-300"}>{label}</span>
      <span className={`font-mono ${accent ? "font-bold text-amber-300" : muted ? "text-zinc-400" : "text-white"}`}>
        {value}
      </span>
    </div>
  );
}
