export type VisualDecomposition = {
  operator: string
  components: Array<{
    char: string
    desiredSlot: string
  }>
}

/**
 * 设计拼字特例。
 *
 * 这里不是文字学意义上的 IDS 分解，而是“为了实际截取、拼合更方便”的
 * 人工视觉拆分。只有确实有设计价值的案例才放进来。
 */
export const VISUAL_DECOMPOSITIONS: Record<string, VisualDecomposition> = {
  '犮': {
    operator: '⿻',
    components: [
      // 「友」优先从上下结构的下部借，例如「爱」。
      { char: '友', desiredSlot: '⿱:1' },
      // 点作为附加笔画，优先找叠加型位置。
      { char: '丶', desiredSlot: '⿻:1' },
    ],
  },
}
