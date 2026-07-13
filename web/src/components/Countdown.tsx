"use client";

import { useEffect, useState } from "react";

function useNow() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function Countdown({ deadline }: { deadline: number }) {
  const now = useNow();
  if (now === null) return <div className="h-16" />;

  const remaining = Math.max(deadline - now, 0);
  const segments = [
    { label: "hours", value: Math.floor(remaining / 3600) },
    { label: "min", value: Math.floor((remaining % 3600) / 60) },
    { label: "sec", value: remaining % 60 },
  ];

  return (
    <div className="flex items-center justify-center gap-3">
      {segments.map((segment) => (
        <div
          key={segment.label}
          className="flex min-w-[72px] flex-col items-center rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2"
        >
          <span className="font-mono text-3xl font-bold tabular-nums text-red-300">
            {String(segment.value).padStart(2, "0")}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-red-400/70">{segment.label}</span>
        </div>
      ))}
    </div>
  );
}

export function useCountdownExpired(deadline: number): boolean {
  const now = useNow();
  return now !== null && deadline > 0 && now >= deadline;
}
