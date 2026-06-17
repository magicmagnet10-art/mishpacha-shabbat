-- הרץ את זה ב-SQL Editor כדי לשלוח התראה לאבא בכל בקשה חדשה

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION notify_admin_on_request()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    PERFORM net.http_post(
      url     := 'https://aba-livid-psi.vercel.app/api/notify',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body    := json_build_object(
        'record', json_build_object(
          'couple_name', NEW.couple_name,
          'event_id',    NEW.event_id
        )
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_new_registration ON registrations;
CREATE TRIGGER on_new_registration
  AFTER INSERT ON registrations
  FOR EACH ROW
  EXECUTE FUNCTION notify_admin_on_request();
