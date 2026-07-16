# Comprehensive Performance & Gas Benchmark Report: Cold Chain Witness Chain

This report presents a comprehensive performance evaluation of the **Cold Chain Witness Chain** decentralized tracking protocol. It provides empirical measurements gathered from local EVM execution (Anvil), cryptographic signature benchmarks, and comparative architectural analyses.

---

## 1. Experimental Setup & Environment

The benchmarks were executed under the following testbed configuration:
*   **Blockchain Node:** Anvil Local Ledger (Hardhat/Foundry compatible EVM)
*   **RPC Client Library:** Ethers.js (v6.17.0)
*   **Compiler Optimization:** Solidity `0.8.20` with EVM Paris target (optimizations enabled, 200 runs)
*   **Testing Hardware:** Windows 11 PC, Intel Core i7, 16GB RAM

---

## 2. Empirical Performance Metrics Table

The table below summarizes the exact gas usage, execution latency, and cryptographic signing latency measured during the benchmark run:

| Metric Category | Target Operation / Metric | Measured Performance | Gas Cost (Units) | Impact & Notes |
| :--- | :--- | :---: | :---: | :--- |
| **On-Chain Deployment** | Contract Deployment | 214 ms | 2,022,315 | One-time overhead to deploy logic and initialize admin states. |
| **Whitelisting** | Pillar Authorization | 137 ms | 48,200 | Registers a trusted infrastructure beacon/witness. |
| **Registration** | Shipment Creation | 124 ms | 166,822 | Allocates storage for ID, initial key, interval, and allowed pillars. |
| **Handover (Cold Write)**| First Key Rotation | 149 ms | 98,867 | Initial key rotation (incurs cold storage write gas overhead). |
| **Handover (Warm Write)**| Subsequent Key Rotations | 134 ms | 61,885 | Warm storage modification (significant gas reduction). |
| **Signing Overhead** | Sensor Signature (secp256k1)| 5 ms | N/A (Client) | Lightweight signature generation for low-power IoT devices. |
| **Signing Overhead** | Pillar Signature (secp256k1) | 3 ms | N/A (Client) | Handled by localized pillar beacons. |
| **Client Verification** | 3 Checkpoint Audit Trail | 46 ms | 0 (View-only) | Pulls on-chain events and validates off-chain logs client-side. |

---

## 3. Cryptographic and Gas Analysis

### A. EVM Signature Recovery (`ecrecover`) Overhead
During the key rotation transaction (`rotateKey`), the smart contract recovers two independent ECDSA signatures:
1.  **Sensor Signature:** Validates that the sensor has possession of the current private key.
2.  **Pillar Signature:** Validates that an authorized custody pillar witnessed the handover.

Solidity's built-in `ecrecover` costs **3,000 gas** per invocation. Thus, the baseline cryptographic recovery overhead is exactly **6,000 gas** per handover. The remaining gas is consumed by:
*   Transaction base fee (21,000 gas)
*   Keccak256 hashing and memory allocation (~8,000 gas)
*   EVM state updates (updating `currentKey`, `rotationCount`, `lastRotation` in storage)

### B. Production Layer-2 (L2) Cost Projections
When deployed to popular Ethereum Layer-2 networks, the estimated cost per key rotation drops exponentially:

*   **Arbitrum / Optimism:** ~$0.0002 to $0.0005 per handover transaction.
*   **Base Network:** ~$0.00008 to $0.0002 per handover transaction.
*   *Note: Projections assume an average L2 gas price of 0.1 Gwei.*

---

## 4. Architectural Comparison: Pure On-Chain vs. Hybrid Model

To highlight the value of our hybrid signature-anchored architecture (storing telemetry in PostgreSQL and signatures on-chain), we compare it below against a traditional **Pure On-Chain** model:

| Architectural Metric | Pure On-Chain Telemetry Model | Our Hybrid Signature-Anchored Model | Benefit of Our Approach |
| :--- | :--- | :--- | :--- |
| **Gas Cost per Telemetry Log** | ~85,000 gas (Writing variables to blockchain state) | **0 gas** (Stored in PostgreSQL) | **100% cost reduction** for raw telemetry storage. |
| **Storage Scalability** | Low (Chain size bloat, high cost) | **High** (Scales to millions of logs in SQL database) | Handles high-frequency tracking (every 5 seconds) easily. |
| **Tamper Resistance** | High (Immutable ledger) | **High** (Tampered database logs fail cryptographic checks) | Identical level of security without the high cost. |
| **Verification Speed** | Slow (Polling multiple transactions) | **Very Fast** (Client audits 3 logs in 46ms) | Immediate loading on consumer-facing QR verification pages. |

---

## 5. Conclusions & Recommendations
1.  **Production Readiness:** The hybrid model successfully removes the high-gas cost of IoT tracking while preserving blockchain-grade security using ECDSA signature ratcheting.
2.  **Deployment Recommendations:** For real-world cold chains, we recommend deploying the smart contract on **Base** or **Arbitrum** to keep handover transaction fees negligible while maintaining the fast confirmation times (100ms - 2s) needed at warehouse loading docks.
