import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { setAuthCookies, toAuthUserSummary } from "@/lib/server/auth"
import {
  buildRateLimitHeaders,
  consumeRateLimit,
  getRequestIdentifier,
} from "@/lib/server/rate-limit"
import { getSupabaseServerClient, isSupabaseConfigured } from "@/lib/server/supabase"

const signupSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  password: z.string().min(8),
})

export async function POST(request: NextRequest) {
  const rateLimit = consumeRateLimit({
    key: `auth-signup:${getRequestIdentifier(request)}`,
    limit: 5,
    windowMs: 60 * 60 * 1000,
  })
  const rateLimitHeaders = buildRateLimitHeaders(rateLimit)

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many account creation attempts. Please wait and try again." },
      { status: 429, headers: rateLimitHeaders }
    )
  }

  try {
    const payload = signupSchema.parse(await request.json())

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "Supabase auth is not configured." }, { status: 503, headers: rateLimitHeaders })
    }

    const supabase = getSupabaseServerClient()
    if (!supabase) {
      return NextResponse.json({ error: "Supabase client is unavailable." }, { status: 503, headers: rateLimitHeaders })
    }

    const { data, error } = await supabase.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        data: {
          full_name: payload.fullName,
        },
      },
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (data.session) {
      setAuthCookies(data.session)
    }

    return NextResponse.json({
      user: data.user ? toAuthUserSummary(data.user) : null,
      requiresEmailVerification: !data.session,
    }, { headers: rateLimitHeaders })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to create account."
    return NextResponse.json({ error: message }, { status: 400, headers: rateLimitHeaders })
  }
}
