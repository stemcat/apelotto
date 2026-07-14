"use client";

import { useEffect, useMemo, useState } from "react";
import { useBlockNumber, usePublicClient, useWatchContractEvent } from "wagmi";
import { megaJackpotAbi } from "@/lib/abi";
import {
  BLOCK_TIME_SECONDS,
  CONTRACT_ADDRESS,
  DEPLOY_BLOCK,
  activeChain,
  isContractConfigured,
} from "@/lib/config";

export type DepositEntry = {
  id: string;
  account: `0x${string}`;
  amount: bigint;
  blockNumber: bigint;
};

/**
 * Loads the full Deposited history once and then streams new events.
 * NOTE: for a mature deployment with millions of events, replace this with an
 * indexer (Ponder / subgraph) — public RPCs cap getLogs ranges.
 */
export function useDeposits() {
  const client = usePublicClient({ chainId: activeChain.id });
  const [deposits, setDeposits] = useState<DepositEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const { data: currentBlock } = useBlockNumber({ chainId: activeChain.id, watch: true });

  useEffect(() => {
    if (!client || !isContractConfigured || loaded) return;
    let cancelled = false;
    (async () => {
      try {
        const logs = await client.getContractEvents({
          address: CONTRACT_ADDRESS,
          abi: megaJackpotAbi,
          eventName: "Deposited",
          fromBlock: DEPLOY_BLOCK,
          toBlock: "latest",
        });
        if (cancelled) return;
        setDeposits(
          logs.map((log) => ({
            id: `${log.transactionHash}-${log.logIndex}`,
            account: log.args.account!,
            amount: log.args.amount!,
            blockNumber: log.blockNumber,
          }))
        );
      } catch (error) {
        console.error("Failed to load deposit history", error);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, loaded]);

  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: megaJackpotAbi,
    eventName: "Deposited",
    chainId: activeChain.id,
    enabled: isContractConfigured,
    onLogs(logs) {
      setDeposits((existing) => {
        const seen = new Set(existing.map((d) => d.id));
        const fresh = logs
          .map((log) => ({
            id: `${log.transactionHash}-${log.logIndex}`,
            account: log.args.account!,
            amount: log.args.amount!,
            blockNumber: log.blockNumber!,
          }))
          .filter((d) => !seen.has(d.id));
        return fresh.length ? [...existing, ...fresh] : existing;
      });
    },
  });

  /** Approximate age of a deposit in seconds, from block distance. */
  const ageOf = (entry: DepositEntry) =>
    currentBlock ? Number(currentBlock - entry.blockNumber) * BLOCK_TIME_SECONDS : 0;

  const cutoffBlock = (seconds: number) =>
    currentBlock ? currentBlock - BigInt(Math.floor(seconds / BLOCK_TIME_SECONDS)) : 0n;

  const last24h = useMemo(() => {
    const cutoff = cutoffBlock(86_400);
    return deposits.filter((d) => d.blockNumber >= cutoff);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deposits, currentBlock]);

  const total24h = useMemo(
    () => last24h.reduce((sum, d) => sum + d.amount, 0n),
    [last24h]
  );

  return { deposits, loaded, ageOf, cutoffBlock, last24h, total24h };
}

/** Aggregates deposits per account within a window ("24h" | "7d" | "all"). */
export function aggregateLeaderboard(
  deposits: DepositEntry[],
  cutoff: bigint
): Array<{ account: `0x${string}`; total: bigint; count: number }> {
  const byAccount = new Map<`0x${string}`, { total: bigint; count: number }>();
  for (const d of deposits) {
    if (d.blockNumber < cutoff) continue;
    const entry = byAccount.get(d.account) ?? { total: 0n, count: 0 };
    entry.total += d.amount;
    entry.count += 1;
    byAccount.set(d.account, entry);
  }
  return [...byAccount.entries()]
    .map(([account, { total, count }]) => ({ account, total, count }))
    .sort((a, b) => (b.total > a.total ? 1 : b.total < a.total ? -1 : 0));
}
