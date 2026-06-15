import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = typeof url === 'string' && url.startsWith('https://')

export const supabase = isConfigured
  ? createClient(url, key)
  : createClient('https://placeholder.supabase.co', 'placeholder-key')
