declare module 'opentype.js' {
  type ParsedFont = {
    charToGlyphIndex(char: string): number
  }

  const opentype: {
    parse(buffer: ArrayBuffer): ParsedFont
  }

  export default opentype
}
