-- Add live GPS coordinates for inDrive-style tracking & dispatch
ALTER TABLE plumbers
  ADD COLUMN IF NOT EXISTS current_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS current_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;

ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS customer_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS customer_lng DOUBLE PRECISION;
