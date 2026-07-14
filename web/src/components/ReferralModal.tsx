"use client";

import { useState } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { megaJackpotAbi } from "@/lib/abi";
import { CONTRACT_ADDRESS } from "@/lib/config";
import { Phase, useJackpot, useMyPosition } from "@/hooks/useJackpot";
import { formatEth } from "@/lib/format";
import { referralLink } from "@/lib/referral";
import { shareTexts } from "@/lib/share";
import { Modal } from "./Modal";
import { ShareButtons } from "./ShareButtons";
import { ConnectButton } from "./ConnectButton";

export function ReferralModal({
  jackpot,
  onClose,
}: {
  jackpot: ReturnType<typeof useJackpot>;
  onClose: () => void;
}) {
  const { address, isConnected } = useAccount();
  const position = useMyPosition();
  const [copied, setCopied] = useState(false);
  const { writeContract, isPending } = useWriteContract();

  const drawDone = jackpot.phase === Phase.Complete;
  const canClaim = drawDone && position.referralReward > 0n && !position.referralRewardClaimed;

  return (
    <Modal title="Refer & earn" onClose={onClose}>
      {!isConnected || !address ? (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <p className="text-sm text-zinc-400">Connect a wallet to get your personal referral link.</p>
          <ConnectButton />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-zinc-300">
            Earn <span className="font-bold text-amber-300">10% of the house fee</span> generated
            by everyone you refer — that&apos;s 0.2% of every ETH they have locked in at the draw.
            Paid out in full when the jackpot completes; if it never does, players got to
            withdraw everything and nobody paid a cent.
          </p>

          <div className="grid grid-cols-3 gap-3">
            <StatBox label="Referred volume" value={`${formatEth(position.referredVolume, 2)} ETH`} />
            <StatBox
              label={drawDone ? "Your reward" : "Reward at draw"}
              value={`${formatEth(position.referralReward)} ETH`}
              accent
            />
            <StatBox label="Players referred" value={position.referredUsers.toString()} />
          </div>

          {canClaim && (
            <button
              onClick={() =>
                writeContract({
                  address: CONTRACT_ADDRESS,
                  abi: megaJackpotAbi,
                  functionName: "claimReferralReward",
                })
              }
              disabled={isPending}
              className="animate-pulse rounded-full bg-amber-400 py-3 font-black text-black hover:bg-amber-300 disabled:opacity-50"
            >
              {isPending ? "Claiming…" : `🏅 Claim ${formatEth(position.referralReward)} ETH`}
            </button>
          )}
          {drawDone && position.referralRewardClaimed && (
            <p className="text-center text-sm text-emerald-300">Reward claimed ✓</p>
          )}

          <div>
            <p className="mb-1 text-[11px] uppercase tracking-widest text-zinc-500">Your link</p>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(referralLink(address));
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="w-full truncate rounded-xl border border-dashed border-amber-400/40 bg-amber-400/5 px-4 py-3 text-left font-mono text-sm text-amber-200 transition hover:bg-amber-400/10"
            >
              {copied ? "Copied to clipboard! ✓" : referralLink(address)}
            </button>
          </div>

          <ShareButtons text={shareTexts.referral()} url={referralLink(address)} />
        </div>
      )}
    </Modal>
  );
}

function StatBox({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
      <p className="text-[11px] uppercase tracking-widest text-zinc-500">{label}</p>
      <p className={`font-mono text-lg font-bold ${accent ? "text-amber-300" : "text-white"}`}>{value}</p>
    </div>
  );
}
