import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.7'

const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

webpush.setVapidDetails('mailto:admin@mishpacha.app', VAPID_PUBLIC, VAPID_PRIVATE)

Deno.serve(async (req) => {
  try {
    const payload = await req.json()
    const record  = payload.record // the new registration row

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    // Get all admin push subscriptions
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .eq('role', 'admin')

    if (!subs || subs.length === 0) {
      return new Response('no admin subscriptions', { status: 200 })
    }

    const message = {
      title: '🏠 בקשה חדשה!',
      body:  `${record.couple_name} מבקשים לבוא ב-${record.event_id}`,
    }

    await Promise.all(
      subs.map(({ subscription }) =>
        webpush.sendNotification(subscription, JSON.stringify(message)).catch(() => null)
      )
    )

    return new Response('ok', { status: 200 })
  } catch (err) {
    return new Response(String(err), { status: 500 })
  }
})
