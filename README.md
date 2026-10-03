# BorrowGlyph（借字）

BorrowGlyph 是一个面向设计场景的轻量汉字拼合辅助工具。

当字体缺少某个汉字时，输入目标字，BorrowGlyph 会根据汉字结构拆分其组成部件，并从其他汉字中寻找适合截取、拼合的候选字。排序优先考虑：

1. **结构位置**：同一部件位于相同位置时优先，例如都处于左右结构的左侧。
2. **常用程度**：优先使用更常见、字体更可能收录的汉字。
3. **部件深度**：优先使用可以直接截取的一级部件，而不是藏在更深层结构中的部件。
4. **当前字体是否收录（可选）**：载入 TTF / OTF 字体后，字体中实际存在的候选字优先。

例如「珣」拆为「⿰王旬」，可以从含「王」的常见字和右部为「旬」的字中分别寻找 donor；「髮」拆为「⿱髟犮」，也可以继续寻找提供「髟」和「犮」的字。

## 功能

- 输入单个汉字，显示 IDS 结构和主要部件。
- 为每个部件列出 donor 字，并区分「同位 / 近似位置 / 异位」。
- 自动组合一组当前推荐方案，也可以手动点击候选字更换。
- 可选载入字体文件；字体只在浏览器本地解析，不上传服务器。
- 纯前端静态网页，可直接部署到 GitHub Pages。

## 本地运行

需要 Node.js 18+。

```bash
npm install
npm run dev
```

首次运行会从公开数据源生成 `src/generated/data.json`。仓库中保留了一份很小的回退数据，因此即使刷新数据失败，项目仍能构建；完整使用建议联网执行一次：

```bash
npm run data
```

生产构建：

```bash
npm run build
```

## 数据来源

结构数据使用 [hfhchan/ids](https://github.com/hfhchan/ids) 的 IDS release（MIT License）。

常用度基础使用 [jaywcjlove/table-of-general-standard-chinese-characters](https://github.com/jaywcjlove/table-of-general-standard-chinese-characters) 整理的《通用规范汉字表》数据（MIT License）。一级、二级、三级字依次获得更高排序；繁体字会尽可能继承对应规范简体字的常用等级。

## 当前边界

BorrowGlyph 现在解决的是「**哪个字更适合借来切部件**」，而不是自动完成最终字形设计。IDS 描述的是结构关系，不能保证两个字在某一款字体里的局部轮廓完全一致；实际拼合仍可能需要缩放、位移、节点修整。

对于某些复杂字，如果一级部件本身没有合适 donor，目前会显示无候选。后续可以加入「继续拆这个部件」的递归搜索。

## 部署

仓库包含 GitHub Pages Actions workflow。启用仓库的 Pages（Source 选择 **GitHub Actions**）后，推送到 `main` 会自动构建并部署。
