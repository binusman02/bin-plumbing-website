-- Upgrade existing guides table into a bilingual English & Hausa SEO blog CMS
-- Safe & idempotent: preserves all existing rows and columns.

ALTER TABLE public.guides
  ADD COLUMN IF NOT EXISTS en_title TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS en_slug TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS en_summary TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS en_content TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS en_seo_title TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS en_meta_description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS en_image_alt TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS en_status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS ha_title TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ha_slug TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ha_summary TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ha_content TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ha_seo_title TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ha_meta_description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ha_image_alt TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ha_status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS featured_image TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_attribution TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS target_service_slug TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS main_keyword TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS supporting_keywords TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS author_name TEXT NOT NULL DEFAULT 'Bin Plumbing Editorial Team',
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Ensure status constraints allow 'draft', 'review', 'published'
ALTER TABLE public.guides DROP CONSTRAINT IF EXISTS guides_status_check;
ALTER TABLE public.guides
  ADD CONSTRAINT guides_status_check CHECK (status IN ('draft', 'review', 'published'));

ALTER TABLE public.guides DROP CONSTRAINT IF EXISTS guides_en_status_check;
ALTER TABLE public.guides
  ADD CONSTRAINT guides_en_status_check CHECK (en_status IN ('draft', 'review', 'published'));

ALTER TABLE public.guides DROP CONSTRAINT IF EXISTS guides_ha_status_check;
ALTER TABLE public.guides
  ADD CONSTRAINT guides_ha_status_check CHECK (ha_status IN ('draft', 'review', 'published'));

-- Backfill English fields from legacy single-language columns where empty
UPDATE public.guides
SET
  en_title = CASE WHEN en_title = '' THEN title ELSE en_title END,
  en_slug = CASE WHEN en_slug = '' THEN slug ELSE en_slug END,
  en_summary = CASE WHEN en_summary = '' THEN summary ELSE en_summary END,
  en_content = CASE WHEN en_content = '' THEN content ELSE en_content END,
  en_status = CASE WHEN status = 'published' AND en_status = 'draft' THEN 'published' ELSE en_status END,
  published_at = COALESCE(published_at, CASE WHEN status = 'published' THEN created_at ELSE NULL END)
WHERE en_title = '' OR en_slug = '';

-- Partial unique indexes so each language slug is unique when set
CREATE UNIQUE INDEX IF NOT EXISTS guides_en_slug_unique
  ON public.guides (en_slug)
  WHERE en_slug <> '';

CREATE UNIQUE INDEX IF NOT EXISTS guides_ha_slug_unique
  ON public.guides (ha_slug)
  WHERE ha_slug <> '';

-- Update public read policy to allow reading if either English or Hausa version is published
DROP POLICY IF EXISTS "guides_public_read_published" ON public.guides;
CREATE POLICY "guides_public_read_published" ON public.guides
  FOR SELECT
  USING (
    status = 'published'
    OR en_status = 'published'
    OR ha_status = 'published'
    OR public.is_admin()
  );
