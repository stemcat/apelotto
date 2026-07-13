"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { AddressLabel } from "./AddressLabel";
import { Modal } from "./Modal";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [pickerOpen, setPickerOpen] = useState(false);

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        title="Disconnect"
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm transition hover:border-red-400/40 hover:bg-red-500/10"
      >
        <AddressLabel address={address} />
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setPickerOpen(true)}
        disabled={isPending}
        className="rounded-full bg-amber-400 px-5 py-2 text-sm font-bold text-black transition hover:bg-amber-300 disabled:opacity-50"
      >
        {isPending ? "Connecting…" : "Connect Wallet"}
      </button>
      {pickerOpen && (
        <Modal title="Connect a wallet" onClose={() => setPickerOpen(false)}>
          <div className="flex flex-col gap-2">
            {connectors.map((connector) => (
              <button
                key={connector.uid}
                onClick={() => {
                  connect({ connector });
                  setPickerOpen(false);
                }}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-medium transition hover:border-amber-400/50 hover:bg-amber-400/10"
              >
                {connector.name}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
