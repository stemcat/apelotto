import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

const E8 = 10n ** 8n;
const HOUR = 3600n;
const DAY = 24n * HOUR;
const parse = ethers.parseEther;

describe("MegaJackpot", () => {
  async function deployFixture() {
    const [owner, alice, bob, carol, dave, referrer] = await ethers.getSigners();

    const Feed = await ethers.getContractFactory("MockV3Aggregator");
    const feed = await Feed.deploy(8, 3500n * E8); // $3,500 / ETH

    const Vrf = await ethers.getContractFactory("MockVRFCoordinator");
    const vrf = await Vrf.deploy();

    const Jackpot = await ethers.getContractFactory("MegaJackpot");
    const jackpot = await Jackpot.deploy(
      await feed.getAddress(),
      await vrf.getAddress(),
      ethers.id("keyhash"),
      1n,
      true
    );

    return { jackpot, feed, vrf, owner, alice, bob, carol, dave, referrer };
  }

  /** Deposits A=100, B=200 then pumps the price so C's 300 ETH deposit crosses $2.05B. */
  async function countdownFixture() {
    const ctx = await loadFixture(deployFixture);
    const { jackpot, feed, alice, bob, carol } = ctx;
    await jackpot.connect(alice).deposit(ethers.ZeroAddress, { value: parse("100") });
    await jackpot.connect(bob).deposit(ethers.ZeroAddress, { value: parse("200") });
    await feed.setAnswer(4_000_000n * E8); // $4M per ETH -> pool of 588 ETH ≈ $2.35B
    await jackpot.connect(carol).deposit(ethers.ZeroAddress, { value: parse("300") });
    // credited balances: alice 98, bob 196, carol 294 (totalPool 588)
    return ctx;
  }

  describe("deposits", () => {
    it("rejects deposits below 0.01 ETH", async () => {
      const { jackpot, alice } = await loadFixture(deployFixture);
      await expect(
        jackpot.connect(alice).deposit(ethers.ZeroAddress, { value: parse("0.009") })
      ).to.be.revertedWithCustomError(jackpot, "BelowMinimumDeposit");
    });

    it("credits 98%, takes a 2% fee, updates the pool", async () => {
      const { jackpot, alice } = await loadFixture(deployFixture);
      await expect(jackpot.connect(alice).deposit(ethers.ZeroAddress, { value: parse("1") }))
        .to.emit(jackpot, "Deposited")
        .withArgs(alice.address, parse("1"), parse("0.98"), parse("0.02"), ethers.ZeroAddress, parse("0.98"), parse("0.98"));

      expect(await jackpot.balanceOf(alice.address)).to.equal(parse("0.98"));
      expect(await jackpot.totalPool()).to.equal(parse("0.98"));
      expect(await jackpot.pendingOwnerFees()).to.equal(parse("0.02"));
      expect(await jackpot.participantCount()).to.equal(1n);
    });

    it("rejects bare ETH transfers", async () => {
      const { jackpot, alice } = await loadFixture(deployFixture);
      await expect(
        alice.sendTransaction({ to: await jackpot.getAddress(), value: parse("1") })
      ).to.be.revertedWithCustomError(jackpot, "DepositsClosed");
    });

    it("computes win chance proportionally", async () => {
      const { jackpot, alice, bob } = await loadFixture(deployFixture);
      await jackpot.connect(alice).deposit(ethers.ZeroAddress, { value: parse("1") });
      await jackpot.connect(bob).deposit(ethers.ZeroAddress, { value: parse("3") });
      expect(await jackpot.winChancePpm(alice.address)).to.equal(250_000n); // 25%
      expect(await jackpot.winChancePpm(bob.address)).to.equal(750_000n); // 75%
    });
  });

  describe("referrals", () => {
    it("binds a referrer on first deposit and pays 10% of the fee into their balance", async () => {
      const { jackpot, alice, referrer } = await loadFixture(deployFixture);
      const value = parse("10");
      const fee = parse("0.2"); // 2%
      const refCut = parse("0.02"); // 10% of the fee

      await expect(jackpot.connect(alice).deposit(referrer.address, { value }))
        .to.emit(jackpot, "ReferrerSet")
        .withArgs(alice.address, referrer.address)
        .and.to.emit(jackpot, "ReferralCredited")
        .withArgs(referrer.address, alice.address, refCut);

      expect(await jackpot.balanceOf(referrer.address)).to.equal(refCut);
      expect(await jackpot.referralEarned(referrer.address)).to.equal(refCut);
      expect(await jackpot.referralCount(referrer.address)).to.equal(1n);
      expect(await jackpot.pendingOwnerFees()).to.equal(fee - refCut);
      // pool = depositor credit + referral credit
      expect(await jackpot.totalPool()).to.equal(parse("9.8") + refCut);
    });

    it("keeps paying the bound referrer on later deposits and ignores rebinding attempts", async () => {
      const { jackpot, alice, bob, referrer } = await loadFixture(deployFixture);
      await jackpot.connect(alice).deposit(referrer.address, { value: parse("10") });
      await jackpot.connect(alice).deposit(bob.address, { value: parse("10") });
      expect(await jackpot.referrerOf(alice.address)).to.equal(referrer.address);
      expect(await jackpot.balanceOf(referrer.address)).to.equal(parse("0.04"));
      expect(await jackpot.balanceOf(bob.address)).to.equal(0n);
    });

    it("ignores self-referral", async () => {
      const { jackpot, alice } = await loadFixture(deployFixture);
      await jackpot.connect(alice).deposit(alice.address, { value: parse("10") });
      expect(await jackpot.referrerOf(alice.address)).to.equal(ethers.ZeroAddress);
      expect(await jackpot.balanceOf(alice.address)).to.equal(parse("9.8"));
    });

    it("lets a pure referrer withdraw earnings immediately (credits never lock them)", async () => {
      const { jackpot, alice, referrer } = await loadFixture(deployFixture);
      await jackpot.connect(alice).deposit(referrer.address, { value: parse("10") });
      // referrer never deposited, so no 24h timer applies to them
      await expect(jackpot.connect(referrer).withdraw(parse("0.02"))).to.changeEtherBalance(
        referrer,
        parse("0.02")
      );
    });
  });

  describe("withdrawals", () => {
    it("blocks withdrawal within 24h of the last deposit", async () => {
      const { jackpot, alice } = await loadFixture(deployFixture);
      await jackpot.connect(alice).deposit(ethers.ZeroAddress, { value: parse("1") });
      await expect(jackpot.connect(alice).withdraw(parse("0.5"))).to.be.revertedWithCustomError(
        jackpot,
        "WithdrawTooSoon"
      );
      await time.increase(23n * HOUR);
      await expect(jackpot.connect(alice).withdraw(parse("0.5"))).to.be.revertedWithCustomError(
        jackpot,
        "WithdrawTooSoon"
      );
    });

    it("allows partial and full withdrawal after 24h", async () => {
      const { jackpot, alice } = await loadFixture(deployFixture);
      await jackpot.connect(alice).deposit(ethers.ZeroAddress, { value: parse("1") });
      await time.increase(DAY + 1n);

      await expect(jackpot.connect(alice).withdraw(parse("0.5"))).to.changeEtherBalance(
        alice,
        parse("0.5")
      );
      expect(await jackpot.totalPool()).to.equal(parse("0.48"));

      await jackpot.connect(alice).withdraw(parse("0.48"));
      expect(await jackpot.balanceOf(alice.address)).to.equal(0n);
      expect(await jackpot.totalPool()).to.equal(0n);
    });

    it("a new deposit resets the 24h timer", async () => {
      const { jackpot, alice } = await loadFixture(deployFixture);
      await jackpot.connect(alice).deposit(ethers.ZeroAddress, { value: parse("1") });
      await time.increase(DAY + 1n);
      await jackpot.connect(alice).deposit(ethers.ZeroAddress, { value: parse("1") });
      await expect(jackpot.connect(alice).withdraw(parse("0.1"))).to.be.revertedWithCustomError(
        jackpot,
        "WithdrawTooSoon"
      );
    });

    it("rejects overdrawing", async () => {
      const { jackpot, alice } = await loadFixture(deployFixture);
      await jackpot.connect(alice).deposit(ethers.ZeroAddress, { value: parse("1") });
      await time.increase(DAY + 1n);
      await expect(jackpot.connect(alice).withdraw(parse("2"))).to.be.revertedWithCustomError(
        jackpot,
        "InsufficientBalance"
      );
    });

    it("blocks reentrancy", async () => {
      const { jackpot, alice } = await loadFixture(deployFixture);
      const Attacker = await ethers.getContractFactory("ReentrancyAttacker");
      const attacker = await Attacker.deploy(await jackpot.getAddress());
      await attacker.connect(alice).depositTo({ value: parse("1") });
      await time.increase(DAY + 1n);

      await attacker.attack(parse("0.5"));
      expect(await attacker.reentryAttempts()).to.equal(1n);
      expect(await attacker.reentrySucceeded()).to.equal(false);
    });
  });

  describe("countdown", () => {
    it("starts the 6h countdown when the pool crosses $2.05B", async () => {
      const { jackpot } = await countdownFixture();
      expect(await jackpot.phase()).to.equal(1n); // Countdown
      const now = BigInt(await time.latest());
      expect(await jackpot.countdownDeadline()).to.equal(now + 6n * HOUR);
      expect(await jackpot.countdownHardDeadline()).to.equal(now + 30n * DAY);
    });

    it("locks withdrawals once the countdown starts", async () => {
      const { jackpot, alice } = await countdownFixture();
      await time.increase(DAY + 1n);
      await expect(jackpot.connect(alice).withdraw(parse("1"))).to.be.revertedWithCustomError(
        jackpot,
        "WithdrawalsLocked"
      );
    });

    it("does not start the countdown when the price feed is stale or reverting", async () => {
      const { jackpot, feed, alice } = await loadFixture(deployFixture);
      await feed.setAnswer(4_000_000n * E8);
      await feed.setUpdatedAt(BigInt(await time.latest()) - 25n * HOUR);
      await jackpot.connect(alice).deposit(ethers.ZeroAddress, { value: parse("600") });
      expect(await jackpot.phase()).to.equal(0n); // still Open

      await feed.setShouldRevert(true);
      await jackpot.connect(alice).deposit(ethers.ZeroAddress, { value: parse("1") });
      expect(await jackpot.phase()).to.equal(0n);
    });

    it("resets the deadline after 100 ETH of cumulative window deposits", async () => {
      const { jackpot, dave } = await countdownFixture();
      const originalDeadline = await jackpot.countdownDeadline();

      await time.increase(2n * HOUR);
      await jackpot.connect(dave).deposit(ethers.ZeroAddress, { value: parse("60") });
      expect(await jackpot.countdownDeadline()).to.equal(originalDeadline); // 60 < 100

      await jackpot.connect(dave).deposit(ethers.ZeroAddress, { value: parse("50") });
      const now = BigInt(await time.latest());
      expect(await jackpot.countdownDeadline()).to.equal(now + 6n * HOUR); // 110 >= 100
      expect(await jackpot.windowDeposits()).to.equal(0n); // window restarts
    });

    it("caps extensions at the 30-day hard deadline", async () => {
      const { jackpot, dave } = await countdownFixture();
      const hardDeadline = await jackpot.countdownHardDeadline();

      // Keep the countdown alive with 100 ETH every 5h until the cap binds.
      for (let i = 0; i < 150; i++) {
        await time.increase(5n * HOUR);
        await jackpot.connect(dave).deposit(ethers.ZeroAddress, { value: parse("100") });
        if ((await jackpot.countdownDeadline()) === hardDeadline) break;
      }
      expect(await jackpot.countdownDeadline()).to.equal(hardDeadline);
    });

    it("does not revive an expired countdown", async () => {
      const { jackpot, dave } = await countdownFixture();
      const deadline = await jackpot.countdownDeadline();
      await time.increase(7n * HOUR); // past the deadline, draw is due
      await jackpot.connect(dave).deposit(ethers.ZeroAddress, { value: parse("200") });
      expect(await jackpot.countdownDeadline()).to.equal(deadline);
    });
  });

  describe("draw", () => {
    it("cannot be triggered before the deadline", async () => {
      const { jackpot } = await countdownFixture();
      await expect(jackpot.triggerDraw()).to.be.revertedWithCustomError(jackpot, "CountdownNotExpired");
    });

    it("cannot be triggered while Open", async () => {
      const { jackpot } = await loadFixture(deployFixture);
      await expect(jackpot.triggerDraw()).to.be.revertedWithCustomError(jackpot, "WrongPhase");
    });

    async function drawReady() {
      const ctx = await countdownFixture();
      await time.increase(6n * HOUR + 1n);
      await ctx.jackpot.triggerDraw();
      return ctx;
    }

    it("requests VRF randomness and blocks further deposits", async () => {
      const { jackpot, vrf, dave } = await drawReady();
      expect(await jackpot.phase()).to.equal(2n); // Drawing
      expect(await jackpot.pendingRequestId()).to.equal(await vrf.lastRequestId());
      await expect(
        jackpot.connect(dave).deposit(ethers.ZeroAddress, { value: parse("1") })
      ).to.be.revertedWithCustomError(jackpot, "DepositsClosed");
    });

    it("only the coordinator can fulfill, and only the pending request", async () => {
      const { jackpot, vrf, alice } = await drawReady();
      await expect(
        jackpot.connect(alice).rawFulfillRandomWords(1n, [42n])
      ).to.be.revertedWithCustomError(jackpot, "OnlyCoordinator");
      await expect(
        vrf.fulfill(await jackpot.getAddress(), 999n, 42n)
      ).to.be.revertedWithCustomError(jackpot, "UnknownRequest");
    });

    // Credited balances: alice 98 | bob 196 | carol 294. Cumulative: 98, 294, 588.
    const boundaryCases: Array<[string, bigint, "alice" | "bob" | "carol"]> = [
      ["word 0 selects the first depositor", 0n, "alice"],
      ["word at alice's upper boundary selects bob", parse("98"), "bob"],
      ["word just below alice's boundary selects alice", parse("98") - 1n, "alice"],
      ["word at bob's upper boundary selects carol", parse("294"), "carol"],
      ["word at pool-1 selects the last depositor", parse("588") - 1n, "carol"],
      ["word equal to the pool wraps around to alice", parse("588"), "alice"],
    ];

    for (const [name, word, expected] of boundaryCases) {
      it(`weighted selection: ${name}`, async () => {
        const ctx = await drawReady();
        await ctx.vrf.fulfill(await ctx.jackpot.getAddress(), 1n, word);
        expect(await ctx.jackpot.winner()).to.equal(ctx[expected].address);
        expect(await ctx.jackpot.prizeAmount()).to.equal(parse("588"));
        expect(await ctx.jackpot.phase()).to.equal(3n); // Complete
      });
    }

    it("never selects a participant who withdrew to zero", async () => {
      const { jackpot, feed, alice, bob, carol } = await loadFixture(deployFixture);
      await jackpot.connect(alice).deposit(ethers.ZeroAddress, { value: parse("100") });
      await jackpot.connect(bob).deposit(ethers.ZeroAddress, { value: parse("200") });
      await time.increase(DAY + 1n);
      await jackpot.connect(alice).withdraw(parse("98")); // alice fully out
      await feed.setAnswer(10_000_000n * E8);
      await jackpot.connect(carol).deposit(ethers.ZeroAddress, { value: parse("300") });
      await time.increase(6n * HOUR + 1n);
      await jackpot.triggerDraw();

      const vrf = await ethers.getContractAt(
        "MockVRFCoordinator",
        await jackpot.vrfCoordinator()
      );
      // target 0 lands on the first participant with weight > 0: bob, not alice
      await vrf.fulfill(await jackpot.getAddress(), 1n, 0n);
      expect(await jackpot.winner()).to.equal(bob.address);
    });

    it("lets the winner (and only the winner) claim the full pool exactly once", async () => {
      const { jackpot, vrf, alice, bob } = await drawReady();
      await vrf.fulfill(await jackpot.getAddress(), 1n, 0n); // alice wins

      await expect(jackpot.connect(bob).claimPrize()).to.be.revertedWithCustomError(
        jackpot,
        "NothingToClaim"
      );
      await expect(jackpot.connect(alice).claimPrize()).to.changeEtherBalance(
        alice,
        parse("588")
      );
      await expect(jackpot.connect(alice).claimPrize()).to.be.revertedWithCustomError(
        jackpot,
        "NothingToClaim"
      );
    });

    it("allows a VRF retry after 24h of silence, invalidating the old request", async () => {
      const { jackpot, vrf } = await drawReady();
      await expect(jackpot.retryDraw()).to.be.revertedWithCustomError(jackpot, "RetryTooSoon");
      await time.increase(DAY + 1n);
      await jackpot.retryDraw();
      expect(await jackpot.pendingRequestId()).to.equal(2n);
      await expect(
        vrf.fulfill(await jackpot.getAddress(), 1n, 0n)
      ).to.be.revertedWithCustomError(jackpot, "UnknownRequest");
      await vrf.fulfill(await jackpot.getAddress(), 2n, 0n);
      expect(await jackpot.phase()).to.equal(3n);
    });
  });

  describe("owner fees", () => {
    it("lets only the owner pull accrued fees", async () => {
      const { jackpot, owner, alice, bob } = await loadFixture(deployFixture);
      await jackpot.connect(alice).deposit(ethers.ZeroAddress, { value: parse("100") });
      await expect(jackpot.connect(bob).withdrawOwnerFees(bob.address)).to.be.revertedWithCustomError(
        jackpot,
        "OwnableUnauthorizedAccount"
      );
      await expect(jackpot.connect(owner).withdrawOwnerFees(owner.address)).to.changeEtherBalance(
        owner,
        parse("2")
      );
      expect(await jackpot.pendingOwnerFees()).to.equal(0n);
    });

    it("owner fees never touch the prize pool", async () => {
      const { jackpot, alice } = await loadFixture(deployFixture);
      await jackpot.connect(alice).deposit(ethers.ZeroAddress, { value: parse("100") });
      const contractBalance = await ethers.provider.getBalance(await jackpot.getAddress());
      expect(contractBalance).to.equal((await jackpot.totalPool()) + (await jackpot.pendingOwnerFees()));
    });
  });

  describe("Fenwick tree integrity", () => {
    it("prefix sums always match participant balances through mixed deposits/withdrawals", async () => {
      const { jackpot } = await loadFixture(deployFixture);
      const signers = (await ethers.getSigners()).slice(4, 16);

      // deterministic pseudo-random activity
      let seed = 42n;
      const rand = () => {
        seed = (seed * 6364136223846793005n + 1442695040888963407n) % 2n ** 64n;
        return seed;
      };

      for (let round = 0; round < 3; round++) {
        for (const signer of signers) {
          const amount = parse("0.01") + (rand() % parse("5"));
          await jackpot.connect(signer).deposit(ethers.ZeroAddress, { value: amount });
        }
        await time.increase(DAY + 1n);
        for (const signer of signers) {
          if (rand() % 2n === 0n) {
            const balance = await jackpot.balanceOf(signer.address);
            const amount = (balance * (rand() % 100n)) / 100n;
            if (amount > 0n) await jackpot.connect(signer).withdraw(amount);
          }
        }
      }

      const count = await jackpot.participantCount();
      let running = 0n;
      for (let i = 1n; i <= count; i++) {
        const addr = await jackpot.participantAt(i - 1n);
        running += await jackpot.balanceOf(addr);
        expect(await jackpot.prefixSum(i)).to.equal(running);
      }
      expect(await jackpot.totalPool()).to.equal(running);
    });
  });
});
