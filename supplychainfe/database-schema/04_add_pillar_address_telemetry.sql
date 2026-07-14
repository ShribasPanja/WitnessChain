-- Migration 04: Add Pillar Address column to Telemetry Table
-- Date: 2026-07-15

ALTER TABLE telemetry 
ADD COLUMN IF NOT EXISTS pillar_address VARCHAR(100);
