-- Ensure optional availability and onboarding metadata columns exist on plumbers.
-- Application code also gracefully embeds/reads these values inside plumbers.notes
-- if this migration has not been applied yet.

ALTER TABLE public.plumbers ADD COLUMN IF NOT EXISTS availability TEXT DEFAULT 'Standard';
ALTER TABLE public.plumbers ADD COLUMN IF NOT EXISTS onboarding_notes TEXT;
ALTER TABLE public.plumbers ADD COLUMN IF NOT EXISTS agreement_url TEXT;
ALTER TABLE public.plumbers ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.plumbers ADD COLUMN IF NOT EXISTS verification_checklist JSONB;
