import { pgTable, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'

// Users table
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').unique().notNull(),
  emailVerified: timestamp('email_verified'),
  image: text('image'),
  password: text('password'), // nullable — OAuth users won't have one
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Accounts table (Auth.js OAuth)
export const accounts = pgTable(
  'accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (table) => ({
    pk: {
      primaryKey: [table.provider, table.providerAccountId],
    },
  })
)

// Sessions table (Auth.js sessions)
export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires').notNull(),
})

// Verification tokens table (Auth.js email verification)
export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires').notNull(),
  },
  (table) => ({
    pk: {
      primaryKey: [table.identifier, table.token],
    },
  })
)

// API Keys table
export const apiKeys = pgTable(
  'api_keys',
  {
    id: text('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(), // 'openai', 'anthropic', 'google'
    encryptedKey: text('encrypted_key').notNull(),
    keyHint: text('key_hint').notNull(), // last 4 chars, e.g. "4x9z"
    iv: text('iv').notNull(),
    salt: text('salt').notNull(),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at'),
  },
  (table) => ({
    uniq: {
      unique: [table.userId, table.provider],
    },
  })
)

// Debates table
export const debates = pgTable('debates', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  topic: text('topic').notNull(),
  type: text('type').notNull(), // 'simultaneous', 'round', 'structured', 'freeform'
  status: text('status').notNull().default('pending'), // 'pending', 'streaming', 'completed', 'failed', 'partial'
  models: text('models').notNull(), // JSON array stored as text
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
})

// Debate Responses table
export const debateResponses = pgTable('debate_responses', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  debateId: text('debate_id')
    .notNull()
    .references(() => debates.id, { onDelete: 'cascade' }),
  model: text('model').notNull(),
  role: text('role'),
  round: integer('round'),
  content: text('content').notNull(),
  tokenCount: integer('token_count'),
  latencyMs: integer('latency_ms'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Debate Syntheses table
export const debateSyntheses = pgTable('debate_syntheses', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  debateId: text('debate_id')
    .notNull()
    .references(() => debates.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  method: text('method').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// RAG Contexts table
export const ragContexts = pgTable('rag_contexts', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  debateId: text('debate_id')
    .notNull()
    .references(() => debates.id, { onDelete: 'cascade' }),
  query: text('query').notNull(),
  sources: text('sources').notNull(), // JSON array stored as text
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  apiKeys: many(apiKeys),
  debates: many(debates),
}))

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}))

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
}))

export const debatesRelations = relations(debates, ({ one, many }) => ({
  user: one(users, {
    fields: [debates.userId],
    references: [users.id],
  }),
  responses: many(debateResponses),
  syntheses: many(debateSyntheses),
  ragContexts: many(ragContexts),
}))

export const debateResponsesRelations = relations(debateResponses, ({ one }) => ({
  debate: one(debates, {
    fields: [debateResponses.debateId],
    references: [debates.id],
  }),
}))

export const debateSynthesesRelations = relations(debateSyntheses, ({ one }) => ({
  debate: one(debates, {
    fields: [debateSyntheses.debateId],
    references: [debates.id],
  }),
}))

export const ragContextsRelations = relations(ragContexts, ({ one }) => ({
  debate: one(debates, {
    fields: [ragContexts.debateId],
    references: [debates.id],
  }),
}))
