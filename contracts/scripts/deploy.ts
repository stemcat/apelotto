import { ethers, network } from "hardhat";

/**
 * Deploys MegaJackpot.
 *
 * Required env vars (find current values at https://docs.chain.link/vrf/v2-5/supported-networks
 * and https://docs.chain.link/data-feeds/price-feeds/addresses):
 *   ETH_USD_FEED       Chainlink ETH/USD aggregator address
 *   VRF_COORDINATOR    Chainlink VRF v2.5 coordinator address
 *   VRF_KEY_HASH       VRF gas lane key hash
 *   VRF_SUB_ID         VRF v2.5 subscription id (create + fund it first)
 *   VRF_NATIVE_PAYMENT "true" to pay VRF fees in ETH, otherwise LINK
 *
 * Example (Base Sepolia):
 *   ETH_USD_FEED=0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1 \
 *   VRF_COORDINATOR=... VRF_KEY_HASH=... VRF_SUB_ID=... \
 *   npx hardhat run scripts/deploy.ts --network baseSepolia
 *
 * After deploying, add the contract as a consumer on your VRF subscription.
 */
async function main() {
  const feed = requireEnv("ETH_USD_FEED");
  const coordinator = requireEnv("VRF_COORDINATOR");
  const keyHash = requireEnv("VRF_KEY_HASH");
  const subId = requireEnv("VRF_SUB_ID");
  const nativePayment = process.env.VRF_NATIVE_PAYMENT === "true";

  const [deployer] = await ethers.getSigners();
  console.log(`Deploying MegaJackpot to ${network.name} from ${deployer.address}`);

  const Jackpot = await ethers.getContractFactory("MegaJackpot");
  const jackpot = await Jackpot.deploy(feed, coordinator, keyHash, subId, nativePayment);
  await jackpot.waitForDeployment();

  const address = await jackpot.getAddress();
  const block = await ethers.provider.getBlockNumber();
  console.log(`MegaJackpot deployed: ${address} (block ${block})`);
  console.log(`\nNext steps:`);
  console.log(`  1. Add ${address} as a consumer on VRF subscription ${subId}`);
  console.log(`  2. Set NEXT_PUBLIC_CONTRACT_ADDRESS=${address} and NEXT_PUBLIC_DEPLOY_BLOCK=${block} in web/.env.local`);
  console.log(`  3. Verify: npx hardhat verify --network ${network.name} ${address} ${feed} ${coordinator} ${keyHash} ${subId} ${nativePayment}`);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
