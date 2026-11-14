-- Phase 3/5/6: Customer Reviews (moderated) and Plumbing Guides

CREATE TABLE IF NOT EXISTS public.reviews (
  id TEXT PRIMARY KEY,
  ticket_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  area TEXT NOT NULL DEFAULT '',
  service_category TEXT NOT NULL DEFAULT '',
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reviews_public_read_approved" ON public.reviews;
CREATE POLICY "reviews_public_read_approved" ON public.reviews
  FOR SELECT USING (status = 'approved' OR public.is_admin());

DROP POLICY IF EXISTS "reviews_admin_manage" ON public.reviews;
CREATE POLICY "reviews_admin_manage" ON public.reviews
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.guides (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Plumbing Tips',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  needs_owner_review BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.guides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guides_public_read_published" ON public.guides;
CREATE POLICY "guides_public_read_published" ON public.guides
  FOR SELECT USING (status = 'published' OR public.is_admin());

DROP POLICY IF EXISTS "guides_admin_manage" ON public.guides;
CREATE POLICY "guides_admin_manage" ON public.guides
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
