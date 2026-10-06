import { expect, test } from 'claude-code/testing'

import { parseAnalysis, tierOf } from './register'

const PANE = {
  component: 'Pane',
  requestId: 'prompt-coach',
  props: {
    title: 'Prompt coach',
    isFocused: true,
    bodyColumns: 100,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const

const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const REPLY = JSON.stringify({
  improved: 'Renombra la variable `x` a `total` en src/app.ts y actualiza sus usos.',
  taskType: 'edición simple',
  suggestedModel: 'haiku',
  reason: 'Es un cambio mecánico y acotado.',
})

test('tierOf reconoce ids y alias', () => {
  expect(tierOf('claude-opus-5-5')).toBe('opus')
  expect(tierOf('sonnet')).toBe('sonnet')
  expect(tierOf('claude-fable-5-1')).toBe(undefined)
})

test('parseAnalysis tolera code fences y rechaza basura', () => {
  const parsed = parseAnalysis('```json\n' + REPLY + '\n```', 'renombra x', 'opus')
  expect(parsed?.suggestedModel).toBe('haiku')
  expect(parseAnalysis('no json here', 'x', 'opus')).toBe(undefined)
  expect(parseAnalysis('{"improved":"a","suggestedModel":"gpt"}', 'x', 'opus')).toBe(undefined)
})

test('/coach sin argumentos muestra el uso', async $ => {
  const result = await $.command.run({ ...RUN, command: 'coach', args: '' })
  expect(result.text).toContain('Uso')
})

test('/coach analiza, propone cambiar de modelo y envía el prompt mejorado', async ($, on) => {
  const submitted: string[] = []
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('model.complete', () => ({ value: { isAnswered: true, text: REPLY, usage: USAGE } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('prompt.submit', (_$, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })

  const result = await $.command.run({ ...RUN, command: 'coach', args: 'renombra x' })
  expect(result.text).toContain('Analizando')

  const mounted = []
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'prompt-coach', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /Renombra la variable/ })).toBeDefined()
    expect(await ui.find({ key: 'switch' })).toBeDefined()
    mounted.push(ui)
  }

  await mounted[1]!.press({ key: 'improved' })
  expect(submitted).toEqual(['Renombra la variable `x` a `total` en src/app.ts y actualiza sus usos.'])
})
