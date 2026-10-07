/** Lo que el contexto vivo y el costo de la sesión muestran ahora. */
export type Live = {
  /** Porcentaje del contexto usado, 0..100; ausente antes de la primera respuesta. */
  percent?: number
  /** Tokens de entrada de la última respuesta (lo que ocupa el contexto). */
  tokens?: number
  /** Tamaño de la ventana de contexto del modelo. */
  window: number
  /** Costo estimado de la sesión en USD. */
  usd: number
}

/** Lo acumulado por una sesión, guardado en $.store dentro de su proyecto. */
export type SessionEntry = {
  usd: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  updatedAt: number
}

/** Una fila de la tabla por proyecto. */
export type ProjectRow = {
  cwd: string
  sessions: number
  tokens: number
  usd: number
}

declare module 'claude-code' {
  interface PluginState {
    'consumo-tokens': {
      live: Live | null
      session: SessionEntry | null
      projects: ProjectRow[]
      cwd: string
      alerted: boolean
      compacting: boolean
    }
  }
}
