-- ==============================================================================
-- PRE-LAUNCH SECURITY HARDENING, ATOMIC RATE LIMITING & OWNERSHIP BACKFILL
-- Safe, idempotent migration. Do NOT run destructively without staging test.
-- ==============================================================================

-- 1. Remove broad public direct-INSERT policies so anon/authenticated clients
-- cannot bypass server validation to insert privileged columns.
DROP POLICY IF EXISTS "Public can submit service_requests" ON public.service_requests;
DROP POLICY IF EXISTS "Public can submit plumber application" ON public.plumbers;
DROP POLICY IF EXISTS "Public can submit enquiries" ON public.enquiries;

-- 2. Prevent plumbers from self-escalating approval/rating/auth columns via direct JWT UPDATE
CREATE OR REPLACE FUNCTION public.guard_plumber_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN
    NEW.verification_status := OLD.verification_status;
    NEW.rating := OLD.rating;
    NEW.total_jobs := OLD.total_jobs;
    NEW.auth_user_id := OLD.auth_user_id;
    NEW.application_ref := OLD.application_ref;
    NEW.deleted_at := OLD.deleted_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_plumber_self_update ON public.plumbers;
CREATE TRIGGER trg_guard_plumber_self_update
  BEFORE UPDATE ON public.plumbers
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_plumber_self_update();

-- 3. Atomic sliding-window rate-limit RPC (replaces non-atomic delete/select/insert)
CREATE OR REPLACE FUNCTION public.check_rate_limit_atomic(
  p_bucket_key TEXT,
  p_max_requests INTEGER,
  p_window_ms BIGINT
)
RETURNS TABLE(allowed BOOLEAN, retry_after_seconds INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_cutoff TIMESTAMPTZ := v_now - (p_window_ms || ' milliseconds')::INTERVAL;
  v_count INTEGER;
  v_oldest TIMESTAMPTZ;
  v_retry INTEGER;
BEGIN
  -- Serialize concurrent checks for the same bucket key within this transaction
  PERFORM pg_advisory_xact_lock(hashtext(p_bucket_key));

  DELETE FROM public.rate_limits
  WHERE bucket_key = p_bucket_key
    AND created_at < v_cutoff;

  SELECT COUNT(*), MIN(created_at)
  INTO v_count, v_oldest
  FROM public.rate_limits
  WHERE bucket_key = p_bucket_key
    AND created_at >= v_cutoff;

  IF v_count >= p_max_requests THEN
    v_retry := GREATEST(1, CEIL(EXTRACT(EPOCH FROM ((v_oldest + (p_window_ms || ' milliseconds')::INTERVAL) - v_now)))::INTEGER);
    RETURN QUERY SELECT FALSE, v_retry;
    RETURN;
  END IF;

  INSERT INTO public.rate_limits (bucket_key, created_at)
  VALUES (p_bucket_key, v_now);

  RETURN QUERY SELECT TRUE, 0;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit_atomic(TEXT, INTEGER, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit_atomic(TEXT, INTEGER, BIGINT) TO service_role;

-- 4. Safe ownership backfill for legacy service_requests
UPDATE public.service_requests sr
SET customer_id = c.id
FROM public.customers c
WHERE sr.customer_id IS NULL
  AND sr.customer_phone IS NOT NULL
  AND LENGTH(REGEXP_REPLACE(sr.customer_phone, '\D', '', 'g')) >= 10
  AND RIGHT(REGEXP_REPLACE(sr.customer_phone, '\D', '', 'g'), 10) = RIGHT(REGEXP_REPLACE(c.phone, '\D', '', 'g'), 10)
  AND c.deleted_at IS NULL;

-- Backfill assigned_plumber_id only when plumber full_name matches uniquely
WITH unique_plumber_names AS (
  SELECT LOWER(TRIM(full_name)) AS norm_name, MIN(id) AS plumber_id
  FROM public.plumbers
  WHERE deleted_at IS NULL
  GROUP BY LOWER(TRIM(full_name))
  HAVING COUNT(*) = 1
)
UPDATE public.service_requests sr
SET assigned_plumber_id = upn.plumber_id
FROM unique_plumber_names upn
WHERE sr.assigned_plumber_id IS NULL
  AND sr.assigned_technician IS NOT NULL
  AND LOWER(TRIM(sr.assigned_technician)) = upn.norm_name;

-- 5. Indexes for fast auth lookup & duplicate transaction reference prevention
CREATE INDEX IF NOT EXISTS idx_customers_email_lower ON public.customers (LOWER(email)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_plumbers_email_lower ON public.plumbers (LOWER(email)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_unique_active_tx_ref
  ON public.payments (transaction_ref)
  WHERE transaction_ref IS NOT NULL AND transaction_ref <> '' AND verification_status <> 'rejected';
