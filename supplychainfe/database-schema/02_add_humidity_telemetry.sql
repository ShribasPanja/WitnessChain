-- Migration 02: Add Humidity field to Telemetry Table
-- Date: 2026-07-14

ALTER TABLE telemetry 
ADD COLUMN IF NOT EXISTS humidity NUMERIC(5, 2) DEFAULT 0.00;
