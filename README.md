# MegaJackpot — the $2.05B on-chain lottery

One pool. One draw. One wallet wins **$2,050,000,000**.

- Deposit **≥ 0.01 ETH**; your win chance is **exactly** your share of the pool.
- Withdraw any amount, anytime, **24h after your last deposit** — until lock-in.
- **2% fee** on deposits: 1.8% to the house, **0.2% to your referrer's jackpot balance**.
- When the pool hits **$2.05B** (Chainlink ETH/USD), a **6-hour countdown** locks all
  balances. Every cumulative **100 ETH** deposited resets it to 6h, capped at **30 days**.
- When it expires, **Chainlink VRF** draws the winner — provably fair, odds proportional
  to balances via an O(log n) Fenwick tree. Winner claims the entire pool.

```
├── contracts/   Hardhat + Solidity 0.8.24 — MegaJackpot.sol, mocks, 35 tests
└── web/         Next.js one-pager dApp — wagmi/viem, Tailwind, ENS, modals
```

## Why you can trust the contract

The entire trust story is in `contracts/contracts/MegaJackpot.sol` (~450 lines, readable):

| Property | How |
| --- | --- |
| No rug possible | Owner can only withdraw the accrued 1.8% fee. Zero admin functions touch player funds, phases, or parameters. |
| No upgrades, no pause | Contract is immutable. All parameters are `constant`/`immutable`. |
| Fair randomness | Chainlink VRF v2.5. Nobody — not even the owner — can predict or grind the outcome. A public `retryDraw()` re-requests randomness if VRF ever stalls 24h. |
| Exact proportional odds | Winner selection walks a Fenwick tree of balances: P(win) = balance / totalPool, verified in tests at exact boundaries. |
| Pull payments everywhere | Winner claims; owner claims; no loops over users, no forced sends. |
| Anyone can trigger the draw | `triggerDraw()` is permissionless once the countdown expires. |
| Reentrancy-safe | OpenZeppelin `ReentrancyGuard` + checks-effects-interactions (attack test included). |
| Price-feed failure ≠ frozen funds | If the ETH/USD feed goes stale, deposits/withdrawals keep working; only the threshold check pauses. |

**Scale**: the draw costs ~O(log n) reads even with millions of players (~150k gas total).
Each deposit updates ~27 Fenwick slots (~400–500k gas) — under $0.01 on Base, which is
why this runs on an L2, not mainnet (where each deposit would cost ~$30+).

## Chain choice: Base

- ETH-native (0.01 ETH minimum works as-is), fees well under a cent.
- Has both Chainlink **ETH/USD feeds** and **VRF v2.5** (mainnet Ethereum-grade security,
  L2 costs). Contracts are chain-agnostic — Arbitrum/OP work too.
- ENS still resolves: the frontend reads names/avatars from L1 mainnet.

## Run it locally

```bash
# 1. Contracts — 35 tests
cd contracts && npm install && npx hardhat test

# 2. Local chain with seeded deposits
npx hardhat node                                        # terminal A
npx hardhat run scripts/deploy-local.ts --network localhost   # terminal B

# 3. Frontend (web/.env.local is printed by the deploy script)
cd ../web && npm install && npm run dev
```

Integration check (frontend ABI vs deployed contract):
`cd web && node --experimental-strip-types scripts/verify-live.ts`

## Deploy to Base Sepolia / Base

1. Create + fund a **VRF v2.5 subscription** at [vrf.chain.link](https://vrf.chain.link).
2. Get the ETH/USD feed + VRF coordinator + key hash for your chain from
   [Chainlink docs](https://docs.chain.link/vrf/v2-5/supported-networks).
3. ```bash
   cd contracts
   ETH_USD_FEED=0x… VRF_COORDINATOR=0x… VRF_KEY_HASH=0x… VRF_SUB_ID=… \
   VRF_NATIVE_PAYMENT=true DEPLOYER_PRIVATE_KEY=0x… \
   npx hardhat run scripts/deploy.ts --network baseSepolia
   ```
4. Add the deployed contract as a **consumer** on the VRF subscription.
5. Verify the source on the block explorer (command printed by the script) — verified
   source is table stakes for trust.
6. Copy `web/.env.example` → `web/.env.local`, fill in address/block/chain, deploy `web/`
   (e.g. Vercel).

## Frontend features

Single page, everything else in modals:
- **Hero**: live progress bar to $2.05B (Chainlink-priced), phase-aware — flips to the
  red lock-in countdown, then VRF drawing state, then winner + claim button.
- **Live deposits** ticker + 24h volume, streamed from `Deposited` events.
- **Leaderboard modal**: 24h / 7d / all-time top depositors, with **ENS names + avatars**.
- **Deposit modal**: fee breakdown, projected win-chance preview, then a share screen
  ("I just entered the $2.05B jackpot — my odds: X%") with your referral link baked in.
- **Referral modal**: personal `?ref=0x…` link, lifetime earnings, referred-player count.
  Referral earnings compound your own odds — they're paid into your jackpot balance.
- **Withdraw modal**: with per-account 24h unlock timer.
- X/native-share/copy buttons on every key moment.

## Design decisions & interpretations

- "More than 100 ETH within the 6h window" is implemented as **cumulative** deposits in
  the current window (each reset starts a fresh window).
- A deposit after the deadline expires joins the pool but **cannot revive** the countdown.
- Referral credits **don't reset** the referrer's 24h withdrawal timer (only own deposits do).
- Once the countdown starts it never un-starts, even if ETH's price falls — deterministic
  lock-in beats an oscillating threshold.
- The $2.05B check uses the Chainlink feed with a 24h staleness guard.

## Before real money — non-negotiables

1. **Professional audit** (2+ firms for a pool this size) + a public bug bounty. The test
   suite is thorough but no substitute.
2. **Legal counsel.** This is a lottery: real-money gaming is licensed/regulated in nearly
   every jurisdiction (and banned in many). You will likely need geo-gating, KYC/AML, and
   a licensed operating entity. Shipping this without counsel is not an option.
3. **Indexer** (Ponder or a subgraph) for the leaderboard/ticker — client-side `getLogs`
   is fine early but public RPCs cap ranges as event history grows.
4. VRF subscription monitoring/top-ups, plus a keeper (e.g. Chainlink Automation) to call
   `triggerDraw()` the moment the countdown expires.
