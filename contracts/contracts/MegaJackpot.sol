// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";
import {IVRFCoordinatorV2Plus} from "./interfaces/IVRFCoordinatorV2Plus.sol";

/**
 * @title MegaJackpot
 * @notice A single-draw, proportional-odds ETH lottery targeting a $2.05B jackpot.
 *
 * Rules:
 *  - Anyone may deposit >= 0.01 ETH. 100% of the deposit is credited to the
 *    depositor's balance — no fee is taken up front.
 *  - A depositor's chance of winning is exactly balance / totalPool.
 *  - While the jackpot is below target, anyone may withdraw any part of their
 *    balance 24 hours after their own last deposit, and gets it back in full.
 *    Nobody loses a single wei unless the draw actually happens.
 *  - When the pool's USD value (Chainlink ETH/USD) reaches $2.05B, a 6-hour
 *    lock-in countdown starts and withdrawals stop. Each cumulative 100 ETH of
 *    new deposits within the current window resets the countdown to 6 hours,
 *    capped at 30 days after lock-in began.
 *  - When the countdown expires anyone may trigger the draw. Chainlink VRF
 *    supplies randomness; a Fenwick tree picks the winner in O(log n) with
 *    probability proportional to balance.
 *  - Fees exist ONLY at the draw, taken from the final locked pool:
 *      - 2% of the pool is the house fee; the winner claims the remaining 98%.
 *      - Referrers earn 10% of the fee their referred players generated:
 *        0.2% of each referred player's final locked balance, claimable after
 *        the draw. The owner receives the rest of the fee.
 *
 * Trust model: parameters are immutable, the owner can only collect the fee
 * after a completed draw, and has no control over user funds, the draw, or
 * the randomness. There is no pause switch and no upgradeability.
 */
contract MegaJackpot is ReentrancyGuard, Ownable2Step {
    // ---------------------------------------------------------------- errors
    error BelowMinimumDeposit();
    error DepositsClosed();
    error WithdrawalsLocked();
    error WithdrawTooSoon(uint256 unlockTime);
    error InsufficientBalance();
    error ZeroAmount();
    error CountdownNotExpired();
    error WrongPhase();
    error OnlyCoordinator();
    error UnknownRequest();
    error NothingToClaim();
    error TransferFailed();
    error TooManyParticipants();
    error RetryTooSoon();

    // ---------------------------------------------------------------- types
    enum Phase {
        Open, // deposits + delayed withdrawals
        Countdown, // target reached: deposits only, withdrawals locked
        Drawing, // VRF randomness requested
        Complete // winner selected
    }

    // ------------------------------------------------------------ constants
    uint256 public constant MIN_DEPOSIT = 0.01 ether;
    uint256 public constant FEE_BPS = 200; // 2% of the final pool, charged only at the draw
    /// @dev 10% of the 2% fee = 0.2% of each referred player's locked balance.
    uint256 public constant REFERRAL_FEE_BPS = 20;
    uint256 public constant BPS = 10_000;
    uint256 public constant WITHDRAW_DELAY = 24 hours;
    uint256 public constant JACKPOT_TARGET_USD = 2_050_000_000; // whole dollars
    uint256 public constant COUNTDOWN_DURATION = 6 hours;
    uint256 public constant COUNTDOWN_RESET_THRESHOLD = 100 ether; // cumulative per window
    uint256 public constant MAX_COUNTDOWN_EXTENSION = 30 days;
    uint256 public constant PRICE_STALE_AFTER = 24 hours;
    uint256 public constant VRF_RETRY_DELAY = 24 hours;

    /// @dev Fenwick tree capacity: 2^27 = ~134M participants.
    uint256 public constant MAX_PARTICIPANTS = 1 << 27;

    uint16 private constant VRF_CONFIRMATIONS = 3;
    uint32 private constant VRF_CALLBACK_GAS = 500_000;
    bytes4 private constant VRF_EXTRA_ARGS_V1_TAG = bytes4(keccak256("VRF ExtraArgsV1"));

    // ----------------------------------------------------------- immutables
    AggregatorV3Interface public immutable ethUsdFeed;
    IVRFCoordinatorV2Plus public immutable vrfCoordinator;
    bytes32 public immutable vrfKeyHash;
    uint256 public immutable vrfSubscriptionId;
    bool public immutable vrfNativePayment;
    uint8 public immutable feedDecimals;

    // ---------------------------------------------------------------- state
    Phase public phase;

    /// @dev Sum of all balances. The contract holds exactly this while Open/Countdown.
    uint256 public totalPool;

    mapping(address => uint256) public balanceOf;
    mapping(address => uint256) public lastDepositAt;
    mapping(address => address) public referrerOf;
    mapping(address => uint256) public referralCount;
    /// @dev Live sum of balances of everyone `referrer` referred; basis of their draw reward.
    mapping(address => uint256) public referredBalance;
    uint256 public totalReferredBalance;
    mapping(address => bool) public referralRewardClaimed;

    address[] private _participants;
    /// @dev 1-based index into _participants; 0 means "never deposited".
    mapping(address => uint256) private _participantIndex;
    /// @dev Fenwick / binary-indexed tree of balances, keyed by 1-based participant index.
    mapping(uint256 => uint256) private _tree;

    // countdown
    uint256 public countdownDeadline;
    uint256 public countdownHardDeadline;
    uint256 public windowDeposits; // deposits accumulated in the current 6h window

    // draw
    uint256 public pendingRequestId;
    uint256 public drawRequestedAt;
    address public winner;
    uint256 public prizeAmount; // 98% of the final pool
    uint256 public pendingOwnerFees; // set at the draw, claimable after
    uint256 public winningRandomWord;
    bool public prizeClaimed;

    // --------------------------------------------------------------- events
    event Deposited(
        address indexed account,
        uint256 amount,
        address indexed referrer,
        uint256 newBalance,
        uint256 newTotalPool
    );
    event Withdrawn(address indexed account, uint256 amount, uint256 newBalance, uint256 newTotalPool);
    event ReferrerSet(address indexed account, address indexed referrer);
    event CountdownStarted(uint256 deadline, uint256 hardDeadline, uint256 totalPool);
    event CountdownExtended(uint256 newDeadline, uint256 windowDepositTotal);
    event DrawRequested(uint256 indexed requestId, uint256 totalPool, uint256 participantCount);
    event WinnerSelected(address indexed winner, uint256 prize, uint256 fee, uint256 randomWord);
    event PrizeClaimed(address indexed winner, uint256 amount);
    event ReferralRewardClaimed(address indexed referrer, uint256 amount);
    event OwnerFeesWithdrawn(address indexed to, uint256 amount);

    // ---------------------------------------------------------- constructor
    constructor(
        address ethUsdFeed_,
        address vrfCoordinator_,
        bytes32 vrfKeyHash_,
        uint256 vrfSubscriptionId_,
        bool vrfNativePayment_
    ) Ownable(msg.sender) {
        ethUsdFeed = AggregatorV3Interface(ethUsdFeed_);
        vrfCoordinator = IVRFCoordinatorV2Plus(vrfCoordinator_);
        vrfKeyHash = vrfKeyHash_;
        vrfSubscriptionId = vrfSubscriptionId_;
        vrfNativePayment = vrfNativePayment_;
        feedDecimals = AggregatorV3Interface(ethUsdFeed_).decimals();
    }

    // --------------------------------------------------------------- deposit
    /**
     * @notice Enter the lottery (or top up). 100% of the deposit is credited.
     *         Pass a referrer to permanently bind one on your first deposit;
     *         pass address(0) for none.
     */
    function deposit(address referrer) external payable nonReentrant {
        if (phase != Phase.Open && phase != Phase.Countdown) revert DepositsClosed();
        if (msg.value < MIN_DEPOSIT) revert BelowMinimumDeposit();

        address account = msg.sender;
        _registerParticipant(account);

        // Bind referrer once, on the first deposit only.
        if (
            referrer != address(0) &&
            referrer != account &&
            referrerOf[account] == address(0) &&
            balanceOf[account] == 0
        ) {
            referrerOf[account] = referrer;
            referralCount[referrer] += 1;
            emit ReferrerSet(account, referrer);
        }

        balanceOf[account] += msg.value;
        lastDepositAt[account] = block.timestamp;
        _treeAdd(_participantIndex[account], msg.value);
        totalPool += msg.value;

        address boundReferrer = referrerOf[account];
        if (boundReferrer != address(0)) {
            referredBalance[boundReferrer] += msg.value;
            totalReferredBalance += msg.value;
        }

        emit Deposited(account, msg.value, boundReferrer, balanceOf[account], totalPool);

        _updateCountdown(msg.value);
    }

    /// @dev Reject bare transfers so every wei is accounted for via deposit().
    receive() external payable {
        revert DepositsClosed();
    }

    // -------------------------------------------------------------- withdraw
    /**
     * @notice Withdraw any part of your balance, in full — no fee. Only while
     *         the jackpot is Open and >= 24h after your own last deposit.
     */
    function withdraw(uint256 amount) external nonReentrant {
        if (phase != Phase.Open) revert WithdrawalsLocked();
        if (amount == 0) revert ZeroAmount();

        address account = msg.sender;
        uint256 unlockTime = lastDepositAt[account] + WITHDRAW_DELAY;
        if (block.timestamp < unlockTime) revert WithdrawTooSoon(unlockTime);
        if (amount > balanceOf[account]) revert InsufficientBalance();

        balanceOf[account] -= amount;
        totalPool -= amount;
        _treeSub(_participantIndex[account], amount);

        address boundReferrer = referrerOf[account];
        if (boundReferrer != address(0)) {
            referredBalance[boundReferrer] -= amount;
            totalReferredBalance -= amount;
        }

        emit Withdrawn(account, amount, balanceOf[account], totalPool);

        (bool ok, ) = account.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    // ------------------------------------------------------------------ draw
    /// @notice Anyone may trigger the draw once the lock-in countdown expires.
    function triggerDraw() external nonReentrant {
        if (phase != Phase.Countdown) revert WrongPhase();
        if (block.timestamp < countdownDeadline) revert CountdownNotExpired();
        phase = Phase.Drawing;
        _requestRandomness();
    }

    /// @notice Safety valve: re-request randomness if VRF hasn't answered in 24h.
    function retryDraw() external nonReentrant {
        if (phase != Phase.Drawing) revert WrongPhase();
        if (block.timestamp < drawRequestedAt + VRF_RETRY_DELAY) revert RetryTooSoon();
        _requestRandomness();
    }

    /// @dev Chainlink VRF v2.5 callback entrypoint. This is the only moment
    ///      fees come into existence: 2% of the locked pool, of which referrer
    ///      rewards (0.2% of referred balances) are carved out first.
    function rawFulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) external {
        if (msg.sender != address(vrfCoordinator)) revert OnlyCoordinator();
        if (requestId != pendingRequestId) revert UnknownRequest();
        if (phase != Phase.Drawing) revert WrongPhase();

        uint256 word = randomWords[0];
        uint256 target = word % totalPool; // in [0, totalPool)
        uint256 winnerIndex = _treeFind(target);
        address selected = _participants[winnerIndex - 1];

        uint256 fee = (totalPool * FEE_BPS) / BPS;
        // Always <= fee: totalReferredBalance <= totalPool and 0.2% < 2%.
        uint256 referralPool = (totalReferredBalance * REFERRAL_FEE_BPS) / BPS;

        winner = selected;
        prizeAmount = totalPool - fee;
        pendingOwnerFees = fee - referralPool;
        winningRandomWord = word;
        phase = Phase.Complete;

        emit WinnerSelected(selected, prizeAmount, fee, word);
    }

    /// @notice The winner pulls the jackpot (98% of the final pool).
    function claimPrize() external nonReentrant {
        if (phase != Phase.Complete) revert WrongPhase();
        if (msg.sender != winner || prizeClaimed) revert NothingToClaim();
        prizeClaimed = true;

        emit PrizeClaimed(winner, prizeAmount);

        (bool ok, ) = winner.call{value: prizeAmount}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice After the draw, referrers pull 0.2% of their referred players'
    ///         final locked balances (10% of the fee those players generated).
    function claimReferralReward() external nonReentrant {
        if (phase != Phase.Complete) revert WrongPhase();
        if (referralRewardClaimed[msg.sender]) revert NothingToClaim();

        uint256 reward = (referredBalance[msg.sender] * REFERRAL_FEE_BPS) / BPS;
        if (reward == 0) revert NothingToClaim();
        referralRewardClaimed[msg.sender] = true;

        emit ReferralRewardClaimed(msg.sender, reward);

        (bool ok, ) = msg.sender.call{value: reward}("");
        if (!ok) revert TransferFailed();
    }

    // ------------------------------------------------------------------ fees
    /// @notice Owner fee exists only after a completed draw.
    function withdrawOwnerFees(address to) external onlyOwner nonReentrant {
        if (phase != Phase.Complete) revert WrongPhase();
        uint256 amount = pendingOwnerFees;
        if (amount == 0) revert NothingToClaim();
        pendingOwnerFees = 0;

        emit OwnerFeesWithdrawn(to, amount);

        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    // ----------------------------------------------------------------- views
    function participantCount() external view returns (uint256) {
        return _participants.length;
    }

    function participantAt(uint256 index) external view returns (address) {
        return _participants[index];
    }

    /// @notice Pool value in whole USD, and the raw feed answer. Reverts if the feed is stale.
    function poolUsdValue() public view returns (uint256 usd, int256 ethUsdPrice) {
        (, int256 answer, , uint256 updatedAt, ) = ethUsdFeed.latestRoundData();
        if (answer <= 0 || block.timestamp - updatedAt > PRICE_STALE_AFTER) {
            revert("stale price");
        }
        usd = (totalPool * uint256(answer)) / (1e18 * (10 ** feedDecimals));
        ethUsdPrice = answer;
    }

    /// @notice Chance of `account` winning, in parts-per-million.
    function winChancePpm(address account) external view returns (uint256) {
        if (totalPool == 0) return 0;
        return (balanceOf[account] * 1_000_000) / totalPool;
    }

    /// @notice Referral reward for `account`: a live projection before the
    ///         draw, the exact claimable amount after it.
    function referralRewardOf(address account) public view returns (uint256) {
        return (referredBalance[account] * REFERRAL_FEE_BPS) / BPS;
    }

    function accountInfo(address account)
        external
        view
        returns (
            uint256 balance,
            uint256 withdrawUnlockAt,
            address referrer,
            uint256 referredVolume,
            uint256 referralReward,
            uint256 referredUsers
        )
    {
        balance = balanceOf[account];
        withdrawUnlockAt = lastDepositAt[account] == 0 ? 0 : lastDepositAt[account] + WITHDRAW_DELAY;
        referrer = referrerOf[account];
        referredVolume = referredBalance[account];
        referralReward = referralRewardOf(account);
        referredUsers = referralCount[account];
    }

    /// @dev Exposed for tests/verification: cumulative balance of participants [1..index].
    function prefixSum(uint256 index) external view returns (uint256 sum) {
        for (uint256 i = index; i > 0; i -= i & (~i + 1)) {
            sum += _tree[i];
        }
    }

    // ------------------------------------------------------------- internals
    function _registerParticipant(address account) private {
        if (_participantIndex[account] != 0) return;
        if (_participants.length >= MAX_PARTICIPANTS) revert TooManyParticipants();
        _participants.push(account);
        _participantIndex[account] = _participants.length;
    }

    /**
     * @dev Countdown bookkeeping, run after every deposit.
     *      - Open -> Countdown when the pool crosses $2.05B (the crossing
     *        deposit does not count toward the first reset window).
     *      - In Countdown, once cumulative window deposits reach 100 ETH the
     *        deadline resets to now+6h, capped at the 30-day hard deadline.
     *      - If the price feed is stale or broken, deposits keep working and
     *        the threshold check is simply skipped until the feed recovers.
     */
    function _updateCountdown(uint256 grossDeposit) private {
        if (phase == Phase.Open) {
            if (_poolReachedTarget()) {
                countdownDeadline = block.timestamp + COUNTDOWN_DURATION;
                countdownHardDeadline = block.timestamp + MAX_COUNTDOWN_EXTENSION;
                windowDeposits = 0;
                phase = Phase.Countdown;
                emit CountdownStarted(countdownDeadline, countdownHardDeadline, totalPool);
            }
        } else {
            // Phase.Countdown (deposit() only allows Open or Countdown).
            // Once the deadline has passed the draw is due: late deposits still
            // join the pool but can no longer revive the countdown.
            if (block.timestamp >= countdownDeadline) return;
            windowDeposits += grossDeposit;
            if (windowDeposits >= COUNTDOWN_RESET_THRESHOLD) {
                uint256 extendedTotal = windowDeposits;
                uint256 newDeadline = block.timestamp + COUNTDOWN_DURATION;
                if (newDeadline > countdownHardDeadline) newDeadline = countdownHardDeadline;
                if (newDeadline > countdownDeadline) countdownDeadline = newDeadline;
                windowDeposits = 0;
                emit CountdownExtended(countdownDeadline, extendedTotal);
            }
        }
    }

    function _poolReachedTarget() private view returns (bool) {
        try ethUsdFeed.latestRoundData() returns (uint80, int256 answer, uint256, uint256 updatedAt, uint80) {
            if (answer <= 0 || block.timestamp - updatedAt > PRICE_STALE_AFTER) return false;
            return (totalPool * uint256(answer)) / (1e18 * (10 ** feedDecimals)) >= JACKPOT_TARGET_USD;
        } catch {
            return false;
        }
    }

    function _requestRandomness() private {
        drawRequestedAt = block.timestamp;
        pendingRequestId = vrfCoordinator.requestRandomWords(
            IVRFCoordinatorV2Plus.RandomWordsRequest({
                keyHash: vrfKeyHash,
                subId: vrfSubscriptionId,
                requestConfirmations: VRF_CONFIRMATIONS,
                callbackGasLimit: VRF_CALLBACK_GAS,
                numWords: 1,
                extraArgs: abi.encodeWithSelector(VRF_EXTRA_ARGS_V1_TAG, vrfNativePayment)
            })
        );
        emit DrawRequested(pendingRequestId, totalPool, _participants.length);
    }

    // --------------------------------------------------- Fenwick tree (BIT)
    // Fixed-capacity binary indexed tree over 1-based participant indices.
    // All nodes start at zero, so newly appended participants need no
    // initialization. Updates and queries are O(log2(MAX_PARTICIPANTS)) = 27.

    function _treeAdd(uint256 index, uint256 amount) private {
        for (uint256 i = index; i <= MAX_PARTICIPANTS; i += i & (~i + 1)) {
            _tree[i] += amount;
        }
    }

    function _treeSub(uint256 index, uint256 amount) private {
        for (uint256 i = index; i <= MAX_PARTICIPANTS; i += i & (~i + 1)) {
            _tree[i] -= amount;
        }
    }

    /**
     * @dev Returns the smallest 1-based index whose cumulative balance
     *      exceeds `target`. Requires target < totalPool. Zero-balance
     *      participants can never be selected.
     */
    function _treeFind(uint256 target) private view returns (uint256) {
        uint256 index = 0;
        uint256 remaining = target;
        for (uint256 mask = MAX_PARTICIPANTS; mask > 0; mask >>= 1) {
            uint256 next = index + mask;
            if (next <= MAX_PARTICIPANTS && _tree[next] <= remaining) {
                index = next;
                remaining -= _tree[next];
            }
        }
        return index + 1;
    }
}
