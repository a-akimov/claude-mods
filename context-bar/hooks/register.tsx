import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Segment, Snapshot } from '../types'

// Change the tag when Snapshot's fields change: it declines what an earlier
// version stored, which outlives a reload.
const snapshot = atom({ plugin: 'context-bar', key: 'snapshot' } as const, null, {
  shape: 'snapshot-1',
})
const isShown = atom({ plugin: 'context-bar', key: 'isShown' } as const, true)

/** Recounts the window by category, as /context does, with the free local estimate. */
async function refresh($: EngineInterface) {
  const usage = await $.session.usage({ breakdown: 'summary' })
  const breakdown = usage.context.breakdown
  if (!breakdown) return

  const segments: Segment[] = []
  for (const row of breakdown.categories) {
    // Deferred tool schemas sit outside the window, as in /context's grid.
    if (row.kind === 'deferred' || row.tokens <= 0) continue
    segments.push({ name: row.name, tokens: row.tokens, color: row.color, kind: row.kind })
  }

  const next: Snapshot = {
    segments,
    totalTokens: breakdown.totalTokens,
    maxTokens: breakdown.rawMaxTokens,
    percentage: breakdown.percentage,
  }
  await update($, snapshot, () => next)
}

/** Refreshes in the background when the bar is shown; never throws into a hook. */
function refreshLater($: EngineInterface) {
  void read($, isShown)
    .then(shown => (shown ? refresh($) : undefined))
    .catch(() => {})
}

/** Splits `width` cells among the segments by tokens, at least one cell each. */
function cellsFor(segments: Segment[], width: number): number[] {
  const total = segments.reduce((sum, s) => sum + s.tokens, 0)
  if (total === 0) return segments.map(() => 0)

  const exact = segments.map(s => (s.tokens / total) * width)
  const cells = exact.map(Math.floor)
  let left = width - cells.reduce((a, b) => a + b, 0)
  const byRemainder = exact
    .map((x, i) => ({ i, rest: x - Math.floor(x) }))
    .sort((a, b) => b.rest - a.rest)
  for (const { i } of byRemainder) {
    if (left <= 0) break
    cells[i] = (cells[i] ?? 0) + 1
    left -= 1
  }

  // A small category still gets one cell, taken from the widest.
  if (segments.length <= width) {
    for (let i = 0; i < cells.length; i++) {
      if ((cells[i] ?? 0) > 0) continue
      const widest = cells.indexOf(Math.max(...cells))
      cells[widest] = (cells[widest] ?? 1) - 1
      cells[i] = 1
    }
  }
  return cells
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'context-bar',
      description: 'Show or hide the context window bar above the prompt',
    })
    const result = await next(e)
    refreshLater($)

    return result
  })

  on('command.run', { command: 'context-bar' }, async $ => {
    const shown = !(await read($, isShown))
    await update($, isShown, () => shown)
    if (shown) await refresh($).catch(() => {})

    return { text: shown ? 'Context bar shown.' : 'Context bar hidden.' }
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    refreshLater($)

    return result
  })

  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    refreshLater($)

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isShown))) return next(e)
    const snap = await read($, snapshot)
    if (!snap || snap.segments.length === 0) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const width = Math.max(10, (e.viewport?.columns ?? 80) - 2)
    const cells = cellsFor(snap.segments, width)
    const total = snap.segments.reduce((sum, s) => sum + s.tokens, 0)

    return (
      <Box flexDirection="column">
        <Text dimColor>
          Context {formatTokens(snap.totalTokens)} / {formatTokens(snap.maxTokens)} (
          {Math.round(snap.percentage)}%)
        </Text>
        <Text>
          {snap.segments.map((s, i) => (
            <Text key={s.name} color={s.color}>
              {(s.kind === 'used' ? '█' : '░').repeat(cells[i] ?? 0)}
            </Text>
          ))}
        </Text>
        <Text wrap="wrap">
          {snap.segments.map(s => (
            <Text key={`legend-${s.name}`}>
              <Text color={s.color}>{s.kind === 'used' ? '■' : '□'}</Text>
              <Text dimColor>
                {' '}
                {s.name} {Math.round((s.tokens / total) * 100)}%{'  '}
              </Text>
            </Text>
          ))}
        </Text>
      </Box>
    )
  })
}
