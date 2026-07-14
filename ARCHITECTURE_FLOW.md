# Cold Chain Witness — Flow Diagram (Plain-text)

This document contains a plain-text flow diagram (not Mermaid) that shows the end-to-end gasless rotation flow, signatures exchange, nonce handling, and events.

---

## Plain-text Flow Diagram

```
   +------------+         +-------------+         +-------------------+
   |  Sensor    |         |  Pillar     |         |   Admin / Relayer |
   | (Device)   |         | (Witness)   |         |   (Funded acct)   |
   +------------+         +-------------+         +-------------------+
        |                       |                         |
        | 1: sensor signs ------>|                         |
        |    message (hash)      |                         |
        |                       | 2: pillar signs the      |
        |                       |    same message (hash)   |
        |                       |                         |
        | 3: sensor -> sends ------------------------------>
        |    (sensorSignature)  |                         | 4: admin composes
        |    and newKey to relayer|                      |    and sends tx
        |                       |                         |    `rotateKey(...)`
        |                       |                         |    (pays gas)
        |                       |                         |
        v                       v                         v
                 (off-chain signature exchange / relay)

                        +-----------------------------+
                        |  SupplyChain Smart Contract |
                        +-----------------------------+
                                     |
                                     | 5: contract verifies
                                     |    - pillarSignature
                                     |    - sensorSignature
                                     |    - rotationCount matches
                                     | 6: contract updates state
                                     |    - currentKey = newKey
                                     |    - rotationCount++
                                     v
                        +-----------------------------+
                        |  Shipment state updated     |
                        +-----------------------------+

```

## Step-by-step mapping

- Step 1 — Sensor: create the message hash:

  - `hash = keccak256(abi.encodePacked(shipmentId, newKey, rotationCount))`
  - Sign with current sensor private key producing `sensorSignature`.

- Step 2 — Pillar: independently creates same message and signs producing `pillarSignature`.

- Step 3 — Sensor transmits `sensorSignature` (and `newKey`) off-chain to the Admin/Relayer. The Pillar's signature may also be transmitted via the Pillar or included in the same payload.

- Step 4 — Admin/Relayer constructs and sends on-chain transaction:

  - `rotateKey(shipmentId, newKey, pillarSignature, sensorSignature)`
  - Use script-level `NonceManager.getNext()` or re-sync `provider.getTransactionCount` to allocate nonce.
  - Admin pays gas for the transaction.

- Step 5 — The `SupplyChain` contract verifies the signatures recover to expected addresses and that `rotationCount` equals the stored counter for `shipmentId`.

- Step 6 — If checks pass, contract updates state: `currentKey = newKey`, `rotationCount++`, `lastPillar = pillar`, `lastRotation = block.timestamp`, and emits `RotationPerformed` event.

## Nonce & Reliability Notes

- On local devnets like Anvil, use a `NonceManager` to avoid `nonce too low` or `NONCE_EXPIRED` — initialize with `provider.getTransactionCount(adminAddress, 'latest')` and allocate monotonic nonces.
- If a transaction fails pre-flight, re-sync by calling `provider.getTransactionCount(adminAddress, 'latest')` before re-sending, or handle retries in the relayer logic.

## Event Monitoring & Auditing

- The relayer and monitoring services should listen for contract events (e.g., `RotationPerformed`) to update off-chain state and trigger downstream processes (alerts, telemetry uploads).

---

Files referenced:

- `WitnessChain/src/main_blockchain_v2.ts` — orchestrator script (signing & nonce manager).
- `SupplyChain/src/SupplyChain.sol` — on-chain logic (rotateKey & storage).

---

If you'd like, I can embed this file into the README or convert it into an SVG for diagrams.
