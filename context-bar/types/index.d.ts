/** One /context category, reduced to what the bar draws. */
export type Segment = {
  name: string
  tokens: number
  color: string
  kind: 'used' | 'free' | 'buffer'
}

export type Snapshot = {
  segments: Segment[]
  totalTokens: number
  maxTokens: number
  percentage: number
}

declare module 'claude-code' {
  interface PluginState {
    'context-bar': { snapshot: Shaped<Snapshot | null>; isShown: boolean }
  }
}
