import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { setAuthCookies, toAuthUserSummary } from "@/lib/server/auth"
import { getSupabaseServerClient, isSupabaseConfigured } from "@/lib/server/supabase"

const signupSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8),
})

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase auth is not configured." }, { status: 503 })
  }

  const supabase = getSupabaseServerClient()
  if (!supabase) {
    return NextResponse.json({ error: "Supabase client is unavailable." }, { status: 503 })
  }

  try {
    const payload = signupSchema.parse(await request.json())
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
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to create account."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
