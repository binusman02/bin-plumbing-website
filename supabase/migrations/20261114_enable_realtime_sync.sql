-- Enable Supabase Realtime (postgres_changes) for live messaging, notifications,
-- and cross-portal service request / quotation / payment status synchronization.

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'messages',
    'notifications',
    'service_requests',
    'quotations',
    'payments'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN NULL;
      WHEN undefined_object THEN NULL;
    END;
  END LOOP;
END $$;
