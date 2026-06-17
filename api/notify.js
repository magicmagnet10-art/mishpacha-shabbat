import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = 'https://izwrjvvvexxlgahayomb.supabase.co'
const SUPABASE_KEY  = process.env.SUPABASE_ANON_KEY
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    webpush.setVapidDetails('mailto:admin@mishpacha.app', VAPID_PUBLIC, VAPID_PRIVATE)

    const { record } = req.body
    if (!record) return res.status(400).json({ error: 'no record' })

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .eq('role', 'admin')

    if (!subs?.length) return res.status(200).json({ ok: true, sent: 0 })

    const payload = JSON.stringify({
      title: '🏠 בקשה חדשה!',
      body: `${record.couple_name} מבקשים לבוא`,
    })

    await Promise.all(
      subs.map(({ subscription }) =>
        webpush.sendNotification(subscription, payload).catch(() => null)
      )
    )

    res.status(200).json({ ok: true, sent: subs.length })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
}
