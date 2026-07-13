import { formatEther } from "viem";

export function formatEth(wei: bigint, maxDecimals = 4): string {
  const value = Number(formatEther(wei));
  if (value !== 0 && Math.abs(value) < 0.0001) return "<0.0001";
  return value.toLocaleString("en-US", { maximumFractionDigits: maxDecimals });
}

export function formatUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0s";
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function timeAgo(secondsAgo: number): string {
  if (secondsAgo < 5) return "just now";
  if (secondsAgo < 60) return `${Math.floor(secondsAgo)}s ago`;
  if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
  if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)}h ago`;
  return `${Math.floor(secondsAgo / 86400)}d ago`;
}

export function winChanceLabel(ppm: bigint | number): string {
  const pct = Number(ppm) / 10_000; // ppm -> percent
  if (pct === 0) return "0%";
  if (pct < 0.0001) return "<0.0001%";
  return `${pct.toLocaleString("en-US", { maximumFractionDigits: 4 })}%`;
}
