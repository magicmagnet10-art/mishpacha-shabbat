-- הרץ גם את זה ב-Supabase SQL Editor

CREATE TABLE IF NOT EXISTS push_subscriptions (
  couple_name  TEXT PRIMARY KEY,
  role         TEXT NOT NULL DEFAULT 'couple',
  subscription JSONB NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push_public" ON push_subscriptions FOR ALL USING (true) WITH CHECK (true);
