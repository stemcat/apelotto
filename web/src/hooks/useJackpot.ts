"use client";

import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { formatEther } from "viem";
import { megaJackpotAbi } from "@/lib/abi";
import {
  CONTRACT_ADDRESS,
  FALLBACK_ETH_USD,
  JACKPOT_TARGET_USD,
  activeChain,
  isContractConfigured,
} from "@/lib/config";

export enum Phase {
  Open = 0,
  Countdown = 1,
  Drawing = 2,
  Complete = 3,
}

const contract = {
  address: CONTRACT_ADDRESS,
  abi: megaJackpotAbi,
  chainId: activeChain.id,
} as const;

export function useJackpot() {
  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      { ...contract, functionName: "totalPool" },
      { ...contract, functionName: "phase" },
      { ...contract, functionName: "countdownDeadline" },
      { ...contract, functionName: "countdownHardDeadline" },
      { ...contract, functionName: "participantCount" },
      { ...contract, functionName: "poolUsdValue" },
      { ...contract, functionName: "winner" },
      { ...contract, functionName: "prizeAmount" },
      { ...contract, functionName: "prizeClaimed" },
    ],
    query: {
      enabled: isContractConfigured,
      refetchInterval: 5_000,
    },
  });

  const [
    totalPoolRes,
    phaseRes,
    deadlineRes,
    hardDeadlineRes,
    participantsRes,
    poolUsdRes,
    winnerRes,
    prizeRes,
    prizeClaimedRes,
  ] = data ?? [];

  const totalPool = (totalPoolRes?.result as bigint | undefined) ?? 0n;
  const poolEth = Number(formatEther(totalPool));

  // poolUsdValue() reverts when the price feed is stale; fall back to an estimate.
  const feedOk = poolUsdRes?.status === "success";
  const [usdRaw, priceRaw] = (poolUsdRes?.result as readonly [bigint, bigint] | undefined) ?? [0n, 0n];
  const ethUsdPrice = feedOk ? Number(priceRaw) / 1e8 : FALLBACK_ETH_USD;
  const poolUsd = feedOk ? Number(usdRaw) : poolEth * FALLBACK_ETH_USD;

  return {
    isLoading,
    refetch,
    isConfigured: isContractConfigured,
    totalPool,
    poolEth,
    poolUsd,
    ethUsdPrice,
    usdIsEstimate: !feedOk,
    progress: Math.min(poolUsd / JACKPOT_TARGET_USD, 1),
    phase: Number((phaseRes?.result as number | undefined) ?? Phase.Open) as Phase,
    countdownDeadline: Number((deadlineRes?.result as bigint | undefined) ?? 0n),
    countdownHardDeadline: Number((hardDeadlineRes?.result as bigint | undefined) ?? 0n),
    participantCount: (participantsRes?.result as bigint | undefined) ?? 0n,
    winner: (winnerRes?.result as `0x${string}` | undefined) ?? undefined,
    prizeAmount: (prizeRes?.result as bigint | undefined) ?? 0n,
    prizeClaimed: (prizeClaimedRes?.result as boolean | undefined) ?? false,
  };
}

export function useMyPosition() {
  const { address } = useAccount();

  const { data: info, refetch: refetchInfo } = useReadContract({
    ...contract,
    functionName: "accountInfo",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: isContractConfigured && !!address, refetchInterval: 5_000 },
  });

  const { data: chancePpm } = useReadContract({
    ...contract,
    functionName: "winChancePpm",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: isContractConfigured && !!address, refetchInterval: 5_000 },
  });

  const { data: rewardClaimed } = useReadContract({
    ...contract,
    functionName: "referralRewardClaimed",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: isContractConfigured && !!address, refetchInterval: 10_000 },
  });

  const [balance, withdrawUnlockAt, referrer, referredVolume, referralReward, referredUsers] =
    (info as readonly [bigint, bigint, `0x${string}`, bigint, bigint, bigint] | undefined) ?? [
      0n,
      0n,
      "0x0000000000000000000000000000000000000000",
      0n,
      0n,
      0n,
    ];

  return {
    address,
    balance,
    withdrawUnlockAt: Number(withdrawUnlockAt),
    referrer,
    referredVolume,
    /** projection before the draw; exact claimable amount after it */
    referralReward,
    referralRewardClaimed: (rewardClaimed as boolean | undefined) ?? false,
    referredUsers,
    winChancePpm: (chancePpm as bigint | undefined) ?? 0n,
    refetch: refetchInfo,
  };
}
