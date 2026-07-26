import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { setAuthCookies, toAuthUserSummary } from "@/lib/server/auth"
import {
  buildRateLimitHeaders,
  consumeRateLimit,
  getRequestIdentifier,
} from "@/lib/server/rate-limit"
import { getSupabaseServerClient, isSupabaseConfigured } from "@/lib/server/supabase"

const loginSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  password: z.string().min(8),
})

export async function POST(request: NextRequest) {
  const rateLimit = consumeRateLimit({
    key: `auth-login:${getRequestIdentifier(request)}`,
    limit: 10,
    windowMs: 15 * 60 * 1000,
  })
  const rateLimitHeaders = buildRateLimitHeaders(rateLimit)

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Please wait and try again." },
      { status: 429, headers: rateLimitHeaders }
    )
  }

  try {
    const payload = loginSchema.parse(await request.json())

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "Supabase auth is not configured." }, { status: 503, headers: rateLimitHeaders })
    }

    const supabase = getSupabaseServerClient()
    if (!supabase) {
      return NextResponse.json({ error: "Supabase client is unavailable." }, { status: 503, headers: rateLimitHeaders })
    }

    const { data, error } = await supabase.auth.signInWithPassword(payload)

    if (error || !data.session || !data.user) {
      return NextResponse.json(
        { error: error?.message ?? "Invalid email or password." },
        { status: 401, headers: rateLimitHeaders }
      )
    }

    setAuthCookies(data.session)

    return NextResponse.json({
      user: toAuthUserSummary(data.user),
      requiresEmailVerification: false,
    }, { headers: rateLimitHeaders })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to sign in."
    return NextResponse.json({ error: message }, { status: 400, headers: rateLimitHeaders })
  }
}
