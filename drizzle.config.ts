import type { Config } from 'drizzle-kit'

const config: Config = {
  schema: './src/db/schema.ts',
  out: './drizzle',
  driver: 'pg',
}

export default config
