import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let client: SupabaseClient | null | undefined

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY)
}

export function getSupabaseServerClient(): SupabaseClient | null {
  if (client !== undefined) return client

  if (!isSupabaseConfigured()) {
    client = null
    return client
  }

  client = createClient(
    process.env.SUPABASE_URL as string,
    process.env.SUPABASE_ANON_KEY as string,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  )

  return client
}
