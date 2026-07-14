import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

export async function GET() {
  try {
    const databaseUrl = process.env.DATABASE_URL;
    
    // Attempt to query PostgreSQL database if configured
    if (databaseUrl && databaseUrl.trim() !== '') {
      try {
        const pgClient = new Client({ connectionString: databaseUrl });
        await pgClient.connect();
        const queryResult = await pgClient.query(
          `SELECT shipment_id AS "shipmentId", timestamp, temperature::float, humidity::float, location, nonce, witness_signature AS "witnessSignature", pillar_address AS "pillarAddress" 
           FROM telemetry 
           ORDER BY timestamp DESC`
        );
        await pgClient.end();
        return NextResponse.json({ telemetry: queryResult.rows });
      } catch (dbErr: any) {
        console.error('PostgreSQL read failed, falling back to file log:', dbErr.message);
      }
    }

    // Fallback: Read from the WitnessChain directory's shipment_data.jsonl file
    const logPath = path.resolve('D:/collegeProject/WitnessChain/shipment_data.jsonl');
    
    if (!fs.existsSync(logPath)) {
      return NextResponse.json({ telemetry: [] });
    }
    
    const fileContent = fs.readFileSync(logPath, 'utf8');
    const lines = fileContent.trim().split('\n').filter(Boolean);
    
    const telemetry = lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        return null;
      }
    }).filter(Boolean);
    
    return NextResponse.json({ telemetry });
  } catch (error: any) {
    console.error('Error reading telemetry:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
