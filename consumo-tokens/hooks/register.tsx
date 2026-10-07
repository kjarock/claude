import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Live, ProjectRow, SessionEntry } from '../types'

const PANE = 'consumo-tokens'
const PREFIX = 'proyecto:'
const ALERT_PERCENT = 80

const live = atom({ plugin: 'consumo-tokens', key: 'live' } as const, null)
const session = atom({ plugin: 'consumo-tokens', key: 'session' } as const, null)
const projects = atom({ plugin: 'consumo-tokens', key: 'projects' } as const, [])
const cwdAtom = atom({ plugin: 'consumo-tokens', key: 'cwd' } as const, '')
const alerted = atom({ plugin: 'consumo-tokens', key: 'alerted' } as const, false)
const compacting = atom({ plugin: 'consumo-tokens', key: 'compacting' } as const, false)

type Ledger = { sessions: Record<string, SessionEntry> }

const EMPTY_ENTRY: SessionEntry = {
  usd: 0,
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  updatedAt: 0,
}

/** 1234 -> "1,2k", 1234567 -> "1,23M" (coma decimal). */
export const formatTokens = (n: number): string => {
  if (n < 1000) return String(Math.round(n))
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace('.', ',')}k`
  return `${(n / 1_000_000).toFixed(2).replace('.', ',')}M`
}

export const formatUsd = (usd: number): string =>
  `US$${usd.toFixed(2).replace('.', ',')}`

export const bar = (percent: number, cells = 10): string => {
  const filled = Math.min(cells, Math.max(0, Math.round((percent / 100) * cells)))
  return '█'.repeat(filled) + '░'.repeat(cells - filled)
}

const colorFor = (percent: number): string =>
  percent >= ALERT_PERCENT ? 'red' : percent >= 60 ? 'yellow' : 'green'

const totalTokens = (s: SessionEntry): number =>
  s.input + s.output + s.cacheRead + s.cacheWrite

const shortPath = (cwd: string): string => {
  const parts = cwd.split(/[\\/]/).filter(Boolean)
  return parts.length <= 2 ? cwd : `…/${parts.slice(-2).join('/')}`
}

const asLedger = (value: unknown): Ledger => {
  const v = value as Ledger | undefined
  return v && typeof v === 'object' && v.sessions ? v : { sessions: {} }
}

/** Relee $.store y arma la tabla por proyecto, de mayor a menor gasto. */
async function refreshProjects($: EngineInterface): Promise<void> {
  const keys = (await $.store.keys()).filter(k => k.startsWith(PREFIX))
  const rows: ProjectRow[] = []
  for (const key of keys) {
    const sessions = Object.values(asLedger(await $.store.get(key)).sessions)
    rows.push({
      cwd: key.slice(PREFIX.length),
      sessions: sessions.length,
      tokens: sessions.reduce((sum, s) => sum + totalTokens(s), 0),
      usd: sessions.reduce((sum, s) => sum + s.usd, 0),
    })
  }
  rows.sort((a, b) => b.usd - a.usd)
  await update($, projects, () => rows)
}

/** Compacta la conversación, como /compact, y avisa cómo terminó. */
async function compactNow($: EngineInterface): Promise<void> {
  if (await read($, compacting)) return
  await update($, compacting, () => true)
  try {
    const result = await $.session.compact()
    if (result.skip !== undefined) {
      $.ui.toast(`Compactación omitida: ${result.skip}`)
    } else {
      $.ui.toast('Contexto compactado')
    }
  } catch (error) {
    $.ui.toast(`No se pudo compactar: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    await update($, compacting, () => false)
  }
}

async function openPane($: EngineInterface): Promise<void> {
  await $.ui.open({ id: PANE, title: 'Consumo por proyecto' })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({
      name: 'consumo',
      description: 'Muestra el consumo de tokens y costo estimado por proyecto',
    })
    const cwd = await $.session.cwd()
    const id = await $.session.id()
    const ledger = asLedger(await $.store.get(PREFIX + cwd))
    await update($, cwdAtom, () => cwd)
    await update($, session, () => ledger.sessions[id] ?? null)
    await refreshProjects($)

    return result
  })

  on('command.run', { command: 'consumo' }, async $ => {
    await refreshProjects($)
    await openPane($)

    return { text: 'Panel de consumo abierto.' }
  })

  // Cifras empujadas por el engine: contexto y costo en vivo.
  on('session.measure', async ($, e, next) => {
    const now: Live = {
      percent: e.context.percent,
      tokens: e.context.tokens,
      window: e.context.window,
      usd: e.cost?.usd ?? 0,
    }
    await update($, live, () => now)

    const percent = e.context.percent ?? 0
    if (percent >= ALERT_PERCENT && !(await read($, alerted))) {
      await update($, alerted, () => true)
      $.ui.toast(`Contexto al ${percent}%: usa el botón Compactar de la barra`)
    } else if (percent < ALERT_PERCENT && (await read($, alerted))) {
      await update($, alerted, () => false)
    }

    return next(e)
  })

  // Al cerrar cada turno, suma sus tokens a la sesión y la guarda en su proyecto.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const usage = e.usage
    if (!usage) return result

    const cwd = await $.session.cwd()
    const id = await $.session.id()
    const key = PREFIX + cwd
    const ledger = asLedger(await $.store.get(key))
    const prev = ledger.sessions[id] ?? EMPTY_ENTRY
    const usd = (await $.session.usage()).cost?.usd ?? prev.usd
    const entry: SessionEntry = {
      usd,
      input: prev.input + usage.input_tokens,
      output: prev.output + usage.output_tokens,
      cacheRead: prev.cacheRead + usage.cache_read_input_tokens,
      cacheWrite: prev.cacheWrite + usage.cache_creation_input_tokens,
      updatedAt: await $.clock.now(),
    }
    await $.store.set(key, { sessions: { ...ledger.sessions, [id]: entry } })
    await update($, session, () => entry)
    await update($, live, now => (now ? { ...now, usd } : now))
    await refreshProjects($)

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const now = await read($, live)
    const mine = await read($, session)
    const cwd = await read($, cwdAtom)
    const project = (await read($, projects)).find(row => row.cwd === cwd)
    const { Box, Text, Button } = $.ui.resolve(e)

    const percent = now?.percent
    const isBusy = await read($, compacting)
    const showCompact = isBusy || (percent ?? 0) >= ALERT_PERCENT
    const compactLabel = isBusy
      ? 'Compactando…'
      : e.props.isWorking
        ? 'Compactar (espera)'
        : 'Compactar'
    const sessionTokens = mine ? totalTokens(mine) : 0
    const sessionUsd = now?.usd ?? mine?.usd ?? 0

    return (
      <Box flexDirection="row" gap={1}>
        <Text dimColor>ctx</Text>
        {percent === undefined ? (
          <Text dimColor>—</Text>
        ) : (
          <Text color={colorFor(percent)}>
            {bar(percent)} {percent}%
          </Text>
        )}
        {now?.tokens !== undefined && (
          <Text dimColor>
            ({formatTokens(now.tokens)}/{formatTokens(now.window)})
          </Text>
        )}
        {showCompact && (
          <Button
            key="compactar"
            label={compactLabel}
            variant="primary"
            dimColor={isBusy || e.props.isWorking}
            onPress={() => (isBusy || e.props.isWorking ? undefined : compactNow($))}
          />
        )}
        <Text dimColor>│ sesión</Text>
        <Text>
          {formatTokens(sessionTokens)} tok · {formatUsd(sessionUsd)}
        </Text>
        {project && (
          <>
            <Text dimColor>│ proyecto</Text>
            <Text>
              {formatUsd(project.usd)} ({project.sessions} ses.)
            </Text>
          </>
        )}
        <Button key="detalle" label="Detalle" onPress={() => openPane($)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const rows = await read($, projects)
    const mine = await read($, session)
    const cwd = await read($, cwdAtom)
    const total = rows.reduce((sum, row) => sum + row.usd, 0)

    return (
      <Box flexDirection="column">
        <Text bold>Sesión actual</Text>
        {mine ? (
          <Text>
            entrada {formatTokens(mine.input)} · salida {formatTokens(mine.output)} · caché
            leída {formatTokens(mine.cacheRead)} · caché escrita {formatTokens(mine.cacheWrite)} ·{' '}
            {formatUsd(mine.usd)}
          </Text>
        ) : (
          <Text dimColor>Aún no hay turnos en esta sesión.</Text>
        )}
        <Text> </Text>
        <Text bold>Por proyecto (costo estimado a precio de lista API)</Text>
        {rows.length === 0 && <Text dimColor>Sin datos todavía.</Text>}
        {rows.map(row => (
          <Text key={row.cwd} bold={row.cwd === cwd}>
            {formatUsd(row.usd).padStart(10)} {formatTokens(row.tokens).padStart(7)} tok{' '}
            {String(row.sessions).padStart(3)} ses. {shortPath(row.cwd)}
          </Text>
        ))}
        {rows.length > 0 && <Text dimColor>Total: {formatUsd(total)}</Text>}
      </Box>
    )
  })
}
