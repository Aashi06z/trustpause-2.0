import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type RiskEvent = {
  id: string
  title: string
  detail: string
  risk: string
  status: 'Protected' | 'Blocked' | 'Reviewed'
  occurred_at: string
  tone: 'green' | 'red' | 'amber'
  guardian: string
}

export type TrustCircleMember = {
  id: string
  name: string
  initials: string
  relationship: string | null
}

export type UserSettings = {
  message_analysis_consent: boolean
  trust_circle_requests: boolean
  browser_link_interception: boolean
  payment_pause: boolean
  call_screening: boolean
  media_checks: boolean
  hold_to_continue: boolean
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  message_analysis_consent: true,
  trust_circle_requests: true,
  browser_link_interception: true,
  payment_pause: true,
  call_screening: true,
  media_checks: true,
  hold_to_continue: true,
}

let client: SupabaseClient | null = null

export function getSupabase() {
  if (client) return client
  if (process.env.NEXT_PUBLIC_SUPABASE_ENABLED !== 'true') return null
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  try {
    client = createClient(url, key)
  } catch (error) {
    console.warn('Supabase configuration is invalid; using local demo data.', error)
    return null
  }
  return client
}

export async function ensureAnonymousUser() {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data: session } = await supabase.auth.getSession()
  if (session.session?.user) return session.session.user
  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) {
    console.warn('Supabase anonymous auth is unavailable; using local demo data.', error.message)
    return null
  }
  return data.user
}