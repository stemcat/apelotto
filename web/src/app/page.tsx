"use client";

import { useEffect, useState } from "react";
import { useJackpot } from "@/hooks/useJackpot";
import { useDeposits } from "@/hooks/useDeposits";
import { captureReferrerFromUrl } from "@/lib/referral";
import { CONTRACT_ADDRESS, activeChain, isContractConfigured } from "@/lib/config";
import { shortAddress } from "@/lib/format";
import { ConnectButton } from "@/components/ConnectButton";
import { Hero } from "@/components/Hero";
import { LiveTicker } from "@/components/LiveTicker";
import { PositionCard } from "@/components/PositionCard";
import { DepositModal } from "@/components/DepositModal";
import { WithdrawModal } from "@/components/WithdrawModal";
import { LeaderboardModal } from "@/components/LeaderboardModal";
import { ReferralModal } from "@/components/ReferralModal";

type ActiveModal = "deposit" | "withdraw" | "leaderboard" | "referral" | null;

export default function Home() {
  const jackpot = useJackpot();
  const deposits = useDeposits();
  const [modal, setModal] = useState<ActiveModal>(null);

  useEffect(() => {
    captureReferrerFromUrl();
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center">
      <header className="flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <span className="text-lg font-black tracking-tight">
          MEGA<span className="text-amber-400">JACKPOT</span>
        </span>
        <nav className="flex items-center gap-2">
          <button
            onClick={() => setModal("leaderboard")}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold transition hover:bg-white/10"
          >
            🏆 <span className="hidden sm:inline">Leaderboard</span>
          </button>
          <button
            onClick={() => setModal("referral")}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold transition hover:bg-white/10"
          >
            🤝 <span className="hidden sm:inline">Refer & earn</span>
          </button>
          <ConnectButton />
        </nav>
      </header>

      <main className="flex w-full max-w-5xl flex-1 flex-col items-center gap-10 px-4 py-10 sm:px-6 sm:py-16">
        {!isContractConfigured && (
          <div className="w-full max-w-2xl rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-center text-sm text-yellow-200">
            No contract configured. Set <code className="font-mono">NEXT_PUBLIC_CONTRACT_ADDRESS</code>{" "}
            (and <code className="font-mono">NEXT_PUBLIC_CHAIN</code>) in{" "}
            <code className="font-mono">.env.local</code>.
          </div>
        )}

        <Hero jackpot={jackpot} onDeposit={() => setModal("deposit")} />

        <PositionCard
          phase={jackpot.phase}
          onWithdraw={() => setModal("withdraw")}
          onReferral={() => setModal("referral")}
        />

        <LiveTicker deposits={deposits} />
      </main>

      <footer className="w-full border-t border-white/5 py-6">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 text-center text-xs text-zinc-500">
          {isContractConfigured && (
            <a
              href={`${activeChain.blockExplorers?.default.url}/address/${CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono underline decoration-dotted hover:text-zinc-300"
            >
              Contract: {shortAddress(CONTRACT_ADDRESS)} on {activeChain.name} ↗
            </a>
          )}
          <p>
            Provably fair: winner selection uses Chainlink VRF, odds are exactly proportional to
            balances, and the contract is immutable — no admin can touch player funds.
          </p>
          <p className="max-w-xl">
            Play responsibly. This may be regulated as gambling in your jurisdiction; ensure
            participation is legal where you live. 18+.
          </p>
        </div>
      </footer>

      {modal === "deposit" && <DepositModal jackpot={jackpot} onClose={() => setModal(null)} />}
      {modal === "withdraw" && <WithdrawModal onClose={() => setModal(null)} />}
      {modal === "leaderboard" && <LeaderboardModal deposits={deposits} onClose={() => setModal(null)} />}
      {modal === "referral" && <ReferralModal jackpot={jackpot} onClose={() => setModal(null)} />}
    </div>
  );
}
