const SYSTEM_GLYPH_FONT_STACK = [
  '"Songti SC"',
  '"STSong"',
  '"Noto Serif CJK SC"',
  '"Noto Serif SC"',
  '"Source Han Serif SC"',
  '"Source Han Serif CN"',
  '"PingFang SC"',
  '"PingFang TC"',
  '"PingFang HK"',
  '"Noto Sans CJK SC"',
  '"Source Han Sans SC"',
  '"Hiragino Sans GB"',
  '"Hiragino Kaku Gothic ProN"',
  '"Microsoft YaHei"',
  '"SimSun-ExtB"',
  '"MingLiU-ExtB"',
  '"BabelStone Han"',
  '"HanaMinA"',
  '"HanaMinB"',
  'serif',
].join(', ')

type GlyphSignature = {
  hash: number
  ink: number
}

const cache = new Map<string, boolean>()
let missingSignatures: GlyphSignature[] | null = null

function signature(char: string): GlyphSignature {
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 96

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return { hash: 0, ink: 0 }

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#000'
  context.font = `64px ${SYSTEM_GLYPH_FONT_STACK}`
  context.textBaseline = 'alphabetic'
  context.fillText(char, 8, 72)

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  let hash = 2166136261
  let ink = 0

  for (let index = 3; index < pixels.length; index += 4) {
    const alpha = pixels[index]
    if (alpha) ink += 1
    hash ^= alpha
    hash = Math.imul(hash, 16777619)
  }

  return { hash: hash >>> 0, ink }
}

function isSameSignature(a: GlyphSignature, b: GlyphSignature) {
  return a.hash === b.hash && a.ink === b.ink
}

function getMissingSignatures() {
  if (missingSignatures) return missingSignatures

  missingSignatures = [
    '\uFFFF',
    '\uFFFE',
    '\u{10FFFF}',
  ].map(signature)

  return missingSignatures
}

export function canSystemRenderGlyph(char: string) {
  const cached = cache.get(char)
  if (cached !== undefined) return cached

  const rendered = signature(char)
  const visible =
    rendered.ink > 0 &&
    !getMissingSignatures().some((missing) =>
      isSameSignature(rendered, missing),
    )

  cache.set(char, visible)
  return visible
}

export { SYSTEM_GLYPH_FONT_STACK }
