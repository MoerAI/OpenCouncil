import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createUser } from '@/lib/auth/helpers'

const signupSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().optional(),
})

export async function POST(request: Request) {
  const body = await request.json() as unknown
  const parsed = signupSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  try {
    const { email, password, name } = parsed.data
    await createUser(email, password, name)
    return NextResponse.json({ success: true }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create account'
    const status = message === 'Email already in use' ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
