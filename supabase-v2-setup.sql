-- ═══════════════════════════════════════════
--  הרץ את הקוד הזה ב-Supabase SQL Editor
--  (גרסה 2 — הרשאות + אישור בקשות)
-- ═══════════════════════════════════════════

-- 1. הוסף עמודת סטטוס לרישומים קיימים
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved';

-- 2. טבלת משתמשים
CREATE TABLE IF NOT EXISTS app_users (
  couple_name TEXT PRIMARY KEY,
  password    TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'couple'
);

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_can_read_users"   ON app_users FOR SELECT USING (true);
CREATE POLICY "anyone_can_update_users" ON app_users FOR UPDATE USING (true) WITH CHECK (true);

-- 3. הכנס משתמשים ברירת מחדל (שנה סיסמאות לפי רצונך!)
INSERT INTO app_users (couple_name, password, role) VALUES
  ('אביה ונריה',  'aviya123',   'couple'),
  ('אור ושרון',   'or123',      'couple'),
  ('רעות וניסים', 'rut123',     'couple'),
  ('חגי ושי',     'chagai123',  'couple'),
  ('דידי ותהל',   'didi123',    'couple'),
  ('נהוראי וחן',  'nahorai123', 'couple'),
  ('אבא',         'abba1234',   'admin')
ON CONFLICT (couple_name) DO NOTHING;

-- 4. טבלת תאריכים חסומים
CREATE TABLE IF NOT EXISTS blocked_dates (
  date_id TEXT PRIMARY KEY,
  reason  TEXT DEFAULT ''
);

ALTER TABLE blocked_dates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_blocked"  ON blocked_dates FOR SELECT USING (true);
CREATE POLICY "public_write_blocked" ON blocked_dates FOR ALL   USING (true) WITH CHECK (true);

-- 5. הוסף לרשימת הrealtime
ALTER PUBLICATION supabase_realtime ADD TABLE blocked_dates;
