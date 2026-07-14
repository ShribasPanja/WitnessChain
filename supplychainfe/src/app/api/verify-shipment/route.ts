import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { ethers } from 'ethers';
import { CONFIG, CONTRACT_ABI } from '../../../lib/config';

// Connect to database
const queryDb = async (queryText: string, params: any[]) => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.trim() === '') return null;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const res = await client.query(queryText, params);
  await client.end();
  return res.rows;
};

// Fallback: Read JSONL telemetry
const getLocalTelemetry = (shipmentId: string) => {
  const logPath = path.resolve('D:/collegeProject/WitnessChain/shipment_data.jsonl');
  if (!fs.existsSync(logPath)) return [];
  const fileContent = fs.readFileSync(logPath, 'utf8');
  const lines = fileContent.trim().split('\n').filter(Boolean);
  return lines.map((line) => {
    try {
      return JSON.parse(line);
    } catch (err) {
      return null;
    }
  }).filter((item) => item && item.shipmentId === shipmentId);
};

// Fallback: Read JSON shipment metadata
const getLocalMetadata = (shipmentId: string) => {
  const localFile = path.resolve('D:/collegeProject/WitnessChain/shipment_metadata.json');
  if (!fs.existsSync(localFile)) return null;
  const data = JSON.parse(fs.readFileSync(localFile, 'utf8'));
  return data[shipmentId] || null;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const shipmentId = searchParams.get('shipmentId');

    if (!shipmentId) {
      return NextResponse.json({ error: 'Missing shipmentId' }, { status: 400 });
    }

    // 1. Fetch Shipment Metadata (ideal thresholds)
    let metadata = null;
    const dbMetadata = await queryDb(
      `SELECT name, description, min_temp AS "minTemp", max_temp AS "maxTemp", min_humid AS "minHumid", max_humid AS "maxHumid" 
       FROM shipment_metadata 
       WHERE shipment_id = $1`,
      [shipmentId]
    );

    if (dbMetadata && dbMetadata.length > 0) {
      metadata = dbMetadata[0];
    } else {
      metadata = getLocalMetadata(shipmentId);
    }

    if (!metadata) {
      // Fallback defaults
      metadata = {
        name: 'Standard Shipment',
        description: 'No metadata registered',
        minTemp: -25.0,
        maxTemp: -15.0,
        minHumid: 40.0,
        maxHumid: 60.0
      };
    }

    // 2. Fetch Telemetry logs
    let telemetry: any[] = [];
    const dbTelemetry = await queryDb(
      `SELECT temperature::float, humidity::float, timestamp, location, witness_signature AS "witnessSignature", pillar_address AS "pillarAddress" 
       FROM telemetry 
       WHERE shipment_id = $1 
       ORDER BY timestamp ASC`,
      [shipmentId]
    );

    if (dbTelemetry) {
      telemetry = dbTelemetry;
    } else {
      telemetry = getLocalTelemetry(shipmentId);
    }

    // 3. Fetch On-Chain State from Smart Contract to verify registration
    let onChainActive = false;
    let onChainCompleted = false;
    let onChainOnHold = false;
    let rotationCount = 0;

    try {
      const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
      const contract = new ethers.Contract(CONFIG.contractAddress, CONTRACT_ABI, provider);
      const onChainData = await contract.getShipmentInfo(BigInt(shipmentId));
      onChainActive = onChainData[2];
      onChainCompleted = onChainData[3];
      onChainOnHold = onChainData[4];
      rotationCount = Number(onChainData[1]);
    } catch (bcErr) {
      console.warn('Could not read blockchain status:', bcErr);
    }

    // 4. Analyze journey logs against thresholds
    let violations: any[] = [];
    const minT = Number(metadata.minTemp);
    const maxT = Number(metadata.maxTemp);
    const minH = Number(metadata.minHumid);
    const maxH = Number(metadata.maxHumid);

    for (const log of telemetry) {
      const tempViolated = log.temperature < minT || log.temperature > maxT;
      const humidViolated = log.humidity !== undefined && (log.humidity < minH || log.humidity > maxH);
      
      if (tempViolated || humidViolated) {
        violations.push({
          timestamp: Number(log.timestamp),
          temperature: log.temperature,
          humidity: log.humidity,
          location: log.location,
          reason: tempViolated 
            ? `Temperature ${log.temperature}°C out of range (${minT}°C to ${maxT}°C)`
            : `Humidity ${log.humidity}% out of range (${minH}% to ${maxH}%)`
        });
      }
    }

    const safe = violations.length === 0;

    return NextResponse.json({
      success: true,
      shipmentId,
      metadata,
      safe,
      violationsCount: violations.length,
      violations,
      totalChecks: telemetry.length,
      blockchain: {
        active: onChainActive,
        completed: onChainCompleted,
        onHold: onChainOnHold,
        rotationCount,
        contractAddress: CONFIG.contractAddress
      }
    });

  } catch (error: any) {
    console.error('Verify shipment API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
