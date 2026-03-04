import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { db } from '@/db'
import { users } from '@/db/schema'

/**
 * Get the current authenticated user or throw.
 * Use in server components / API routes that require auth.
 */
export async function getRequiredUser() {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error('Unauthorized')
  }
  return session.user
}

/**
 * Create a new user with hashed password.
 * Returns the created user record.
 */
export async function createUser(
  email: string,
  password: string,
  name?: string
) {
  // Check for existing user first
  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  })
  if (existing) {
    throw new Error('Email already in use')
  }

  const hashedPassword = await bcrypt.hash(password, 12)
  const id = crypto.randomUUID()

  const [user] = await db
    .insert(users)
    .values({
      id,
      email,
      password: hashedPassword,
      name: name ?? null,
    })
    .returning()

  if (!user) {
    throw new Error('Failed to create user')
  }

  return user
}
