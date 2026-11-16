-- =============================================================================
-- Live location system (Bin Plumbing Services Ltd)
-- Safe to run multiple times. Does NOT delete or modify existing users/jobs.
-- Existing ids in this project are TEXT (see 20261113_phase0_security_and_tables.sql).
-- =============================================================================

-- 0. Make sure the legacy columns exist (older databases may not have run
--    20261114_live_location.sql yet).
ALTER TABLE public.plumbers
  ADD COLUMN IF NOT EXISTS current_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS current_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;

ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS customer_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS customer_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS customer_location_source TEXT,
  ADD COLUMN IF NOT EXISTS customer_location_updated_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_requests_customer_location_source_chk'
  ) THEN
    ALTER TABLE public.service_requests
      ADD CONSTRAINT service_requests_customer_location_source_chk
      CHECK (customer_location_source IS NULL
             OR customer_location_source IN ('gps', 'map_pin', 'address_only'))
      NOT VALID;
  END IF;
END $$;

-- 1. One current location row per plumber.
--    * location_timestamp = time the phone produced the GPS fix (UTC)
--    * received_at        = time the server accepted the fix (UTC)
--    * last_seen_at       = heartbeat; a stationary plumber keeps this fresh
CREATE TABLE IF NOT EXISTS public.plumber_live_locations (
  plumber_id          TEXT PRIMARY KEY REFERENCES public.plumbers(id) ON DELETE CASCADE,
  latitude            DOUBLE PRECISION,
  longitude           DOUBLE PRECISION,
  accuracy_m          DOUBLE PRECISION,
  heading             DOUBLE PRECISION,
  speed               DOUBLE PRECISION,
  location_timestamp  TIMESTAMPTZ,
  received_at         TIMESTAMPTZ,
  last_seen_at        TIMESTAMPTZ,
  sharing_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT plumber_live_locations_lat_chk
    CHECK (latitude IS NULL OR (latitude BETWEEN -90 AND 90)),
  CONSTRAINT plumber_live_locations_lng_chk
    CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180)),
  CONSTRAINT plumber_live_locations_accuracy_chk
    CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
  CONSTRAINT plumber_live_locations_heading_chk
    CHECK (heading IS NULL OR (heading >= 0 AND heading <= 360)),
  CONSTRAINT plumber_live_locations_speed_chk
    CHECK (speed IS NULL OR speed >= 0)
);

CREATE INDEX IF NOT EXISTS idx_plumber_live_locations_sharing
  ON public.plumber_live_locations (sharing_enabled, last_seen_at DESC);

-- 2. Privacy: browsers (anon / authenticated roles) must NEVER read or write
--    this table directly. All access goes through server code that uses the
--    service-role key after verifying the caller. RLS is enabled with no
--    policies, which denies everything except the service role.
ALTER TABLE public.plumber_live_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plumber_live_locations FROM anon, authenticated;

-- 3. Migrate existing coordinates safely (never overwrites existing rows).
INSERT INTO public.plumber_live_locations
  (plumber_id, latitude, longitude, location_timestamp, received_at, last_seen_at,
   sharing_enabled, updated_at)
SELECT p.id, p.current_lat, p.current_lng,
       p.location_updated_at, p.location_updated_at, p.location_updated_at,
       FALSE, NOW()
FROM public.plumbers p
WHERE p.current_lat IS NOT NULL
  AND p.current_lng IS NOT NULL
  AND p.current_lat BETWEEN -90 AND 90
  AND p.current_lng BETWEEN -180 AND 180
ON CONFLICT (plumber_id) DO NOTHING;

-- 4. Retention: coordinates of plumbers who have not been seen for N days are
--    cleared (the row stays, so the plumber can resume later). Schedule with
--    pg_cron or Supabase Scheduled Functions, e.g. daily:
--      SELECT public.cleanup_stale_plumber_locations(7);
CREATE OR REPLACE FUNCTION public.cleanup_stale_plumber_locations(retention_days INTEGER DEFAULT 7)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cleared INTEGER;
BEGIN
  UPDATE public.plumber_live_locations
     SET latitude = NULL, longitude = NULL, accuracy_m = NULL,
         heading = NULL, speed = NULL, sharing_enabled = FALSE,
         updated_at = NOW()
   WHERE COALESCE(last_seen_at, received_at, updated_at) < NOW() - make_interval(days => retention_days)
     AND (latitude IS NOT NULL OR longitude IS NOT NULL);
  GET DIAGNOSTICS cleared = ROW_COUNT;

  UPDATE public.plumbers
     SET current_lat = NULL, current_lng = NULL
   WHERE location_updated_at IS NOT NULL
     AND location_updated_at < NOW() - make_interval(days => retention_days)
     AND (current_lat IS NOT NULL OR current_lng IS NOT NULL);

  RETURN cleared;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_stale_plumber_locations(INTEGER) FROM PUBLIC, anon, authenticated;
