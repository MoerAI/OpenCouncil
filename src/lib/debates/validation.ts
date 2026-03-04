import { z } from 'zod'

export const debateTypeSchema = z.enum(['simultaneous', 'round', 'structured', 'freeform'])

export const createDebateSchema = z.object({
  topic: z.string().min(1, 'Topic is required').max(2000, 'Topic too long'),
  type: debateTypeSchema,
  models: z.array(z.string()).min(2, 'At least 2 models required').max(5, 'Maximum 5 models'),
})

export type CreateDebateInput = z.infer<typeof createDebateSchema>
