"use client";

import { useEnsAvatar, useEnsName } from "wagmi";
import { mainnet } from "wagmi/chains";
import { normalize } from "viem/ens";
import { shortAddress } from "@/lib/format";

/** ENS-aware address display: name + avatar resolved from L1 mainnet. */
export function AddressLabel({
  address,
  highlight = false,
}: {
  address: `0x${string}`;
  highlight?: boolean;
}) {
  const { data: ensName } = useEnsName({ address, chainId: mainnet.id });
  const { data: avatar } = useEnsAvatar({
    name: ensName ? normalize(ensName) : undefined,
    chainId: mainnet.id,
  });

  return (
    <span className="inline-flex items-center gap-2">
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt="" className="h-5 w-5 rounded-full" />
      ) : (
        <span
          aria-hidden
          className="h-5 w-5 rounded-full bg-gradient-to-br from-amber-400 to-fuchsia-600"
          style={{ filter: `hue-rotate(${parseInt(address.slice(2, 6), 16) % 360}deg)` }}
        />
      )}
      <span className={highlight ? "font-semibold text-amber-300" : "text-zinc-200"}>
        {ensName ?? shortAddress(address)}
      </span>
    </span>
  );
}
