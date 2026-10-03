import './style.css'
import rawData from './generated/data.json'
import { readFont, type FontFilter } from './font'
import { getCandidates, positionName, structureLabel } from './search'
import type { GlyphData, RankedDonor } from './types'

const data = rawData as GlyphData

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('Missing app root')

let currentChar = ''
let fontFilter: FontFilter | null = null
let expanded = new Set<number>()
let selected = new Map<number, RankedDonor>()

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
          <input id="char-input" maxlength="2" autocomplete="off" placeholder="例如：珣" />
          <button id="search-button" type="button">找字</button>
        </label>

        <label class="font-button" title="可选">
          <input id="font-input" type="file" accept=".ttf,.otf,.woff,.woff2" />
          <span id="font-label">＋ 载入字体 <em>可选</em></span>
        </label>
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
const result = document.querySelector<HTMLElement>('#result')!
const meta = document.querySelector<HTMLParagraphElement>('.data-meta')!

meta.textContent = data.meta.glyphCount
  ? `当前结构数据覆盖 ${data.meta.glyphCount.toLocaleString()} 个可拆汉字。`
  : '当前为内置回退数据；重新构建项目后会生成完整字库。'

function firstCharacter(value: string) {
  return Array.from(value.trim())[0] ?? ''
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[ch]!)
}

function donorMarkup(candidate: RankedDonor, index: number, componentIndex: number) {
  const active = selected.get(componentIndex)?.char === candidate.char
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
      data-component="${componentIndex}"
      data-candidate="${index}"
      aria-pressed="${active}"
    >
      <b>${escapeHtml(candidate.char)}</b>
      <small>${positionBadge}${fontBadge}</small>
    </button>
  `
}

function recommendationMarkup(glyph: NonNullable<GlyphData['glyphs'][string]>) {
  const parts = glyph.components.map((component, index) => {
    const choice = selected.get(index)
    if (!choice) return `<span class="missing-choice">?</span>`
    return `
      <span class="recipe-part">
        <b>${escapeHtml(choice.char)}</b>
        <small>${escapeHtml(positionName(choice.slot, component))}</small>
      </span>
    `
  })

  return `
    <aside class="recommendation">
      <div>
        <p class="section-kicker">当前拼合方案</p>
        <div class="recipe">${parts.join('<i>＋</i>')}</div>
      </div>
      <p class="recipe-tip">候选字只负责提供部件；实际拼接时仍需根据字体字形调整裁切、缩放和位置。</p>
    </aside>
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

  const candidateSets = glyph.components.map((component, index) =>
    getCandidates(
      data,
      char,
      component,
      index,
      fontFilter?.supportsGlyph,
    ),
  )

  candidateSets.forEach((set, index) => {
    if (set[0]) selected.set(index, set[0])
  })

  renderResult(glyph, candidateSets)
}

function renderResult(
  glyph: GlyphData['glyphs'][string],
  candidateSets: RankedDonor[][],
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

    ${recommendationMarkup(glyph)}

    <div class="components">
      ${glyph.components.map((component, componentIndex) => {
        const candidates = candidateSets[componentIndex]
        const shown = expanded.has(componentIndex) ? candidates : candidates.slice(0, 6)

        return `
          <section class="component-card">
            <header>
              <div class="component-glyph">${escapeHtml(component)}</div>
              <div>
                <p class="section-kicker">部件 ${componentIndex + 1}</p>
                <h3>${escapeHtml(positionName(`${glyph.operator}:${componentIndex}`, component))}</h3>
              </div>
            </header>

            ${candidates.length
              ? `
                <div class="donors">
                  ${shown.map((candidate, index) => donorMarkup(candidate, index, componentIndex)).join('')}
                </div>
                ${candidates.length > 6
                  ? `<button class="more-button" type="button" data-expand="${componentIndex}">${expanded.has(componentIndex) ? '收起' : `更多候选 · ${candidates.length}`}</button>`
                  : ''}
              `
              : '<p class="no-donors">没有找到可用候选。可以尝试继续拆这个部件，后续版本会补这一层。</p>'}
          </section>
        `
      }).join('')}
    </div>
  `

  result.querySelectorAll<HTMLButtonElement>('.donor').forEach((button) => {
    button.addEventListener('click', () => {
      const componentIndex = Number(button.dataset.component)
      const candidateIndex = Number(button.dataset.candidate)
      const fullSet = candidateSets[componentIndex]
      const visibleSet = expanded.has(componentIndex) ? fullSet : fullSet.slice(0, 6)
      const picked = visibleSet[candidateIndex]
      if (!picked) return
      selected.set(componentIndex, picked)
      renderResult(glyph, candidateSets)
    })
  })

  result.querySelectorAll<HTMLButtonElement>('[data-expand]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.expand)
      if (expanded.has(index)) expanded.delete(index)
      else expanded.add(index)
      renderResult(glyph, candidateSets)
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
  if (event.key === 'Enter') submit()
})
input.addEventListener('input', () => {
  const char = firstCharacter(input.value)
  if (Array.from(input.value).length > 1) input.value = char
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
