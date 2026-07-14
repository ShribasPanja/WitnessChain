#!/bin/bash

# Exit on error
set -e

echo "🚀 Stopping any stale processes on port 8545..."
# Kill any processes running on port 8545 (typical for Anvil)
if command -v taskkill &> /dev/null; then
  # On Windows Git Bash
  PID=$(netstat -ano | grep 8545 | awk '{print $5}' | head -n 1)
  if [ ! -z "$PID" ]; then
    taskkill //F //PID "$PID" 2>/dev/null || true
  fi
else
  npx kill-port 8545 2>/dev/null || true
fi

echo "🚀 Starting Anvil local blockchain in the background..."
anvil > anvil.log 2>&1 &

# Wait for anvil to spin up
echo "⏳ Waiting for Anvil to start..."
until curl -s -X POST --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' -H "Content-Type: application/json" http://127.0.0.1:8545 >/dev/null 2>&1; do
  sleep 0.5
done
echo "✅ Anvil is active."

# Navigate and deploy contract
echo "📦 Compiling and deploying smart contracts using Foundry..."
cd SupplyChain
DEPLOY_OUTPUT=$(PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 forge script script/DeploySupplyChain.s.sol:DeploySupplyChain --rpc-url http://127.0.0.1:8545 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --broadcast)

# Parse contract address from deployment logs
CONTRACT_ADDR=$(echo "$DEPLOY_OUTPUT" | grep -oE "0x[a-fA-F0-9]{40}" | head -n 1)

if [ -z "$CONTRACT_ADDR" ]; then
  echo "❌ Error: Could not extract deployed contract address!"
  exit 1
fi

echo "✅ SupplyChain contract deployed at: $CONTRACT_ADDR"
cd ..

# Sync deployed address to Next.js config
echo "⚙️ Syncing contract address to nextjs config..."
node -e "
const fs = require('fs');
const file = 'supplychainfe/src/lib/config.ts';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/contractAddress:\s*'0x[a-fA-F0-9]{40}'/, \"contractAddress: '$CONTRACT_ADDR'\");
fs.writeFileSync(file, content, 'utf8');
"

# Migrate DB and start next dev server
echo "🔄 Running DB migrations and launching frontend..."
cd supplychainfe
node scripts/migrate.js
npm run dev
