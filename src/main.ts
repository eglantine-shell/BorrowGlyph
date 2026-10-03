import './style.css'
import rawData from './generated/data.json'
import { readFont, type FontFilter } from './font'
import {
  getCandidatesForSlot,
  positionName,
  structureLabel,
} from './search'
import type { GlyphData, RankedDonor } from './types'
import { VISUAL_DECOMPOSITIONS } from './visual-decompositions'

const data = rawData as GlyphData

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('Missing app root')

type IdsNode = {
  token: string
  children: IdsNode[]
}

type ComponentSearchNode = {
  key: string
  component: string
  desiredSlot: string
  candidates: RankedDonor[]
  children: ComponentSearchNode[]
  splitOperator?: string
  splitSource?: 'ids' | 'visual'
  depth: number
}

const IDC_ARITY: Record<string, number> = {
  '⿰': 2,
  '⿱': 2,
  '⿲': 3,
  '⿳': 3,
  '⿴': 2,
  '⿵': 2,
  '⿶': 2,
  '⿷': 2,
  '⿸': 2,
  '⿹': 2,
  '⿺': 2,
  '⿻': 2,
}

let currentChar = ''
let fontFilter: FontFilter | null = null
let variantPreference: 'all' | 'simplified' | 'traditional' = 'all'
let expanded = new Set<string>()
let selected = new Map<string, RankedDonor>()

app.innerHTML = `
  <div class="shell">
    <header class="masthead">
      <a class="brand" href="./" aria-label="BorrowGlyph 首页">
        <span class="brand-mark">借</span>
        <span>
          <strong>BorrowGlyph</strong>
          <small>借字</small>
        </span>
      </a>
      <a class="repo-link" href="https://github.com/eglantine-shell/BorrowGlyph" target="_blank" rel="noreferrer">GitHub ↗</a>
    </header>

    <section class="hero">
      <p class="eyebrow">字体缺字拼合辅助</p>
      <h1>缺哪个字，就去别的字里借。</h1>
      <p class="intro">输入一个汉字，按结构位置寻找更适合截取的常见字。字体文件可选；上传后只在浏览器本地读取，并优先显示该字体已经收录的候选字。</p>

      <div class="query-row">
        <label class="query-box">
          <span class="sr-only">输入一个汉字</span>
          <input id="char-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="例如：珣" />
          <button id="search-button" type="button">找字</button>
        </label>

        <label class="font-button" title="可选">
          <input id="font-input" type="file" accept=".ttf,.otf,.woff,.woff2" />
          <span id="font-label">＋ 载入字体 <em>可选</em></span>
        </label>

        <div class="variant-filter" role="group" aria-label="候选繁简范围">
          <button type="button" class="is-active" data-variant="all" aria-pressed="true">不限</button>
          <button type="button" data-variant="simplified" aria-pressed="false">简体</button>
          <button type="button" data-variant="traditional" aria-pressed="false">繁体</button>
        </div>
      </div>
      <p id="font-note" class="font-note">不载入字体也可以直接查询。</p>
    </section>

    <section id="result" class="result" aria-live="polite">
      <div class="empty-state">
        <span>珣</span>
        <p>试试「珣」或「髮」</p>
      </div>
    </section>

    <footer>
      <p>IDS 数据用于结构匹配；候选常用度以《通用规范汉字表》为基础排序。</p>
      <p class="data-meta"></p>
    </footer>
  </div>
`

const input = document.querySelector<HTMLInputElement>('#char-input')!
const searchButton = document.querySelector<HTMLButtonElement>('#search-button')!
const fontInput = document.querySelector<HTMLInputElement>('#font-input')!
const fontLabel = document.querySelector<HTMLSpanElement>('#font-label')!
const fontNote = document.querySelector<HTMLParagraphElement>('#font-note')!
const variantButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-variant]')]
const result = document.querySelector<HTMLElement>('#result')!
const meta = document.querySelector<HTMLParagraphElement>('.data-meta')!

meta.textContent = data.meta.glyphCount
  ? `当前结构数据覆盖 ${data.meta.glyphCount.toLocaleString()} 个可拆汉字。`
  : '当前为内置回退数据；重新构建项目后会生成完整字库。'

function firstCharacter(value: string) {
  return Array.from(value.trim())[0] ?? ''
}

function escapeHtml(value: string) {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return value.replace(/[&<>"']/g, (ch) => entities[ch] ?? ch)
}

function filterByVariant(candidates: RankedDonor[]) {
  if (variantPreference === 'all') return candidates

  return candidates.filter((candidate) => {
    const variant = candidate.variant ?? 'shared'
    return variant === 'shared' || variant === variantPreference
  })
}

function tokenizeIds(ids: string) {
  const tokens: string[] = []

  for (let i = 0; i < ids.length;) {
    if (ids[i] === '&') {
      const end = ids.indexOf(';', i)
      if (end !== -1) {
        tokens.push(ids.slice(i, end + 1))
        i = end + 1
        continue
      }
    }

    const codePoint = ids.codePointAt(i)
    if (codePoint === undefined) break

    const char = String.fromCodePoint(codePoint)
    i += char.length

    if (/\s/.test(char)) continue
    tokens.push(char)
  }

  return tokens
}

function parseIdsNode(tokens: string[], cursor = { value: 0 }): IdsNode | null {
  const token = tokens[cursor.value++]
  if (!token) return null

  const arity = IDC_ARITY[token]
  if (!arity) return { token, children: [] }

  const children: IdsNode[] = []
  for (let index = 0; index < arity; index += 1) {
    const child = parseIdsNode(tokens, cursor)
    if (!child) return null
    children.push(child)
  }

  return { token, children }
}

function serializeIdsNode(node: IdsNode): string {
  return node.children.length
    ? node.token + node.children.map(serializeIdsNode).join('')
    : node.token
}

function decompositionOf(component: string) {
  const visual = VISUAL_DECOMPOSITIONS[component]
  if (visual) {
    return {
      operator: visual.operator,
      source: 'visual' as const,
      components: visual.components,
    }
  }

  if (IDC_ARITY[Array.from(component)[0] ?? '']) {
    const tree = parseIdsNode(tokenizeIds(component))
    if (tree && IDC_ARITY[tree.token] && tree.children.length) {
      return {
        operator: tree.token,
        source: 'ids' as const,
        components: tree.children.map((child, index) => ({
          char: serializeIdsNode(child),
          desiredSlot: `${tree.token}:${index}`,
        })),
      }
    }
  }

  const glyph = data.glyphs[component]
  if (!glyph || !glyph.operator || !glyph.components.length) return null

  return {
    operator: glyph.operator,
    source: 'ids' as const,
    components: glyph.components.map((char, index) => ({
      char,
      desiredSlot: `${glyph.operator}:${index}`,
    })),
  }
}

function buildSearchNode(
  component: string,
  desiredSlot: string,
  key: string,
  depth = 0,
  ancestors = new Set<string>(),
): ComponentSearchNode {
  const visualOverride = VISUAL_DECOMPOSITIONS[component]
  const directCandidates = filterByVariant(
    getCandidatesForSlot(
      data,
      currentChar,
      component,
      desiredSlot,
      fontFilter?.supportsGlyph,
    ),
  )

  // 人工视觉拆分只在“正常整块 donor 不够好用”时兜底：
  // 必须至少有一个同结构位置、且不是生僻字的 donor，才保留直接截取方案。
  // 例如：
  // - 髮 的「犮」：茇虽同位但生僻，拔虽常用但异位 → 改走 友 + 丶
  // - 茇 的「犮」：髮是同位且常用的繁体字 → 直接取髮中的犮
  const hasGoodDirectCandidate = directCandidates.some(
    (candidate) =>
      candidate.exactPosition &&
      candidate.tier <= 2 &&
      candidate.inFont !== false,
  )

  const useVisualOverride = Boolean(
    visualOverride && !hasGoodDirectCandidate,
  )

  const node: ComponentSearchNode = {
    key,
    component,
    desiredSlot,
    candidates: useVisualOverride ? [] : directCandidates,
    children: [],
    depth,
  }

  if (node.candidates.length || depth >= 4 || ancestors.has(component)) {
    return node
  }

  const decomposition = decompositionOf(component)
  if (!decomposition) return node

  const nextAncestors = new Set(ancestors)
  nextAncestors.add(component)

  node.splitOperator = decomposition.operator
  node.splitSource = decomposition.source
  node.children = decomposition.components.map((child, index) =>
    buildSearchNode(
      child.char,
      child.desiredSlot,
      `${key}.${index}`,
      depth + 1,
      nextAncestors,
    ),
  )

  return node
}

function initializeSelections(nodes: ComponentSearchNode[]) {
  for (const node of nodes) {
    if (node.candidates[0]) {
      selected.set(node.key, node.candidates[0])
      continue
    }
    initializeSelections(node.children)
  }
}

function donorMarkup(candidate: RankedDonor, index: number, nodeKey: string) {
  const active = selected.get(nodeKey)?.char === candidate.char
  const fontBadge =
    fontFilter && candidate.inFont
      ? '<span class="font-hit">字体有字</span>'
      : fontFilter && candidate.inFont === false
        ? '<span class="font-miss">字体缺字</span>'
        : ''
  const positionBadge = candidate.exactPosition
    ? '<span>同位</span>'
    : candidate.sameAxis
      ? '<span>近似位置</span>'
      : '<span>异位</span>'

  return `
    <button
      class="donor ${active ? 'is-active' : ''}"
      type="button"
      data-node-key="${escapeHtml(nodeKey)}"
      data-candidate="${index}"
      aria-pressed="${active}"
    >
      <b>${escapeHtml(candidate.char)}</b>
      <small>${positionBadge}${fontBadge}</small>
    </button>
  `
}

function collectRecipeNodes(nodes: ComponentSearchNode[]): ComponentSearchNode[] {
  const result: ComponentSearchNode[] = []

  for (const node of nodes) {
    if (node.candidates.length) {
      result.push(node)
    } else if (node.children.length) {
      result.push(...collectRecipeNodes(node.children))
    } else {
      result.push(node)
    }
  }

  return result
}

function recommendationMarkup(nodes: ComponentSearchNode[]) {
  const parts = collectRecipeNodes(nodes).map((node) => {
    const choice = selected.get(node.key)
    if (!choice) {
      return `
        <span class="recipe-part recipe-unresolved">
          <b>?</b>
          <small>缺「${escapeHtml(node.component)}」</small>
        </span>
      `
    }

    return `
      <span class="recipe-part">
        <b>${escapeHtml(choice.char)}</b>
        <small>取「${escapeHtml(node.component)}」</small>
      </span>
    `
  })

  return `
    <aside class="recommendation">
      <div>
        <p class="section-kicker">当前拼合方案</p>
        <div class="recipe">${parts.join('<i>＋</i>')}</div>
      </div>
      <p class="recipe-tip">找不到整块 donor 时会自动继续拆分。实际拼接仍需根据字体字形调整裁切、缩放和位置。</p>
    </aside>
  `
}

function renderSearchNode(node: ComponentSearchNode, label: string): string {
  const shown = expanded.has(node.key)
    ? node.candidates
    : node.candidates.slice(0, 6)

  const glyphClass = IDC_ARITY[Array.from(node.component)[0] ?? '']
    ? 'component-glyph is-ids'
    : 'component-glyph'

  if (node.candidates.length) {
    return `
      <section class="component-card ${node.depth ? 'is-nested' : ''}">
        <header>
          <div class="${glyphClass}">${escapeHtml(node.component)}</div>
          <div>
            <p class="section-kicker">${escapeHtml(label)}</p>
            <h3>${escapeHtml(positionName(node.desiredSlot, node.component))}</h3>
          </div>
        </header>

        <div class="donors">
          ${shown.map((candidate, index) => donorMarkup(candidate, index, node.key)).join('')}
        </div>

        ${node.candidates.length > 6
          ? `<button class="more-button" type="button" data-expand="${escapeHtml(node.key)}">${expanded.has(node.key) ? '收起' : `更多候选 · ${node.candidates.length}`}</button>`
          : ''}
      </section>
    `
  }

  if (node.children.length) {
    const splitNames = node.children.map((child) => child.component).join(' ＋ ')
    const splitNote = node.splitSource === 'visual'
      ? `人工视觉拆分：<strong>${escapeHtml(node.component)} → ${escapeHtml(splitNames)}</strong>。`
      : `找不到可直接借用的「${escapeHtml(node.component)}」，继续拆为 <strong>${escapeHtml(splitNames)}</strong>。`

    return `
      <section class="component-card recursive-card ${node.depth ? 'is-nested' : ''}">
        <header>
          <div class="${glyphClass}">${escapeHtml(node.component)}</div>
          <div>
            <p class="section-kicker">${escapeHtml(label)}</p>
            <h3>${escapeHtml(positionName(node.desiredSlot, node.component))}</h3>
          </div>
        </header>

        <p class="split-note">${splitNote}</p>

        <div class="nested-components">
          ${node.children
            .map((child, index) =>
              renderSearchNode(child, `继续拆分 · 部件 ${index + 1}`),
            )
            .join('')}
        </div>
      </section>
    `
  }

  return `
    <section class="component-card unresolved-card ${node.depth ? 'is-nested' : ''}">
      <header>
        <div class="${glyphClass}">${escapeHtml(node.component)}</div>
        <div>
          <p class="section-kicker">${escapeHtml(label)}</p>
          <h3>${escapeHtml(positionName(node.desiredSlot, node.component))}</h3>
        </div>
      </header>
      <p class="no-donors">已经拆到当前数据可识别的最深层，仍未找到可用候选。</p>
    </section>
  `
}

function render(char: string) {
  currentChar = char
  expanded = new Set()
  selected = new Map()

  if (!char) {
    result.innerHTML = '<div class="message">请输入一个汉字。</div>'
    return
  }

  const glyph = data.glyphs[char]
  if (!glyph) {
    result.innerHTML = `
      <div class="message">
        <strong>暂时没有「${escapeHtml(char)}」的结构数据。</strong>
        <p>可能是 IDS 数据未收录、构形无法自动解析，或当前仍在使用回退数据。</p>
      </div>
    `
    return
  }

  const nodes = glyph.components.map((component, index) =>
    buildSearchNode(
      component,
      `${glyph.operator}:${index}`,
      String(index),
    ),
  )

  initializeSelections(nodes)
  renderResult(glyph, nodes)
}

function renderResult(
  glyph: GlyphData['glyphs'][string],
  nodes: ComponentSearchNode[],
) {
  result.innerHTML = `
    <div class="target-card">
      <div class="target-glyph">${escapeHtml(currentChar)}</div>
      <div class="target-info">
        <p class="section-kicker">结构</p>
        <h2>${escapeHtml(structureLabel(glyph.operator))}</h2>
        <div class="ids-line">
          <code>${escapeHtml(glyph.ids)}</code>
          <span>${glyph.components.map(escapeHtml).join(' · ')}</span>
        </div>
      </div>
    </div>

    ${recommendationMarkup(nodes)}

    <div class="components">
      ${nodes
        .map((node, index) => renderSearchNode(node, `部件 ${index + 1}`))
        .join('')}
    </div>
  `

  const nodeByKey = new Map<string, ComponentSearchNode>()

  const indexNodes = (items: ComponentSearchNode[]) => {
    for (const item of items) {
      nodeByKey.set(item.key, item)
      indexNodes(item.children)
    }
  }
  indexNodes(nodes)

  result.querySelectorAll<HTMLButtonElement>('.donor').forEach((button) => {
    button.addEventListener('click', () => {
      const nodeKey = button.dataset.nodeKey
      const candidateIndex = Number(button.dataset.candidate)
      if (!nodeKey) return

      const node = nodeByKey.get(nodeKey)
      if (!node) return

      const visibleSet = expanded.has(nodeKey)
        ? node.candidates
        : node.candidates.slice(0, 6)
      const picked = visibleSet[candidateIndex]
      if (!picked) return

      selected.set(nodeKey, picked)
      renderResult(glyph, nodes)
    })
  })

  result.querySelectorAll<HTMLButtonElement>('[data-expand]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.expand
      if (!key) return

      if (expanded.has(key)) expanded.delete(key)
      else expanded.add(key)

      renderResult(glyph, nodes)
    })
  })
}

function submit() {
  const char = firstCharacter(input.value)
  input.value = char
  render(char)
}

searchButton.addEventListener('click', submit)
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.isComposing) submit()
})

variantButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const next = button.dataset.variant
    if (next !== 'all' && next !== 'simplified' && next !== 'traditional') return

    variantPreference = next
    variantButtons.forEach((item) => {
      const active = item.dataset.variant === variantPreference
      item.classList.toggle('is-active', active)
      item.setAttribute('aria-pressed', String(active))
    })

    if (currentChar) render(currentChar)
  })
})

fontInput.addEventListener('change', async () => {
  const file = fontInput.files?.[0]
  if (!file) return

  fontLabel.textContent = '读取字体中…'
  try {
    fontFilter = await readFont(file)
    fontLabel.innerHTML = `${escapeHtml(fontFilter.fileName)} <em>已载入</em>`
    fontNote.textContent = '字体仅在当前浏览器内解析，不会上传。候选中将优先显示该字体实际收录的字。'
    if (currentChar) render(currentChar)
  } catch (error) {
    console.error(error)
    fontFilter = null
    fontLabel.innerHTML = '＋ 载入字体 <em>可选</em>'
    fontNote.textContent = '这个字体文件暂时无法解析；不影响普通查询。'
  }
})
