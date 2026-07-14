// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/ColdChainRatchet.sol";

contract DeployRatchet is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        ColdChainRatchet ratchet = new ColdChainRatchet();

        console.log("ColdChainRatchet deployed at:", address(ratchet));

        vm.stopBroadcast();
    }
}
