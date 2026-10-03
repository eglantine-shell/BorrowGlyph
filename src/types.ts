export type GlyphRecord = {
  ids: string
  operator: string
  components: string[]
}

export type CharacterVariant = 'shared' | 'simplified' | 'traditional'

export type DonorRecord = {
  char: string
  slot: string
  depth: number
  tier: number
  order: number
  variant?: CharacterVariant
}

export type GlyphData = {
  meta: {
    generatedAt: string
    idsSource: string
    commonSource: string
    glyphCount?: number
  }
  glyphs: Record<string, GlyphRecord>
  donors: Record<string, DonorRecord[]>
}

export type RankedDonor = DonorRecord & {
  component: string
  desiredSlot: string
  exactPosition: boolean
  sameAxis: boolean
  inFont: boolean | null
  score: number
}
