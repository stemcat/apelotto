import { http, createConfig } from "wagmi";
import { base, baseSepolia, hardhat, mainnet } from "wagmi/chains";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";
import type { Chain } from "viem";

export const JACKPOT_TARGET_USD = 2_050_000_000;
export const FALLBACK_ETH_USD = 3500; // display-only fallback when the feed read fails
export const MIN_DEPOSIT_ETH = 0.01;

const chainsByName: Record<string, Chain> = {
  base,
  baseSepolia,
  hardhat,
};

/** Average block time, used to convert block ranges into time windows for leaderboards. */
const blockTimeByChain: Record<number, number> = {
  [base.id]: 2,
  [baseSepolia.id]: 2,
  [hardhat.id]: 1,
};

export const activeChain = chainsByName[process.env.NEXT_PUBLIC_CHAIN ?? "baseSepolia"] ?? baseSepolia;
export const BLOCK_TIME_SECONDS = blockTimeByChain[activeChain.id] ?? 2;

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "") as `0x${string}`;
export const DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? "0");
export const isContractConfigured = CONTRACT_ADDRESS.length === 42;

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

export const wagmiConfig = createConfig({
  // mainnet is included read-only for ENS resolution; the app itself lives on `activeChain`.
  chains: [activeChain, mainnet],
  connectors: [
    injected(),
    coinbaseWallet({ appName: "MegaJackpot" }),
    ...(walletConnectProjectId ? [walletConnect({ projectId: walletConnectProjectId })] : []),
  ],
  transports: {
    [activeChain.id]: http(),
    [mainnet.id]: http(),
  },
  ssr: true,
});
