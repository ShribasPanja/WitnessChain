-- Migration 03: Create Shipment Metadata Table
-- Date: 2026-07-15

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
