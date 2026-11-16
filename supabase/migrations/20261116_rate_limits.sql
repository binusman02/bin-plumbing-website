-- Database-backed sliding-window rate limiting table (service role only)
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id BIGSERIAL PRIMARY KEY,
  bucket_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_bucket_created
  ON public.rate_limits (bucket_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rate_limits_created_at
  ON public.rate_limits (created_at);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Service role only: deny all anon/authenticated access
REVOKE ALL ON public.rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.cleanup_expired_rate_limits(max_age INTERVAL DEFAULT INTERVAL '1 hour')
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.rate_limits
  WHERE created_at < NOW() - max_age;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
