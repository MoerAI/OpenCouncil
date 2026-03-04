export type DebateType = 'simultaneous' | 'round' | 'structured' | 'freeform'

export type DebateStatus = 'pending' | 'streaming' | 'completed' | 'failed' | 'partial'

export interface Debate {
  id: string
  userId: string
  topic: string
  type: DebateType
  status: DebateStatus
  models: string[]  // e.g. ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.0-flash']
  createdAt: Date
  completedAt: Date | null
}

export interface DebateResponse {
  id: string
  debateId: string
  model: string
  role: string | null      // 'for' | 'against' | 'neutral' for structured debate
  round: number | null     // for round-based and freeform
  content: string
  tokenCount: number | null
  latencyMs: number | null
  createdAt: Date
}

export interface DebateSynthesis {
  id: string
  debateId: string
  content: string
  method: string  // 'llm-merge-simultaneous' | 'llm-merge-round' | etc.
  createdAt: Date
}
