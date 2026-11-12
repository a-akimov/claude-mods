import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'context-bar',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 42,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
  viewport: { columns: 42, rows: 24 },
} as const

const BREAKDOWN = {
  categories: [
    { name: 'System prompt', tokens: 3000, color: 'promptBorder', isDeferred: false, kind: 'used' },
    { name: 'Messages', tokens: 37000, color: 'purple_FOR_SUBAGENTS_ONLY', isDeferred: false, kind: 'used' },
    { name: 'MCP tools', tokens: 9000, color: 'cyan_FOR_SUBAGENTS_ONLY', isDeferred: true, kind: 'deferred' },
    { name: 'Free space', tokens: 127000, color: 'promptBorder', isDeferred: false, kind: 'free' },
    { name: 'Autocompact buffer', tokens: 33000, color: 'inactive', isDeferred: false, kind: 'buffer' },
  ],
  totalTokens: 40000,
  maxTokens: 200000,
  rawMaxTokens: 200000,
  autocompactSource: 'model-default',
  percentage: 20,
  gridRows: [],
  model: 'claude-opus-5-5',
  memoryFiles: [],
  mcpTools: [],
  agents: [],
  isAutoCompactEnabled: true,
  apiUsage: null,
}

test('the bar fills the width by category and /context-bar toggles it', async ($, on) => {
  on('command.register', () => ({ value: { command: 'context-bar' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { breakdown: BREAKDOWN }, rateLimits: [] },
  }))
  // Stands for the engine's own band, drawn when the bar steps aside.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  // Hidden, then shown again: showing recounts the window.
  expect((await $.command.run({ command: 'context-bar', args: '' })).text).toBe('Context bar hidden.')
  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Context/ })).toBeUndefined()
  await ui.unmount()

  expect((await $.command.run({ command: 'context-bar', args: '' })).text).toBe('Context bar shown.')
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  const header = await ui.find({ type: 'Text', text: /^Context / })
  expect(header?.text).toBe('Context 40.0k / 200.0k (20%)')

  // 40 cells: the deferred row is left out, every other row has a cell.
  const bar = await ui.find({ type: 'Text', text: /^[█░]+$/ })
  expect(bar?.text.length).toBe(40)
  expect(bar?.text.startsWith('█')).toBe(true)
  expect(bar?.text.includes('░')).toBe(true)

  const legend = await ui.find({ type: 'Text', text: /Messages/ })
  expect(legend?.text.includes('MCP tools')).toBe(false)
  await ui.unmount()
})
