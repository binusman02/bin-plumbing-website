-- ==============================================================================
-- BIN PLUMBING SERVICES LTD — SUPABASE DATABASE SCHEMA (PHASE 0 HARDENED)
-- Run this in your Supabase SQL Editor for a fresh setup, or run
-- supabase/migrations/20261113_phase0_security_and_tables.sql on existing DBs.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. ADMIN USERS TABLE (Role source of truth for RLS)
CREATE TABLE IF NOT EXISTS public.admin_users (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    auth_user_id UUID UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL DEFAULT 'Administrator',
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'coordinator')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS public.customers (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    auth_user_id UUID UNIQUE,
    full_name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    email TEXT,
    password_hash TEXT,
    address TEXT DEFAULT '',
    state TEXT DEFAULT '',
    city_lga TEXT DEFAULT '',
    neighbourhood TEXT DEFAULT '',
    property_type TEXT DEFAULT 'Residential',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. PLUMBERS TABLE
CREATE TABLE IF NOT EXISTS public.plumbers (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    auth_user_id UUID UNIQUE,
    application_ref TEXT,
    full_name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    email TEXT,
    password_hash TEXT,
    residential_location TEXT NOT NULL DEFAULT '',
    preferred_locations JSONB NOT NULL DEFAULT '[]'::jsonb,
    skills JSONB NOT NULL DEFAULT '[]'::jsonb,
    experience_years INTEGER NOT NULL DEFAULT 1,
    experience_details TEXT,
    references_info TEXT,
    verification_status TEXT NOT NULL DEFAULT 'submitted'
      CHECK (verification_status IN ('submitted', 'under_review', 'documents_required', 'approved', 'rejected', 'suspended')),
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    is_online BOOLEAN NOT NULL DEFAULT FALSE,
    last_seen_at TIMESTAMPTZ,
    rating NUMERIC(3, 2) NOT NULL DEFAULT 5.00,
    total_jobs INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. PLUMBER DOCUMENTS TABLE (Private storage references)
CREATE TABLE IF NOT EXISTS public.plumber_documents (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    plumber_id TEXT NOT NULL REFERENCES public.plumbers(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL DEFAULT 'other' CHECK (document_type IN ('id_card', 'certificate', 'photo', 'other')),
    file_name TEXT NOT NULL,
    storage_bucket TEXT NOT NULL DEFAULT 'plumber-documents',
    storage_path TEXT NOT NULL,
    mime_type TEXT,
    file_size BIGINT DEFAULT 0,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. SERVICE CATEGORIES TABLE (Single source of truth for services)
CREATE TABLE IF NOT EXISTS public.service_categories (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    short_description TEXT DEFAULT '',
    long_description TEXT DEFAULT '',
    common_problems JSONB NOT NULL DEFAULT '[]'::jsonb,
    quotation_notes TEXT DEFAULT '',
    faqs JSONB NOT NULL DEFAULT '[]'::jsonb,
    related_slugs JSONB NOT NULL DEFAULT '[]'::jsonb,
    icon_name TEXT DEFAULT 'Wrench',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. SERVICE AREAS TABLE (Single source of truth for coverage areas)
CREATE TABLE IF NOT EXISTS public.service_areas (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    state TEXT DEFAULT '',
    city TEXT DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    intro TEXT DEFAULT '',
    areas_covered JSONB NOT NULL DEFAULT '[]'::jsonb,
    local_problems JSONB NOT NULL DEFAULT '[]'::jsonb,
    faqs JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. SERVICE REQUESTS TABLE
CREATE TABLE IF NOT EXISTS public.service_requests (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    ticket_number TEXT UNIQUE NOT NULL,
    customer_id TEXT REFERENCES public.customers(id) ON DELETE SET NULL,
    priority TEXT NOT NULL DEFAULT 'standard' CHECK (priority IN ('standard', 'urgent')),
    status TEXT NOT NULL DEFAULT 'new',
    property_type TEXT DEFAULT 'Residential / Home',
    address TEXT NOT NULL DEFAULT '',
    state TEXT DEFAULT '',
    city_lga TEXT DEFAULT '',
    neighbourhood TEXT DEFAULT '',
    preferred_timing TEXT DEFAULT 'As soon as possible',
    preferred_date TEXT,
    problem_category TEXT DEFAULT 'General Plumbing',
    category_slug TEXT,
    issue_description TEXT NOT NULL DEFAULT '',
    photos JSONB NOT NULL DEFAULT '[]'::jsonb,
    customer_name TEXT,
    customer_phone TEXT,
    customer_email TEXT,
    assigned_technician TEXT,
    assigned_plumber_id TEXT REFERENCES public.plumbers(id) ON DELETE SET NULL,
    quoted_amount NUMERIC(12, 2),
    internal_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. REQUEST HISTORY TABLE
CREATE TABLE IF NOT EXISTS public.request_history (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    request_id TEXT NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
    ticket_number TEXT NOT NULL,
    actor TEXT NOT NULL,
    actor_role TEXT DEFAULT 'system',
    action TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. QUOTATIONS TABLE (With revision tracking)
CREATE TABLE IF NOT EXISTS public.quotations (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    request_id TEXT REFERENCES public.service_requests(id) ON DELETE CASCADE,
    ticket_number TEXT NOT NULL,
    plumber_id TEXT REFERENCES public.plumbers(id) ON DELETE SET NULL,
    plumber_name TEXT NOT NULL,
    labour_charge NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    materials_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    transport_charge NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    other_charges NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    company_commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 20.00,
    company_commission NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    plumber_payable NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    is_small_job BOOLEAN NOT NULL DEFAULT FALSE,
    small_job_reason TEXT,
    customer_approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (customer_approval_status IN ('pending', 'approved', 'rejected')),
    customer_approved_at TIMESTAMPTZ,
    customer_feedback TEXT,
    admin_approved BOOLEAN NOT NULL DEFAULT TRUE,
    revision_number INTEGER NOT NULL DEFAULT 1,
    parent_quotation_id TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. MESSAGES TABLE
CREATE TABLE IF NOT EXISTS public.messages (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    request_id TEXT REFERENCES public.service_requests(id) ON DELETE CASCADE,
    ticket_number TEXT NOT NULL,
    sender_role TEXT NOT NULL CHECK (sender_role IN ('customer', 'plumber', 'admin')),
    sender_name TEXT NOT NULL,
    recipient_role TEXT NOT NULL CHECK (recipient_role IN ('customer', 'plumber', 'admin')),
    message TEXT NOT NULL DEFAULT '',
    attachment JSONB,
    is_internal BOOLEAN NOT NULL DEFAULT FALSE,
    admin_read BOOLEAN NOT NULL DEFAULT TRUE,
    read_by JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS public.payments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    request_id TEXT REFERENCES public.service_requests(id) ON DELETE SET NULL,
    ticket_number TEXT NOT NULL,
    customer_id TEXT REFERENCES public.customers(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    total_payment NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    labour_portion NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    materials_portion NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    company_commission NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    plumber_payable NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    payment_method TEXT NOT NULL DEFAULT 'bank_transfer' CHECK (payment_method IN ('bank_transfer', 'cash', 'pos')),
    transaction_ref TEXT,
    proof_storage_path TEXT,
    verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    verified_by TEXT,
    verified_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. ENQUIRIES TABLE
CREATE TABLE IF NOT EXISTS public.enquiries (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    subject TEXT DEFAULT 'General Enquiry',
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'new', 'contacted', 'closed')),
    admin_note TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. COMPLAINTS TABLE
CREATE TABLE IF NOT EXISTS public.complaints (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    request_id TEXT REFERENCES public.service_requests(id) ON DELETE SET NULL,
    ticket_number TEXT DEFAULT '',
    customer_id TEXT REFERENCES public.customers(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT DEFAULT '',
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'investigating', 'resolved')),
    admin_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. GALLERY ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.gallery_items (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General Plumbing',
    location TEXT DEFAULT '',
    caption TEXT DEFAULT '',
    image_url TEXT NOT NULL,
    alt_text TEXT DEFAULT '',
    service_slug TEXT,
    area_slug TEXT,
    published BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. AUDIT LOG TABLE
CREATE TABLE IF NOT EXISTS public.audit_log (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    actor TEXT NOT NULL,
    actor_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Helper for RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE auth_user_id = auth.uid()
      AND is_active = TRUE
  );
$$;

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plumbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plumber_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Policies (strict; zero USING (true))
CREATE POLICY "Admins manage admin_users" ON public.admin_users FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins manage customers" ON public.customers FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Customers read own profile" ON public.customers FOR SELECT TO authenticated USING (auth_user_id = auth.uid());
CREATE POLICY "Customers update own profile" ON public.customers FOR UPDATE TO authenticated USING (auth_user_id = auth.uid()) WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "Admins manage plumbers" ON public.plumbers FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Plumbers read own profile" ON public.plumbers FOR SELECT TO authenticated USING (auth_user_id = auth.uid());
CREATE POLICY "Plumbers update own availability" ON public.plumbers FOR UPDATE TO authenticated USING (auth_user_id = auth.uid()) WITH CHECK (auth_user_id = auth.uid());
CREATE POLICY "Public can submit plumber application" ON public.plumbers FOR INSERT TO anon, authenticated WITH CHECK (verification_status = 'submitted');

CREATE POLICY "Admins manage plumber_documents" ON public.plumber_documents FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Plumbers read own documents" ON public.plumber_documents FOR SELECT TO authenticated USING (plumber_id IN (SELECT id FROM public.plumbers WHERE auth_user_id = auth.uid()));

CREATE POLICY "Admins manage service_categories" ON public.service_categories FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Public read active service_categories" ON public.service_categories FOR SELECT TO anon, authenticated USING (is_active = TRUE);

CREATE POLICY "Admins manage service_areas" ON public.service_areas FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Public read active service_areas" ON public.service_areas FOR SELECT TO anon, authenticated USING (is_active = TRUE);

CREATE POLICY "Admins manage service_requests" ON public.service_requests FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Customers read own service_requests" ON public.service_requests FOR SELECT TO authenticated USING (customer_id IN (SELECT id FROM public.customers WHERE auth_user_id = auth.uid()));
CREATE POLICY "Plumbers read assigned service_requests" ON public.service_requests FOR SELECT TO authenticated USING (assigned_plumber_id IN (SELECT id FROM public.plumbers WHERE auth_user_id = auth.uid()));
CREATE POLICY "Public can submit service_requests" ON public.service_requests FOR INSERT TO anon, authenticated WITH CHECK (status = 'new');

CREATE POLICY "Admins manage request_history" ON public.request_history FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Customers and plumbers read own request_history" ON public.request_history FOR SELECT TO authenticated USING (request_id IN (SELECT sr.id FROM public.service_requests sr WHERE sr.customer_id IN (SELECT id FROM public.customers WHERE auth_user_id = auth.uid()) OR sr.assigned_plumber_id IN (SELECT id FROM public.plumbers WHERE auth_user_id = auth.uid())));

CREATE POLICY "Admins manage quotations" ON public.quotations FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Customers and plumbers read own quotations" ON public.quotations FOR SELECT TO authenticated USING (request_id IN (SELECT sr.id FROM public.service_requests sr WHERE sr.customer_id IN (SELECT id FROM public.customers WHERE auth_user_id = auth.uid()) OR sr.assigned_plumber_id IN (SELECT id FROM public.plumbers WHERE auth_user_id = auth.uid())));

CREATE POLICY "Admins manage messages" ON public.messages FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Plumbers read assigned job messages" ON public.messages FOR SELECT TO authenticated USING (request_id IN (SELECT sr.id FROM public.service_requests sr WHERE sr.assigned_plumber_id IN (SELECT id FROM public.plumbers WHERE auth_user_id = auth.uid())));
CREATE POLICY "Customers read own non-internal messages" ON public.messages FOR SELECT TO authenticated USING (is_internal = FALSE AND request_id IN (SELECT sr.id FROM public.service_requests sr WHERE sr.customer_id IN (SELECT id FROM public.customers WHERE auth_user_id = auth.uid())));

CREATE POLICY "Admins manage payments" ON public.payments FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Customers and plumbers read own payments" ON public.payments FOR SELECT TO authenticated USING (customer_id IN (SELECT id FROM public.customers WHERE auth_user_id = auth.uid()) OR request_id IN (SELECT sr.id FROM public.service_requests sr WHERE sr.assigned_plumber_id IN (SELECT id FROM public.plumbers WHERE auth_user_id = auth.uid())));

CREATE POLICY "Admins manage enquiries" ON public.enquiries FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Public can submit enquiries" ON public.enquiries FOR INSERT TO anon, authenticated WITH CHECK (status IN ('unread', 'new'));

CREATE POLICY "Admins manage complaints" ON public.complaints FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Customers read own complaints" ON public.complaints FOR SELECT TO authenticated USING (customer_id IN (SELECT id FROM public.customers WHERE auth_user_id = auth.uid()));

CREATE POLICY "Admins manage gallery_items" ON public.gallery_items FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Public read published gallery_items" ON public.gallery_items FOR SELECT TO anon, authenticated USING (published = TRUE);

CREATE POLICY "Admins manage settings" ON public.settings FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins manage audit_log" ON public.audit_log FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Private storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chat-uploads', 'chat-uploads', FALSE, 20971520)
ON CONFLICT (id) DO UPDATE SET public = FALSE, file_size_limit = 20971520;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('plumber-documents', 'plumber-documents', FALSE, 10485760)
ON CONFLICT (id) DO UPDATE SET public = FALSE, file_size_limit = 10485760;

CREATE POLICY "Admins manage private storage objects"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id IN ('chat-uploads', 'plumber-documents') AND public.is_admin())
  WITH CHECK (bucket_id IN ('chat-uploads', 'plumber-documents') AND public.is_admin());
