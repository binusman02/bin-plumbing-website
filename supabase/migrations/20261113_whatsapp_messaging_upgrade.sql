-- ============================================================================
-- Bin Plumbing Services Ltd: WhatsApp-Style Messaging Architecture Upgrade
-- Additive migration only. Preserves all existing messages and accounts.
-- ============================================================================

-- 1. Extend public.messages with verified sender/recipient & edit/soft-delete fields
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS sender_id text,
  ADD COLUMN IF NOT EXISTS recipient_id text,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_messages_ticket_created
  ON public.messages(ticket_number, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_messages_request_id
  ON public.messages(request_id);

-- 2. Per-recipient delivery & read receipts
CREATE TABLE IF NOT EXISTS public.message_receipts (
  id text PRIMARY KEY,
  message_id text NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  recipient_id text NOT NULL,
  recipient_role text NOT NULL CHECK (recipient_role IN ('admin', 'customer', 'plumber')),
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, recipient_id, recipient_role)
);

CREATE INDEX IF NOT EXISTS idx_message_receipts_recipient_unread
  ON public.message_receipts(recipient_role, recipient_id, read_at)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_message_receipts_message_id
  ON public.message_receipts(message_id);

ALTER TABLE public.message_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on message_receipts" ON public.message_receipts;
CREATE POLICY "Service role full access on message_receipts"
  ON public.message_receipts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. Temporary upload tokens bound to authenticated sender & optional ticket
CREATE TABLE IF NOT EXISTS public.chat_upload_tokens (
  stored_name text PRIMARY KEY,
  uploader_id text NOT NULL,
  uploader_role text NOT NULL CHECK (uploader_role IN ('admin', 'customer', 'plumber')),
  ticket_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

ALTER TABLE public.chat_upload_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on chat_upload_tokens" ON public.chat_upload_tokens;
CREATE POLICY "Service role full access on chat_upload_tokens"
  ON public.chat_upload_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
