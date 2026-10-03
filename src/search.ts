import type { DonorRecord, GlyphData, RankedDonor } from './types'

const operatorAxis: Record<string, string> = {
  '⿰': 'horizontal',
  '⿲': 'horizontal',
  '⿱': 'vertical',
  '⿳': 'vertical',
  '⿴': 'enclosure',
  '⿵': 'enclosure',
  '⿶': 'enclosure',
  '⿷': 'enclosure',
  '⿸': 'enclosure',
  '⿹': 'enclosure',
  '⿺': 'enclosure',
  '⿻': 'overlay',
}

export function desiredSlot(operator: string, index: number) {
  return `${operator}:${index}`
}

function axisOf(slot: string) {
  return operatorAxis[slot.split(':')[0]] ?? 'other'
}

function scoreDonor(
  donor: DonorRecord,
  desired: string,
  inFont: boolean | null,
) {
  const exactPosition = donor.slot === desired && donor.depth === 1
  const sameAxis = axisOf(donor.slot) === axisOf(desired)
  const fontPenalty = inFont === false ? 5000 : 0
  const tierPenalty = Math.max(0, donor.tier - 1) * 90
  const orderPenalty = Math.min(donor.order, 99999) / 10000

  if (donor.isSelf) {
    // 本字免去“从别的字里截取”的步骤，但仍可能需要为目标位置压缩或拉伸。
    // 因此同位 donor 优先于本字；本字再优先于近似位置／异位 donor。
    return {
      score: fontPenalty + 300 + tierPenalty + orderPenalty,
      exactPosition: false,
      sameAxis: false,
    }
  }

  const positionPenalty = exactPosition ? 0 : sameAxis ? 800 : 1800
  const depthPenalty = Math.max(0, donor.depth - 1) * 220

  return {
    score:
      fontPenalty +
      positionPenalty +
      depthPenalty +
      tierPenalty +
      orderPenalty,
    exactPosition,
    sameAxis,
  }
}

export function getCandidatesForSlot(
  data: GlyphData,
  target: string,
  component: string,
  wanted: string,
  supportsGlyph?: (char: string) => boolean,
  limit = 24,
): RankedDonor[] {
  const donors = data.donors[component] ?? []

  return donors
    .filter((item) => item.char !== target)
    .map((item) => {
      const inFont = supportsGlyph ? supportsGlyph(item.char) : null
      const ranked = scoreDonor(item, wanted, inFont)
      return {
        ...item,
        component,
        desiredSlot: wanted,
        inFont,
        ...ranked,
      }
    })
    .sort((a, b) => a.score - b.score || a.char.localeCompare(b.char, 'zh-Hans-CN'))
    .slice(0, limit)
}

export function getCandidates(
  data: GlyphData,
  target: string,
  component: string,
  componentIndex: number,
  supportsGlyph?: (char: string) => boolean,
  limit = 24,
): RankedDonor[] {
  const glyph = data.glyphs[target]
  if (!glyph) return []

  return getCandidatesForSlot(
    data,
    target,
    component,
    desiredSlot(glyph.operator, componentIndex),
    supportsGlyph,
    limit,
  )
}

export function positionName(slot: string, component: string) {
  const [operator, rawIndex] = slot.split(':')
  const index = Number(rawIndex)

  const names: Record<string, string[]> = {
    '⿰': ['左部', '右部'],
    '⿲': ['左部', '中部', '右部'],
    '⿱': ['上部', '下部'],
    '⿳': ['上部', '中部', '下部'],
    '⿴': ['外框', '内部'],
    '⿵': ['上包围', '内部'],
    '⿶': ['下包围', '内部'],
    '⿷': ['左包围', '内部'],
    '⿸': ['左上包围', '内部'],
    '⿹': ['右上包围', '内部'],
    '⿺': ['左下包围', '内部'],
    '⿻': ['叠加部件', '叠加部件'],
  }

  return `${names[operator]?.[index] ?? '对应部件'}「${component}」`
}

export function structureLabel(operator: string) {
  const labels: Record<string, string> = {
    '⿰': '左右结构',
    '⿲': '左中右结构',
    '⿱': '上下结构',
    '⿳': '上中下结构',
    '⿴': '全包围结构',
    '⿵': '上包围结构',
    '⿶': '下包围结构',
    '⿷': '左包围结构',
    '⿸': '左上包围结构',
    '⿹': '右上包围结构',
    '⿺': '左下包围结构',
    '⿻': '叠加结构',
  }
  return labels[operator] ?? '复合结构'
}
