import opentype from 'opentype.js'

export type FontFilter = {
  fileName: string
  supportsGlyph: (char: string) => boolean
}

export async function readFont(file: File): Promise<FontFilter> {
  const buffer = await file.arrayBuffer()
  const font = opentype.parse(buffer)

  return {
    fileName: file.name,
    supportsGlyph(char: string) {
      try {
        return font.charToGlyphIndex(char) !== 0
      } catch {
        return false
      }
    },
  }
}
