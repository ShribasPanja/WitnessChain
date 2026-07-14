import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { telemetryEmitter } from '../emitter';
import { Client } from 'pg';
import { CONFIG, CONTRACT_ABI, PILLAR_KEYS } from '../../../lib/config';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      shipmentId = CONFIG.shipmentId, 
      pillarKey, 
      temperature = -18.0,
      humidity = 0.0,
      location: customLocation,
      pillarPrivateKey,
      contractAddress = CONFIG.contractAddress,
      rpcUrl = CONFIG.rpcUrl
    } = body;

    const hasValidKey = body.pillarPrivateKey && ethers.isHexString(body.pillarPrivateKey, 32);
    if (!hasValidKey && (!pillarKey || !(pillarKey in PILLAR_KEYS))) {
      return NextResponse.json({ error: 'Invalid pillar key or private key' }, { status: 400 });
    }

    // Connect to PostgreSQL if DATABASE_URL is defined
    const databaseUrl = process.env.DATABASE_URL;
    let pgClient: Client | null = null;
    if (databaseUrl && databaseUrl.trim() !== '') {
      try {
        pgClient = new Client({ connectionString: databaseUrl });
        await pgClient.connect();
        
        // Auto-create table if it doesn't exist
        await pgClient.query(`
          CREATE TABLE IF NOT EXISTS telemetry (
            id SERIAL PRIMARY KEY,
            shipment_id VARCHAR(50) NOT NULL,
            timestamp BIGINT NOT NULL,
            temperature NUMERIC(5, 2) NOT NULL,
            humidity NUMERIC(5, 2) DEFAULT 0.00,
            location TEXT NOT NULL,
            nonce VARCHAR(100) NOT NULL,
            witness_signature TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `);
        // Ensure pillar_address column exists in telemetry table
        await pgClient.query(`
          ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS pillar_address VARCHAR(100);
        `);
      } catch (dbErr: any) {
        console.error('PostgreSQL connection/setup failed, falling back to file log:', dbErr.message);
        pgClient = null;
      }
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // Derive to parent path of Anvil accounts
    const hdNode = ethers.HDNodeWallet.fromMnemonic(
      ethers.Mnemonic.fromPhrase(CONFIG.mnemonic),
      `m/44'/60'/0'/0`
    );
    
    // Admin is account index 0
    const adminWallet = hdNode.deriveChild(0).connect(provider);
    const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, adminWallet);

    // 1. Fetch current shipment info
    let shipmentInfo;
    try {
      shipmentInfo = await contract.getShipmentInfo(shipmentId);
    } catch (e) {
      return NextResponse.json({ error: 'Contract not deployed or shipment not found. Please deploy contract and register shipment first.' }, { status: 400 });
    }

    const rotationCount = Number(shipmentInfo.rotationCount);
    const isActive = shipmentInfo.active;
    const isCompleted = shipmentInfo.completed;
    const onHold = shipmentInfo.onHold;

    if (onHold) {
      return NextResponse.json({ error: 'Shipment is currently on HOLD. Handovers are restricted.' }, { status: 400 });
    }

    if (isCompleted) {
      return NextResponse.json({ error: 'Shipment already completed' }, { status: 400 });
    }

    // If shipment is not registered yet, we register it first using admin wallet
    if (!isActive) {
      // Initial sensor is index 1
      const initialSensor = hdNode.deriveChild(1);
      console.log(`Registering shipment ${shipmentId} with initial key: ${initialSensor.address}`);
      // Register with a default 1-hour interval (3600 seconds) if not registered on-chain yet
      const tx = await contract.registerShipment(shipmentId, initialSensor.address, 3600);
      await tx.wait();
    }

    // 2. Setup the pillar and verify it is authorized
    let privateKeyToUse = pillarKey === 'truck' ? PILLAR_KEYS.truck : PILLAR_KEYS.warehouse;
    if (body.pillarPrivateKey && ethers.isHexString(body.pillarPrivateKey, 32)) {
      privateKeyToUse = body.pillarPrivateKey;
    }

    const pillarWallet = new ethers.Wallet(privateKeyToUse, provider);
    const isAuthorized = await contract.isPillarAuthorized(pillarWallet.address);
    if (!isAuthorized) {
      console.log(`Authorizing pillar (${pillarWallet.address}) on-chain`);
      const tx = await contract.authorizePillar(pillarWallet.address);
      await tx.wait();
    }

    // 3. Derive current sensor key and new sensor key
    // Current sensor is derived at path (rotationCount + 1)
    const currentSensorWallet = hdNode.deriveChild(rotationCount + 1).connect(provider);
    // New sensor is derived at path (rotationCount + 2)
    const newSensorWallet = hdNode.deriveChild(rotationCount + 2);

    // 4. Construct the rotation payload and sign
    const messageHash = ethers.solidityPackedKeccak256(
      ['uint256', 'address', 'uint256'],
      [shipmentId, newSensorWallet.address, rotationCount]
    );

    // Signatures
    const pillarSignature = await pillarWallet.signMessage(ethers.getBytes(messageHash));
    const sensorSignature = await currentSensorWallet.signMessage(ethers.getBytes(messageHash));

    // 5. Submit rotation transaction on-chain
    console.log(`Rotating key for shipment ${shipmentId}. New key: ${newSensorWallet.address}`);
    const tx = await contract.rotateKey(
      shipmentId,
      newSensorWallet.address,
      pillarSignature,
      sensorSignature
    );
    const receipt = await tx.wait();

    // 6. Append to off-chain log file
    const logPath = path.resolve('D:/collegeProject/WitnessChain/shipment_data.jsonl');
    const finalLocation = customLocation || (pillarKey === 'truck' 
      ? 'Truck-Alpha-Location (Lat: 40.7128, Long: -74.0060)'
      : 'Warehouse-Beta-Location (Lat: 40.7580, Long: -73.9855)');

    const telemetryPacket = {
      shipmentId: shipmentId.toString(),
      timestamp: Date.now(),
      temperature: Number(temperature),
      humidity: Number(humidity),
      location: finalLocation,
      nonce: Math.floor(Math.random() * 100000).toString(),
      witnessSignature: pillarSignature,
      pillarAddress: pillarWallet.address
    };

    // Write to PostgreSQL if client is available; otherwise fall back to local JSONL
    if (pgClient) {
      try {
        await pgClient.query(
          `INSERT INTO telemetry (shipment_id, timestamp, temperature, humidity, location, nonce, witness_signature, pillar_address)           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            telemetryPacket.shipmentId,
            telemetryPacket.timestamp,
            telemetryPacket.temperature,
            telemetryPacket.humidity,
            telemetryPacket.location,
            telemetryPacket.nonce,
            telemetryPacket.witnessSignature,
            telemetryPacket.pillarAddress
          ]
        );
        await pgClient.end();
        console.log(`Saved telemetry for shipment ${shipmentId} in PostgreSQL.`);
      } catch (dbInsertErr: any) {
        console.error('PostgreSQL insert failed, logging to file instead:', dbInsertErr.message);
        fs.appendFileSync(logPath, JSON.stringify(telemetryPacket) + '\n', 'utf8');
      }
    } else {
      fs.appendFileSync(logPath, JSON.stringify(telemetryPacket) + '\n', 'utf8');
    }

    // Emit event for real-time streaming to the dashboard
    telemetryEmitter.emit('new-telemetry', telemetryPacket);

    return NextResponse.json({
      success: true,
      txHash: receipt.hash,
      oldKey: currentSensorWallet.address,
      newKey: newSensorWallet.address,
      rotationCount: rotationCount + 1,
      telemetry: telemetryPacket
    });

  } catch (error: any) {
    console.error('Handover simulation error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
