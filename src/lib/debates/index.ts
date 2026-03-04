export {
  createDebate,
  getDebate,
  listDebates,
  updateDebateStatus,
  saveDebateResponse,
  saveSynthesis,
  getDebateResponses,
  getDebateSynthesis,
} from './service'

export {
  debateTypeSchema,
  createDebateSchema,
} from './validation'

export type { CreateDebateInput } from './validation'
