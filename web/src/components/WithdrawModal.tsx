"use client";

import { useMemo, useState } from "react";
import { formatEther, parseEther } from "viem";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { megaJackpotAbi } from "@/lib/abi";
import { CONTRACT_ADDRESS } from "@/lib/config";
import { formatEth } from "@/lib/format";
import { useMyPosition } from "@/hooks/useJackpot";
import { Modal } from "./Modal";

export function WithdrawModal({ onClose }: { onClose: () => void }) {
  const position = useMyPosition();
  const [amount, setAmount] = useState("");

  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isSuccess: confirmed, isLoading: confirming } = useWaitForTransactionReceipt({ hash: txHash });

  const parsed = useMemo(() => {
    try {
      return parseEther(amount || "0");
    } catch {
      return 0n;
    }
  }, [amount]);

  const overdraw = parsed > position.balance;

  if (confirmed) {
    return (
      <Modal title="Withdrawal complete" onClose={onClose}>
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-5xl">✅</p>
          <p className="text-zinc-300">
            <span className="font-bold text-white">{amount} ETH</span> is on its way back to your wallet.
          </p>
          <button onClick={onClose} className="text-sm text-zinc-500 underline hover:text-zinc-300">
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Withdraw from your balance" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-zinc-400">
          Available: <span className="font-mono font-bold text-white">{formatEth(position.balance)} ETH</span>
        </p>
        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 font-mono text-xl text-white outline-none focus:border-amber-400/60"
          />
          <button
            onClick={() => setAmount(formatEther(position.balance))}
            className="rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold hover:bg-white/10"
          >
            Max
          </button>
        </div>

        {overdraw && <p className="text-sm text-red-400">That&apos;s more than your balance.</p>}
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
              functionName: "withdraw",
              args: [parsed],
            })
          }
          disabled={parsed === 0n || overdraw || isPending || confirming}
          className="rounded-full border border-white/20 bg-white/10 py-3 font-bold transition hover:bg-white/20 disabled:opacity-40"
        >
          {isPending ? "Confirm in wallet…" : confirming ? "Confirming…" : "Withdraw"}
        </button>
        <p className="text-center text-xs text-zinc-500">
          Withdrawing reduces your win chance proportionally. No fee on withdrawals.
        </p>
      </div>
    </Modal>
  );
}
