import { ethers } from "hardhat";

/**
 * Local dev deployment: mocks + MegaJackpot + a few seeded deposits.
 * Run: npx hardhat run scripts/deploy-local.ts --network localhost
 */
async function main() {
  const [deployer, alice, bob, carol] = await ethers.getSigners();

  const Feed = await ethers.getContractFactory("MockV3Aggregator");
  const feed = await Feed.deploy(8, 3500n * 10n ** 8n);
  await feed.waitForDeployment();

  const Vrf = await ethers.getContractFactory("MockVRFCoordinator");
  const vrf = await Vrf.deploy();
  await vrf.waitForDeployment();

  const Jackpot = await ethers.getContractFactory("MegaJackpot");
  const jackpot = await Jackpot.deploy(
    await feed.getAddress(),
    await vrf.getAddress(),
    ethers.id("local-keyhash"),
    1n,
    true
  );
  await jackpot.waitForDeployment();
  const address = await jackpot.getAddress();

  // Seed some activity so the UI has data.
  await (await jackpot.connect(alice).deposit(ethers.ZeroAddress, { value: ethers.parseEther("5") })).wait();
  await (await jackpot.connect(bob).deposit(alice.address, { value: ethers.parseEther("2.5") })).wait();
  await (await jackpot.connect(carol).deposit(alice.address, { value: ethers.parseEther("0.75") })).wait();

  console.log(`MegaJackpot (local): ${address}`);
  console.log(`Mock feed: ${await feed.getAddress()}`);
  console.log(`Mock VRF:  ${await vrf.getAddress()}`);
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`\nweb/.env.local:`);
  console.log(`NEXT_PUBLIC_CHAIN=hardhat`);
  console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${address}`);
  console.log(`NEXT_PUBLIC_DEPLOY_BLOCK=0`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
