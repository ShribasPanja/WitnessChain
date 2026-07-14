# Cold Chain Witness Protocol v2 - Full Dynamic Walkthrough

This guide walks you through the entire end-to-end flow of the system: database initialization, smart contract deployment, node authorization, shipment registration, and simulated IoT custody handovers.

---

## 🛠️ Step 1: Initialize the Database (PostgreSQL)

We have created and executed a formal database migration script inside the project to prepare the PostgreSQL backend.

To verify or run migrations manually:
```bash
# Inside supplychainfe/
node scripts/migrate.js
```
*Output:*
```
🔄 Starting PostgreSQL Database Migration...
✅ Connected to PostgreSQL database.
Executing SQL migration script...
🎉 Migration successful! Telemetry table and indexes verified.
```
This creates the `telemetry` table and indexes in your Postgres database defined under `DATABASE_URL` in `.env`.

---

## ⛓️ Step 2: Deploy the Smart Contract (Anvil Localnet)

1. Ensure your local Anvil blockchain node is active:
   ```bash
   anvil
   ```

2. Deploy the contract using Foundry:
   ```bash
   # Inside SupplyChain/
   $env:PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
   forge script script/DeploySupplyChain.s.sol:DeploySupplyChain --rpc-url http://127.0.0.1:8545 --broadcast
   ```
   *Note the deployed contract address (typically `0x5FbDB2315678afecb367f032d93F642f64180aa3`).*

---

## ⚙️ Step 3: Configure settings in UI

1. Open your browser and navigate to the monitoring dashboard:
   👉 **[http://localhost:3000](http://localhost:3000)**

2. Open the settings panel (⚙️) in the top-right corner.
3. Verify that the **Smart Contract Address** matches the deployed address from Step 2, and the **RPC URL** is set to `http://127.0.0.1:8545`. Save configurations.

---

## 🏭 Step 4: Authorize Witness Nodes (Pillars)

Before a node can witness shipments, the contract owner must whitelist (authorize) its public address. We provide two ways to do this:

### Option A: One-Click Automated Setup
1. Go to the **Mock Sensor** panel:
   👉 **[http://localhost:3000/mock-sensor](http://localhost:3000/mock-sensor)**
2. Click the **"Setup Pillars"** button in the header.
3. This registers the default `TruckBeacon-Alpha` and `WarehousePillar-Beta` public keys directly to the contract on-chain using the admin node.

### Option B: Manual Administration
1. Go to the **Admin Console**:
   👉 **[http://localhost:3000/admin](http://localhost:3000/admin)**
2. Connect your wallet (MetaMask Account #0 - the contract owner/deployer).
3. Under **Pillar Whitelist Manager**, paste the public address of your witness pillar, and click **Authorize**.
4. Confirm the transaction in MetaMask!

---

## 🚚 Step 5: Register a New Shipment

1. Stay on the **Admin Console**:
   👉 **[http://localhost:3000/admin](http://localhost:3000/admin)**
2. Under **Register New Shipment**, enter:
   - **Shipment ID:** e.g., `4036`
   - **Initial Sensor Key:** Paste the sensor key address (e.g. Anvil Account #2: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`).
3. Click **Register Shipment** and approve the transaction in MetaMask.

---

## 📦 Step 6: Trigger Simulated IoT Handovers

1. Navigate to the **Mock Sensor** page:
   👉 **[http://localhost:3000/mock-sensor](http://localhost:3000/mock-sensor)**
2. Fill out the handover form:
   - **Shipment ID:** `4036`
   - **Custody Transfers to:** Select `TruckBeacon-Alpha` or `WarehousePillar-Beta`.
   - **Current Temperature (°C):** e.g., `-18.5`.
3. Click **Trigger Custody Handover**.
4. **Behind the scenes:**
   - The backend signs the challenge with the ephemeral sensor keys, rotating the sensor's key on-chain.
   - Saves the telemetry record to your PostgreSQL database.
   - Instantly fires a Server-Sent Event (SSE) to push updates to the monitor.

---

## 📊 Step 7: Live Monitor Dashboard

1. Navigate back to the main dashboard:
   👉 **[http://localhost:3000](http://localhost:3000)**
2. Watch the timeline update in real-time without reloading page!
3. Telemetry graphs and tables will pull the freshly logged records directly from your PostgreSQL database.
