import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

const getPgClient = async (): Promise<Client | null> => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.trim() === '') return null;
  try {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    
    // Auto-create table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS shipment_metadata (
        shipment_id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        min_temp NUMERIC(5, 2) NOT NULL,
        max_temp NUMERIC(5, 2) NOT NULL,
        min_humid NUMERIC(5, 2) NOT NULL,
        max_humid NUMERIC(5, 2) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    return client;
  } catch (err) {
    console.error('PostgreSQL metadata connection failed:', err);
    return null;
  }
};

const getLocalPath = () => {
  const dir = 'D:/collegeProject/WitnessChain';
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, 'shipment_metadata.json');
};

// GET: Retrieve metadata for a shipment
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const shipmentId = searchParams.get('shipmentId');

    if (!shipmentId) {
      return NextResponse.json({ error: 'Missing shipmentId' }, { status: 400 });
    }

    const pg = await getPgClient();
    if (pg) {
      try {
        const res = await pg.query(
          `SELECT name, description, min_temp AS "minTemp", max_temp AS "maxTemp", min_humid AS "minHumid", max_humid AS "maxHumid" 
           FROM shipment_metadata 
           WHERE shipment_id = $1`,
          [shipmentId]
        );
        await pg.end();
        if (res.rows.length > 0) {
          return NextResponse.json({ success: true, metadata: res.rows[0] });
        }
      } catch (dbErr: any) {
        console.error('Failed to query pg shipment metadata:', dbErr.message);
      }
    }

    // Fallback: Read from local JSON file
    const localFile = getLocalPath();
    if (fs.existsSync(localFile)) {
      const data = JSON.parse(fs.readFileSync(localFile, 'utf8'));
      if (data[shipmentId]) {
        return NextResponse.json({ success: true, metadata: data[shipmentId] });
      }
    }

    return NextResponse.json({ success: false, error: 'Shipment metadata not found' }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Save/update metadata
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { shipmentId, name, description, minTemp, maxTemp, minHumid, maxHumid } = body;

    if (!shipmentId || !name) {
      return NextResponse.json({ error: 'Missing shipmentId or name' }, { status: 400 });
    }

    const payload = {
      name,
      description: description || '',
      minTemp: Number(minTemp ?? -20.0),
      maxTemp: Number(maxTemp ?? -10.0),
      minHumid: Number(minHumid ?? 35.0),
      maxHumid: Number(maxHumid ?? 65.0)
    };

    const pg = await getPgClient();
    if (pg) {
      try {
        await pg.query(
          `INSERT INTO shipment_metadata (shipment_id, name, description, min_temp, max_temp, min_humid, max_humid) 
           VALUES ($1, $2, $3, $4, $5, $6, $7) 
           ON CONFLICT (shipment_id) 
           DO UPDATE SET name = $2, description = $3, min_temp = $4, max_temp = $5, min_humid = $6, max_humid = $7`,
          [shipmentId, payload.name, payload.description, payload.minTemp, payload.maxTemp, payload.minHumid, payload.maxHumid]
        );
        await pg.end();
        return NextResponse.json({ success: true, message: 'Metadata saved in database', metadata: payload });
      } catch (dbErr: any) {
        console.error('Failed to save pg shipment metadata:', dbErr.message);
      }
    }

    // Fallback: Save to local JSON
    const localFile = getLocalPath();
    let localData: any = {};
    if (fs.existsSync(localFile)) {
      try {
        localData = JSON.parse(fs.readFileSync(localFile, 'utf8'));
      } catch (err) {
        localData = {};
      }
    }
    localData[shipmentId] = payload;
    fs.writeFileSync(localFile, JSON.stringify(localData, null, 2), 'utf8');

    return NextResponse.json({ success: true, message: 'Metadata saved in local storage', metadata: payload });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
