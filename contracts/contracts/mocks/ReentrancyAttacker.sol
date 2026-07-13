// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMegaJackpot {
    function deposit(address referrer) external payable;

    function withdraw(uint256 amount) external;
}

/// @dev Attempts to re-enter withdraw() from its ETH receive hook.
contract ReentrancyAttacker {
    IMegaJackpot public immutable target;
    uint256 public reentryAttempts;
    bool public reentrySucceeded;

    constructor(address target_) {
        target = IMegaJackpot(target_);
    }

    function depositTo() external payable {
        target.deposit{value: msg.value}(address(0));
    }

    function attack(uint256 amount) external {
        target.withdraw(amount);
    }

    receive() external payable {
        reentryAttempts += 1;
        try target.withdraw(0.01 ether) {
            reentrySucceeded = true;
        } catch {}
    }
}
