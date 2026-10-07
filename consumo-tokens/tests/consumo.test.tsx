import { expect, mock, test } from 'claude-code/testing'

import { bar, formatTokens, formatUsd } from '../hooks/register'

const CWD = 'C:/proyectos/api-alumnos'

test('formatea tokens, dólares y barra', () => {
  expect(formatTokens(950)).toBe('950')
  expect(formatTokens(84_200)).toBe('84,2k')
  expect(formatTokens(1_234_567)).toBe('1,23M')
  expect(formatUsd(3.1)).toBe('US$3,10')
  expect(bar(42)).toBe('████░░░░░░')
})

test('un turno suma tokens a la sesión y al proyecto, y la banda lo muestra', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: 1000 })
  on('session.cwd', async () => ({ value: CWD }))
  on('session.id', async () => ({ value: 'sesion-1' }))
  on('session.usage', async () => ({
    value: {
      startedAt: 0,
      context: { tokens: 84_200, window: 200_000, percent: 42 },
      rateLimits: [],
      cost: { usd: 3.1 },
    },
  }))
  on('command.register', async ($, e) => ({ value: { command: e.name } }))
  on('session.start', async () => ({ cwd: CWD }))
  on('session.measure', async ($, e) => ({ changed: e.changed }))
  on('turn.complete', async ($, e) => ({ text: e.answer, usage: e.usage }))

  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await $.session.measure({
    context: { tokens: 84_200, window: 200_000, percent: 42 },
    rateLimits: [],
    cost: { usd: 3.1 },
    changed: ['context', 'cost'],
  })
  await $.turn.complete({
    answer: 'ok',
    durationMs: 10,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    usage: {
      model: 'claude-opus-5-5',
      input_tokens: 1000,
      output_tokens: 500,
      cache_read_input_tokens: 80_000,
      cache_creation_input_tokens: 2000,
    },
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'consumo-tokens',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 } as never,
    })
    expect(await ui.find({ type: 'Text', text: /42%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /83,5k tok · US\$3,10/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /US\$3,10 \(1 ses\.\)/ })).toBeDefined()
    await ui.unmount()
  }
})

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 } as never,
} as const

const measure = (percent: number) => ({
  context: { tokens: percent * 2000, window: 200_000, percent },
  rateLimits: [],
  cost: { usd: 1 },
  changed: ['context' as const],
})

test('el botón Compactar aparece desde 80% y compacta al presionarlo', async ($, on) => {
  let compactions = 0
  mock.store(on)
  on('ui.toast', async () => ({ value: undefined }))
  on('session.measure', async ($, e) => ({ changed: e.changed }))
  on('session.compact', async () => {
    compactions += 1
    return { skip: 'prueba' }
  })

  await $.session.measure(measure(50))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'consumo-tokens', surface, ...BAND })
    expect(await ui.find({ key: 'compactar' })).toBeUndefined()
    await ui.unmount()
  }

  await $.session.measure(measure(85))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'consumo-tokens', surface, ...BAND })
    expect(await ui.find({ key: 'compactar' })).toBeDefined()
    await ui.press({ key: 'compactar' })
    await ui.unmount()
  }
  expect(compactions).toBe(2)
})
