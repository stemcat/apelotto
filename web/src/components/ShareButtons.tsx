"use client";

import { useState } from "react";
import { tweetUrl, nativeShareOrCopy } from "@/lib/share";

export function ShareButtons({ text, url }: { text: string; url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <a
        href={tweetUrl(text, url)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-black transition hover:bg-zinc-200"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82L5 21.75H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64z" />
        </svg>
        Post
      </a>
      <button
        onClick={async () => {
          const result = await nativeShareOrCopy(text, url);
          if (result === "copied") {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }
        }}
        className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium transition hover:bg-white/10"
      >
        {copied ? "Copied!" : "Share / Copy"}
      </button>
    </div>
  );
}
