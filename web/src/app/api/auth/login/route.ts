import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { setAuthCookies, toAuthUserSummary } from "@/lib/server/auth"
import { getSupabaseServerClient, isSupabaseConfigured } from "@/lib/server/supabase"

const loginSchema = z.object({
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
    const payload = loginSchema.parse(await request.json())
    const { data, error } = await supabase.auth.signInWithPassword(payload)

    if (error || !data.session || !data.user) {
      return NextResponse.json(
        { error: error?.message ?? "Invalid email or password." },
        { status: 401 }
      )
    }

    setAuthCookies(data.session)

    return NextResponse.json({
      user: toAuthUserSummary(data.user),
      requiresEmailVerification: false,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to sign in."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
