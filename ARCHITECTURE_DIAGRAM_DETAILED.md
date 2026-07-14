# Cold Chain Witness — Architecture Diagram (Detailed)

## Overview

This document describes the Cold Chain Witness system architecture (SupplyChain v2 + Witness/Relayer pattern) and explains how components interact for gasless rotations, nonce management, and security guarantees.

**Primary goals:**

- Maintain an auditable chain-of-custody for a shipment via key rotations.
- Allow resource-constrained sensors to perform rotations without holding ETH (gasless meta-transactions).
- Prevent replay attacks and unauthorized rotations through rotation counters and dual-signature verification.

---

## Components

- **SensorDevice** (on-device key / wallet)

  - Holds the current sensor private key that represents the shipment identity.
  - Signs rotation intents (off-chain) using the message hash defined by the smart contract.
  - Does not need ETH; only needs the ability to sign messages.

- **WitnessNode (Pillar)**

  - Off-chain authority nodes (TruckBeacon, WarehousePillar) that verify physical custody events.
  - Each Pillar has a wallet and signs the same rotation intent (their signature is submitted on-chain).

- **Admin / Relayer**

  - A funded account that submits transactions on-chain and pays gas.
  - Acts as the trusted relayer in tests (can be permissioned in production or run as a decentralized relayer).
  - Runs `NonceManager` logic to avoid race conditions on fast local chains (Anvil).

- **SupplyChain (Smart Contract)**

  - Stores shipment records: currentKey, rotationCount, lastPillar, lastRotation, active/completed flags.
  - Exposes `registerShipment`, `authorizePillar`, `rotateKey`, `isPillarAuthorized`, `getShipmentInfo`.
  - `rotateKey` requires:
    - Pillar (witness) signature over (shipmentId, newKey, rotationCount).
    - Sensor (current key) signature over same message (meta-tx).
    - Verifies rotationCount to prevent replay.

- **Ethers.js v6 Runner (Scripts)**
  - `main_blockchain_v2.ts` orchestrates setup and phases (A/B/C), creates signatures, and submits gasless rotations.
  - Implements `NonceManager` to serially allocate nonces for the Admin/Relayer.

---

## Message Hash & Signature (exact formula)

The message hashed and signed by Pillar and Sensor is created as:

$$
\text{hash} = \text{keccak256}(\text{abi.encodePacked}(shipmentId, newKey, rotationCount))
$$

When using ethers.js v6 this is created with:

- `ethers.solidityPackedKeccak256(['uint256','address','uint256'], [shipmentId, newKey, rotationCount])`

Both Pillar and Sensor sign `ethers.getBytes(hash)` via `signMessage` which prefixes the message per EIP-191.

---

## Sequence Diagram (simplified)

1. Setup (authorizations & registration)

   - Admin → SupplyChain : `authorizePillar(pillarAddr)` (xN)
   - Admin → SupplyChain : `registerShipment(shipmentId, initialSensorAddr)`

2. Rotation (Gasless Meta-Tx)

   - Pillar (on event) creates `pillarSignature = sign(hash)`
   - Sensor (off-chain) creates `sensorSignature = sign(hash)`
   - Sensor -> sends signatures to Relayer (Admin) off-chain (HTTP / IPC / local script)
   - Admin (Relayer) composes tx: `rotateKey(shipmentId, newKey, pillarSignature, sensorSignature)` and submits on-chain
   - SupplyChain verifies both signatures; checks that `rotationCount` equals stored counter; updates `currentKey` and increments `rotationCount` atomically

3. Verification & Audit
   - Anyone can call `getShipmentInfo(shipmentId)` to view `currentKey`, `rotationCount`, `lastPillar`, `lastRotation`

---

## Nonce & Concurrency Handling

Problem: Local testnets (Anvil) mine instantly and scripts run fast, causing provider/cached nonces to lag and produce `nonce too low` / `NONCE_EXPIRED`.

Mitigations implemented in the repo:

- **NonceManager (Script-side)**

  - Initialize with `provider.getTransactionCount(adminAddress)`.
  - Allocate a monotonic nonce for every outbound transaction with `getNext()`.
  - Use returned nonce in the tx send options: `{ nonce }`.
  - This ensures strictly sequential nonces across concurrent `await tx.wait()` gaps.

- Alternative production approaches:
  - Use remote relayer service that serializes transactions per funded account.
  - Use `eth_sendRawTransaction` queueing and re-fetch `pending`/`latest` when needed.

---

## Security Properties

- **Dual signature**: Both Pillar and Sensor signatures must match the same message, guaranteeing both custody attestation and sensor consent.
- **Rotation counter**: `rotationCount` prevents replaying old rotation intents even if signatures are captured.
- **Pillar Authorization**: Only addresses authorized via `authorizePillar` can act as valid witnesses.
- **Zero address and other checks**: Contract guards against zero-address registration and invalid state transitions.

---

## Storage Layout (high-level)

For each `shipmentId` the contract stores:

- `currentKey: address`
- `rotationCount: uint256` (monotonic counter)
- `active: bool` and `completed: bool`
- `registeredAt: uint256` (timestamp)
- `lastRotation: uint256` (timestamp)
- `lastPillar: address`

These are returned by `getShipmentInfo(shipmentId)` for transparency.

---

## Operational Notes & Troubleshooting

- When running locally with Anvil, small script sleeps (100-300ms) between heavy operations can help if `NonceManager` isn't sufficient.
- Ensure the Admin/Relayer account has ETH in the testnet. In the designed gasless flow, Sensors don't need ETH.
- If you see `PillarAlreadyAuthorized` or `ShipmentAlreadyExists`, the script handles them as benign race conditions.

---

## Quick Visual (ASCII)

[Sensor]--sign--> (sensorSignature)
|
+--send signatures to-->[Admin/Relayer]--tx-->[SupplyChain Contract]
^
[Pillar]--sign--> (pillarSignature) |
+--verify both signatures & rotationCount

---

## Files of interest

- [WitnessChain/src/main_blockchain_v2.ts](WitnessChain/src/main_blockchain_v2.ts) — orchestrator script, signatures, nonce manager
- [SupplyChain/src/SupplyChain.sol](SupplyChain/src/SupplyChain.sol) — smart contract implementation (rotation, authorization, storage)
- [WitnessChain/src/actors.ts](WitnessChain/src/actors.ts) — helper actor classes (WitnessNode, SensorDevice)

---

## Next steps (suggested)

- Add a small diagram image (SVG or Mermaid) to this repo for visual clarity.
- If you want, I can also add an integrated `relayer` HTTP endpoint to accept signed payloads and submit transactions, or wire up a simple web UI to demonstrate the flow.

---

_Generated by the dev assistant — ask me to adapt this into a Mermaid diagram, SVG, or embed it into README._
