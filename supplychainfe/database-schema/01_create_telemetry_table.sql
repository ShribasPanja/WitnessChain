-- Migration 01: Create Telemetry Table
-- Date: 2026-07-13

CREATE TABLE IF NOT EXISTS telemetry (
    id SERIAL PRIMARY KEY,
    shipment_id VARCHAR(50) NOT NULL,
    timestamp BIGINT NOT NULL,
    temperature NUMERIC(5, 2) NOT NULL,
    location TEXT NOT NULL,
    nonce VARCHAR(100) NOT NULL,
    witness_signature TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexing for fast chronological queries per shipment
CREATE INDEX IF NOT EXISTS idx_telemetry_shipment_timestamp 
ON telemetry(shipment_id, timestamp DESC);
