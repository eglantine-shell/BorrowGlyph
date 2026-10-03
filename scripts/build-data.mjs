import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const OUT = resolve('src/generated/data.json')
const IDS_URL = 'https://raw.githubusercontent.com/hfhchan/ids/main/release/ids-20240112.txt'
const STANDARD_URL = 'https://raw.githubusercontent.com/jaywcjlove/table-of-general-standard-chinese-characters/main/data/characters.min.json'
const TRAD_URL = 'https://raw.githubusercontent.com/jaywcjlove/table-of-general-standard-chinese-characters/main/data/traditional.convert.json'

const IDC_ARITY = {
  '⿰': 2, '⿱': 2, '⿲': 3, '⿳': 3,
  '⿴': 2, '⿵': 2, '⿶': 2, '⿷': 2,
  '⿸': 2, '⿹': 2, '⿺': 2, '⿻': 2,
}

const IDC = new Set(Object.keys(IDC_ARITY))

const IDS_OVERRIDES = {
  '珣': '⿰王旬',
  '珍': '⿰王㐱',
  '询': '⿰讠旬',
  '髮': '⿱髟犮',
  '髡': '⿱髟兀',
  '拔': '⿰扌犮',
  '茇': '⿱艹犮',
}

async function fetchText(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} while fetching ${url}`)
  return response.text()
}

function tokenize(ids) {
  const tokens = []
  for (let i = 0; i < ids.length;) {
    if (ids[i] === '&') {
      const end = ids.indexOf(';', i)
      if (end !== -1) {
        tokens.push(ids.slice(i, end + 1))
        i = end + 1
        continue
      }
    }

    if (ids[i] === '{') {
      const end = ids.indexOf('}', i)
      if (end !== -1) {
        tokens.push(ids.slice(i, end + 1))
        i = end + 1
        continue
      }
    }

    const cp = ids.codePointAt(i)
    const char = String.fromCodePoint(cp)
    i += char.length

    if (/\s/.test(char)) continue
    const code = char.codePointAt(0)
    if ((code >= 0xfe00 && code <= 0xfe0f) || (code >= 0xe0100 && code <= 0xe01ef)) continue
    tokens.push(char)
  }
  return tokens
}

function parseNode(tokens, cursor = { value: 0 }) {
  const token = tokens[cursor.value++]
  if (!token) return null

  const arity = IDC_ARITY[token]
  if (!arity) return { token, children: [] }

  const children = []
  for (let i = 0; i < arity; i++) {
    const child = parseNode(tokens, cursor)
    if (!child) return null
    children.push(child)
  }
  return { token, children }
}

function serialize(node) {
  if (!node.children.length) return node.token
  return node.token + node.children.map(serialize).join('')
}

function cleanIds(value) {
  return value
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)$/g, '')
    .trim()
    .split(/\s+/)[0]
}

function charFromLine(parts) {
  for (const part of parts) {
    const trimmed = part.trim()
    if (/^U\+[0-9A-Fa-f]+$/.test(trimmed)) {
      return String.fromCodePoint(Number.parseInt(trimmed.slice(2), 16))
    }
  }

  for (const part of parts) {
    const trimmed = part.trim()
    if ([...trimmed].length === 1 && !IDC.has(trimmed)) return trimmed
  }

  return ''
}

function parseIdsFile(text) {
  const glyphs = {}

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) continue

    const parts = rawLine.split('\t').map((part) => part.trim()).filter(Boolean)
    const char = charFromLine(parts)
    if (!char || glyphs[char]) continue

    const idsField = parts.find((part) => [...part].some((ch) => IDC.has(ch)))
    if (!idsField) continue

    const ids = cleanIds(idsField)
    const tree = parseNode(tokenize(ids))
    if (!tree || !IDC.has(tree.token) || tree.children.length < 2) continue

    const components = tree.children.map(serialize)
    if (components.some((part) => !part)) continue

    glyphs[char] = {
      ids: serialize(tree),
      operator: tree.token,
      components,
      tree,
    }
  }

  return glyphs
}

function commonRanking(standard, traditionalMap) {
  const ranking = new Map()

  standard.forEach((char, index) => {
    const tier = index < 3500 ? 1 : index < 6500 ? 2 : 3
    ranking.set(char, { tier, order: index })
  })

  for (const [traditional, simplified] of Object.entries(traditionalMap)) {
    const base = ranking.get(simplified)
    if (base && !ranking.has(traditional)) {
      ranking.set(traditional, { tier: base.tier, order: base.order + 0.25 })
    }
  }

  return ranking
}

function collectOccurrences(node, wanted, rootOperator, path = [], output = []) {
  node.children.forEach((child, index) => {
    const nextPath = [...path, `${node.token}:${index}`]
    if (serialize(child) === wanted) {
      output.push({
        slot: nextPath[0] ?? `${rootOperator}:${index}`,
        depth: nextPath.length,
      })
    }
    collectOccurrences(child, wanted, rootOperator, nextPath, output)
  })
  return output
}

function buildVariantClassifier(traditionalMap) {
  const traditionalForms = new Set()
  const simplifiedForms = new Set()

  for (const [traditional, simplified] of Object.entries(traditionalMap)) {
    if (traditional === simplified) continue
    traditionalForms.add(traditional)
    simplifiedForms.add(simplified)
  }

  return (char) => {
    const isTraditional = traditionalForms.has(char)
    const isSimplified = simplifiedForms.has(char)

    if (isTraditional && !isSimplified) return 'traditional'
    if (isSimplified && !isTraditional) return 'simplified'
    return 'shared'
  }
}

function buildDonors(parsed, ranking, variantOf) {
  const componentSet = new Set()
  for (const glyph of Object.values(parsed)) {
    glyph.components.forEach((component) => componentSet.add(component))
  }

  const donors = Object.fromEntries([...componentSet].map((component) => [component, []]))

  function indexTree(node, char, common, path = []) {
    node.children.forEach((child, index) => {
      const nextPath = [...path, `${node.token}:${index}`]
      const component = serialize(child)

      if (componentSet.has(component)) {
        donors[component].push({
          char,
          slot: nextPath[0],
          depth: nextPath.length,
          tier: common.tier,
          order: common.order,
          variant: variantOf(char),
        })
      }

      indexTree(child, char, common, nextPath)
    })
  }

  for (const [char, glyph] of Object.entries(parsed)) {
    const common = ranking.get(char) ?? {
      tier: 4,
      order: 100000 + (char.codePointAt(0) ?? 0),
    }
    indexTree(glyph.tree, char, common)
  }

  for (const [component, list] of Object.entries(donors)) {
    const bestByChar = new Map()
    for (const item of list) {
      const previous = bestByChar.get(item.char)
      if (!previous || item.depth < previous.depth) bestByChar.set(item.char, item)
    }

    const ranked = [...bestByChar.values()].sort((a, b) =>
      a.tier - b.tier ||
      a.order - b.order ||
      a.depth - b.depth ||
      a.char.localeCompare(b.char, 'zh-Hans-CN')
    )

    const selfCommon = ranking.get(component) ?? {
      tier: 4,
      order: 100000 + (component.codePointAt(0) ?? 0),
    }
    const selfDonor =
      [...component].length === 1 && !IDC.has(component)
        ? {
            char: component,
            slot: 'self',
            depth: 0,
            tier: selfCommon.tier,
            order: selfCommon.order,
            variant: variantOf(component),
            isSelf: true,
          }
        : null

    donors[component] = selfDonor
      ? [selfDonor, ...ranked.filter((item) => item.char !== component)].slice(0, 48)
      : ranked.slice(0, 48)
  }

  return donors
}

async function main() {
  await mkdir(dirname(OUT), { recursive: true })

  try {
    const [idsText, standardText, traditionalText] = await Promise.all([
      fetchText(IDS_URL),
      fetchText(STANDARD_URL),
      fetchText(TRAD_URL),
    ])

    const parsed = parseIdsFile(idsText)

    for (const [char, ids] of Object.entries(IDS_OVERRIDES)) {
      const tree = parseNode(tokenize(ids))
      if (!tree) continue
      parsed[char] = {
        ids: serialize(tree),
        operator: tree.token,
        components: tree.children.map(serialize),
        tree,
      }
    }

    const standard = JSON.parse(standardText)
    const traditionalMap = JSON.parse(traditionalText)
    const ranking = commonRanking(standard, traditionalMap)
    const variantOf = buildVariantClassifier(traditionalMap)
    const donors = buildDonors(parsed, ranking, variantOf)

    const glyphs = Object.fromEntries(
      Object.entries(parsed).map(([char, glyph]) => [
        char,
        {
          ids: glyph.ids,
          operator: glyph.operator,
          components: glyph.components,
        },
      ]),
    )

    const payload = {
      meta: {
        generatedAt: new Date().toISOString(),
        idsSource: 'hfhchan/ids release ids-20240112 (MIT)',
        commonSource: 'jaywcjlove/table-of-general-standard-chinese-characters (MIT)',
        glyphCount: Object.keys(glyphs).length,
      },
      glyphs,
      donors,
    }

    await writeFile(OUT, JSON.stringify(payload))
    console.log(`BorrowGlyph data: ${Object.keys(glyphs).length} glyphs, ${Object.keys(donors).length} component indexes.`)
  } catch (error) {
    try {
      await readFile(OUT, 'utf8')
      console.warn('Could not refresh remote data; using the checked-in fallback data.')
      console.warn(error)
    } catch {
      throw error
    }
  }
}

main()
