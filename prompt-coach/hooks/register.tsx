import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Analysis, CoachStatus, ModelTier } from '../types'

const PANE = 'prompt-coach'
const ANALYZER_MODEL = 'haiku'

const status = atom({ plugin: 'prompt-coach', key: 'status' } as const, 'idle' as CoachStatus)
const analysis = atom({ plugin: 'prompt-coach', key: 'analysis' } as const, null as Analysis | null)
const error = atom({ plugin: 'prompt-coach', key: 'error' } as const, '')

const TIERS: readonly ModelTier[] = ['haiku', 'sonnet', 'opus']

const SYSTEM = `You are a prompt engineer for Claude Code, a coding agent.
Given a user's prompt, return ONLY a JSON object (no prose, no code fences) with:
- "improved": a rewritten version of the prompt that is clearer and more actionable: explicit goal, relevant context, constraints and acceptance criteria. Do not invent facts; where information is missing, leave a short placeholder like <...>. Keep it concise.
- "taskType": a short label for the kind of task (e.g. "trivial question", "simple edit", "bug fix", "feature", "architecture / design", "complex debugging", "research").
- "suggestedModel": one of "haiku", "sonnet", "opus".
   haiku: trivial questions, small mechanical edits, renames, formatting, quick lookups.
   sonnet: typical coding work: features, bug fixes, tests, refactors of moderate size.
   opus: hard reasoning: architecture, ambiguous requirements, complex multi-file debugging, deep analysis.
- "reason": one short sentence justifying the model choice.
CRITICAL: "improved", "taskType" and "reason" MUST be written in the same language as the user's prompt.`

/** Reduce a model id or alias ("claude-opus-5-5", "sonnet") to its tier, if known. */
export const tierOf = (model: string): ModelTier | undefined =>
  TIERS.find(tier => model.toLowerCase().includes(tier))

/** Parse Haiku's reply, tolerating code fences or text around the JSON. */
export const parseAnalysis = (
  text: string,
  original: string,
  currentModel: string,
): Analysis | undefined => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) {
    return undefined
  }
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
    const suggested = tierOf(String(raw.suggestedModel ?? ''))
    if (typeof raw.improved !== 'string' || !raw.improved.trim() || !suggested) {
      return undefined
    }
    return {
      original,
      improved: raw.improved.trim(),
      taskType: String(raw.taskType ?? ''),
      suggestedModel: suggested,
      reason: String(raw.reason ?? ''),
      currentModel,
    }
  } catch {
    return undefined
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'coach',
      description: 'Mejora un prompt con Haiku y recomienda qué modelo usar',
      argumentHint: '<prompt>',
    })

    return next(e)
  })

  on('command.run', { command: 'coach' }, async ($, e) => {
    const original = e.args.trim()
    if (!original) {
      return { text: 'Uso: /coach <prompt>' }
    }

    await update($, status, () => 'analyzing')
    await update($, analysis, () => null)
    await update($, error, () => '')
    await $.ui.open({ id: PANE, title: 'Prompt coach', focus: true, closeOnEscape: true })

    // The analysis outlives the hook's budget, so it runs unawaited and the pane redraws when it lands.
    void (async () => {
      const currentModel = await $.session.model()
      const reply = await $.model.complete({
        model: ANALYZER_MODEL,
        system: SYSTEM,
        prompt: original,
        maxTokens: 2000,
        timeoutMs: 30000,
      })
      const parsed = reply.isAnswered ? parseAnalysis(reply.text, original, currentModel) : undefined
      if (parsed) {
        await update($, analysis, () => parsed)
        await update($, status, () => 'ready')
        return
      }
      const why = reply.isAnswered ? 'respuesta no válida' : reply.reason
      await update($, error, () => `No se pudo analizar (${why}).`)
      await update($, status, () => 'error')
    })()

    return { text: `Analizando el prompt con ${ANALYZER_MODEL}…` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const current = await read($, status)

    const close = async () => {
      await update($, status, () => 'idle')
      await $.ui.close({ id: PANE })
    }
    const send = async (text: string) => {
      await close()
      await $.prompt.submit({ text })
    }

    if (current === 'analyzing') {
      return <Text dimColor>Analizando con {ANALYZER_MODEL}…</Text>
    }
    if (current !== 'ready') {
      return (
        <Box flexDirection="column">
          <Text color="red">{current === 'error' ? await read($, error) : 'Usa /coach <prompt>.'}</Text>
          <Button key="close" label="Cerrar" hotkey="c" onPress={close} />
        </Box>
      )
    }

    const result = await read($, analysis)
    if (!result) {
      return <Text dimColor>Sin análisis.</Text>
    }
    const currentTier = tierOf(result.currentModel)
    const shouldSwitch = currentTier !== result.suggestedModel

    const switchAndSend = async () => {
      try {
        await $.command.run({ command: 'model', args: result.suggestedModel })
        $.ui.toast(`Modelo cambiado a ${result.suggestedModel}`)
      } catch {
        $.ui.toast(`No pude cambiar el modelo: ejecuta /model ${result.suggestedModel}`)
      }
      await send(result.improved)
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold>Original</Text>
          <Text dimColor>{result.original}</Text>
        </Box>
        <Box flexDirection="column">
          <Text bold color="green">Mejorado</Text>
          <Text>{result.improved}</Text>
        </Box>
        <Box flexDirection="column">
          <Text bold>Tarea: {result.taskType}</Text>
          <Text>
            Modelo actual: {result.currentModel} · Recomendado:{' '}
            <Text bold color={shouldSwitch ? 'yellow' : 'green'}>{result.suggestedModel}</Text>
          </Text>
          <Text dimColor>{result.reason}</Text>
        </Box>
        <Box flexDirection="row" gap={1}>
          {shouldSwitch && (
            <Button
              key="switch"
              label={`Cambiar a ${result.suggestedModel} y enviar mejorado`}
              hotkey="s"
              variant="primary"
              onPress={switchAndSend}
            />
          )}
          <Button
            key="improved"
            label="Enviar mejorado"
            hotkey="m"
            variant={shouldSwitch ? 'secondary' : 'primary'}
            onPress={() => send(result.improved)}
          />
          <Button key="original" label="Enviar original" hotkey="o" onPress={() => send(result.original)} />
          <Button key="cancel" label="Cancelar" hotkey="c" onPress={close} />
        </Box>
      </Box>
    )
  })
}
