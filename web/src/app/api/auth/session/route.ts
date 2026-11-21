import { NextResponse } from "next/server"
import { getCurrentUser, isAuthRequired, toAuthUserSummary } from "@/lib/server/auth"
import { isSupabaseConfigured } from "@/lib/server/supabase"

// Reads the caller's session cookies: must run per request, never prerendered
export const dynamic = "force-dynamic"

export async function GET() {
  const { user } = await getCurrentUser({ refreshIfNeeded: true })

  return NextResponse.json(
    {
      authEnabled: isSupabaseConfigured(),
      authRequired: isAuthRequired(),
      user: user ? toAuthUserSummary(user) : null,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  )
}
