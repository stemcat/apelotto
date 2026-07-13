"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useMyPosition } from "@/hooks/useJackpot";
import { formatEth } from "@/lib/format";
import { referralLink } from "@/lib/referral";
import { shareTexts } from "@/lib/share";
import { Modal } from "./Modal";
import { ShareButtons } from "./ShareButtons";
import { ConnectButton } from "./ConnectButton";

export function ReferralModal({ onClose }: { onClose: () => void }) {
  const { address, isConnected } = useAccount();
  const position = useMyPosition();
  const [copied, setCopied] = useState(false);

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
            Earn <span className="font-bold text-amber-300">10% of the house fee</span> on every
            deposit your friends ever make — credited straight to your jackpot balance, boosting
            your own odds. Forever.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
              <p className="text-[11px] uppercase tracking-widest text-zinc-500">Earned so far</p>
              <p className="font-mono text-lg font-bold text-amber-300">
                {formatEth(position.earnedFromReferrals)} ETH
              </p>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
              <p className="text-[11px] uppercase tracking-widest text-zinc-500">Players referred</p>
              <p className="font-mono text-lg font-bold text-white">{position.referredUsers.toString()}</p>
            </div>
          </div>

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
