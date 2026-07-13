/**
 * Integration check: exercises the exact reads the frontend makes, using the
 * frontend's hand-written ABI against a locally deployed contract.
 * Run: node --experimental-strip-types scripts/verify-live.ts
 */
import { createPublicClient, http, formatEther } from "viem";
import { hardhat } from "viem/chains";
import { megaJackpotAbi } from "../src/lib/abi.ts";

const address = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ??
  "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0") as `0x${string}`;

const client = createPublicClient({ chain: hardhat, transport: http("http://127.0.0.1:8545") });

const totalPool = await client.readContract({ address, abi: megaJackpotAbi, functionName: "totalPool" });
const phase = await client.readContract({ address, abi: megaJackpotAbi, functionName: "phase" });
const count = await client.readContract({ address, abi: megaJackpotAbi, functionName: "participantCount" });
const [usd, price] = await client.readContract({ address, abi: megaJackpotAbi, functionName: "poolUsdValue" });

const logs = await client.getContractEvents({
  address,
  abi: megaJackpotAbi,
  eventName: "Deposited",
  fromBlock: 0n,
});
const refLogs = await client.getContractEvents({
  address,
  abi: megaJackpotAbi,
  eventName: "ReferralCredited",
  fromBlock: 0n,
});

console.log(`totalPool:        ${formatEther(totalPool)} ETH`);
console.log(`phase:            ${phase}`);
console.log(`participants:     ${count}`);
console.log(`pool USD:         $${usd} @ ETH/USD ${Number(price) / 1e8}`);
console.log(`Deposited events: ${logs.length}`);
console.log(`Referral events:  ${refLogs.length}`);

// Assertions matching the seed script: 5 + 2.5 + 0.75 ETH deposited, 2% fee,
// alice referred bob + carol (0.2% of their deposits back to alice).
const wei = (eth: string) => BigInt(Math.round(Number(eth) * 1e6)) * 10n ** 12n;
const expected = ((wei("8.25") * 9800n) / 10000n) + ((wei("3.25") * 200n) / 10000n / 10n);

if (totalPool !== expected) throw new Error(`pool mismatch: ${totalPool} != ${expected}`);
if (logs.length !== 3) throw new Error("expected 3 Deposited events");
if (refLogs.length !== 2) throw new Error("expected 2 ReferralCredited events");
if (Number(phase) !== 0) throw new Error("expected phase Open");

console.log("\n✅ frontend ABI matches deployed contract — all reads OK");
