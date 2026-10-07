export type ModelTier = 'haiku' | 'sonnet' | 'opus'

export type Analysis = {
  original: string
  improved: string
  taskType: string
  suggestedModel: ModelTier
  reason: string
  currentModel: string
  /** Mensajes de la conversación que se le pasaron al analizador. */
  contextMessages: number
}

export type CoachStatus = 'idle' | 'analyzing' | 'ready' | 'error'

declare module 'claude-code' {
  interface PluginState {
    'prompt-coach': {
      status: CoachStatus
      analysis: Analysis | null
      error: string
    }
  }
}
