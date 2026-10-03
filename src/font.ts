import opentype from 'opentype.js'

export type FontFilter = {
  fileName: string
  family: string
  supportsGlyph: (char: string) => boolean
  dispose: () => void
}

export async function readFont(file: File): Promise<FontFilter> {
  const buffer = await file.arrayBuffer()
  const font = opentype.parse(buffer)
  const family = 'BorrowGlyphUploaded'
  const face = new FontFace(family, buffer.slice(0))
  await face.load()
  document.fonts.add(face)

  return {
    fileName: file.name,
    family,
    supportsGlyph(char: string) {
      try {
        return font.charToGlyphIndex(char) !== 0
      } catch {
        return false
      }
    },
    dispose() {
      document.fonts.delete(face)
    },
  }
}
