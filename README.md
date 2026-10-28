<div align="center">

# Frontmatter Charts

**Turn note properties into charts, right inside [Obsidian](https://obsidian.md).**
Bar, line, pie and doughnut charts that read your front matter and use your theme's own colors.

[![Release](https://img.shields.io/github/v/release/OWNER/frontmatter-charts?style=flat-square&color=7c5cff)](https://github.com/OWNER/frontmatter-charts/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/OWNER/frontmatter-charts/total?style=flat-square&color=08b94e)](https://github.com/OWNER/frontmatter-charts/releases)
[![License: MIT](https://img.shields.io/github/license/OWNER/frontmatter-charts?style=flat-square)](LICENSE)
![Obsidian 1.4.0+](https://img.shields.io/badge/Obsidian-1.4.0%2B-7c5cff?style=flat-square&logo=obsidian&logoColor=white)
![Platforms](https://img.shields.io/badge/platforms-desktop%20%7C%20mobile-lightgrey?style=flat-square)
![Dependencies](https://img.shields.io/badge/runtime%20dependencies-0-success?style=flat-square)

<img src="docs/preview.svg" alt="Bar, line and doughnut charts rendered by Frontmatter Charts" width="860">

[Install](#installation) · [Quick start](#quick-start) · [Options](#configuration-reference) · [Examples](#cookbook) · [Troubleshooting](#troubleshooting) · [Contributing](#contributing)

</div>

---

## Highlights

- **Four chart types**: bar, line, pie, doughnut
- **Theme-native**: colors come from your accent color and theme variables, so charts follow light/dark mode and theme switches instantly
- **Zero runtime dependencies**: plain inline SVG, no Chart.js, no canvas
- **Live**: charts re-render when a note's properties change
- **Flexible sources**: by folder, tag, the current note's folder, or the whole vault
- **Grouping and aggregation**: count, sum, avg, min, max per category
- **Multi-series** bar and line charts
- **Read-only**: never modifies your notes
- **Desktop and mobile**, Reading view and Live Preview

## Installation

> [!NOTE]
> Frontmatter Charts is not yet in the Obsidian community plugin browser. Install it manually or with BRAT.

### Option A: BRAT (recommended for updates)

1. Install the **[BRAT](https://github.com/TfTHacker/obsidian42-brat)** plugin.
2. Run the command **BRAT: Add a beta plugin for testing**.
3. Paste `OWNER/frontmatter-charts` and confirm.
4. Enable **Frontmatter Charts** under Settings, Community plugins.

### Option B: Manual

1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/OWNER/frontmatter-charts/releases/latest).
2. Create `<your-vault>/.obsidian/plugins/frontmatter-charts/` and put the three files in it.
3. In Obsidian, open Settings, Community plugins, reload, and enable **Frontmatter Charts**.

<details>
<summary>Mobile installation</summary>

Place the same folder in the vault's `.obsidian/plugins/` directory using your sync solution (Obsidian Sync, iCloud, Syncthing, and so on), then enable the plugin on the device. The plugin is not desktop-only.

</details>

<details>
<summary>Build from source</summary>

```bash
git clone https://github.com/OWNER/frontmatter-charts.git
cd frontmatter-charts
npm install
npm run build
```

Copy the generated `main.js`, plus `manifest.json` and `styles.css`, into your vault's plugin folder. See [Development](#development).

</details>

## Quick start

Say you keep one note per book in a `Books` folder:

```yaml
---
title: Dune
genre: Sci-Fi
rating: 4.5
pages: 612
---
```

Add a code block with the language `fmchart` to any note:

````markdown
```fmchart
type: bar
title: Book ratings
source: Books
field: rating
```
````

You get one bar per book. Count books per genre instead:

````markdown
```fmchart
type: doughnut
title: Books per genre
source: Books
group: genre
```
````

> [!TIP]
> Run **Insert chart block** from the command palette (`Ctrl/Cmd+P`) to drop in a ready-made template.

## How it works

1. The plugin registers a code block processor for `fmchart` and parses the block as YAML.
2. It selects notes using `source`, then reads their front matter from Obsidian's **metadata cache** (no files are read from disk, so it stays fast in large vaults).
3. It builds rows of `label + numeric values`, one per note or one per group, then sorts and limits them.
4. It draws an SVG styled only with CSS variables.
5. Each chart listens for metadata, delete and rename events and re-renders itself (debounced by about 600 ms). Listeners are cleaned up when the block leaves the screen.

## Configuration reference

Put options inside the code block as YAML `key: value` lines.

| Option | Values | Default | Description |
|---|---|---|---|
| `type` | `bar` `line` `pie` `doughnut` | `bar` | Chart type |
| `title` | text | none | Title shown above the chart |
| `source` | folder, `"#tag"`, `.` | whole vault | Which notes to include ([details](#choosing-notes-source)) |
| `field` | property or list | none | Numeric property (or properties) to plot. Required unless `group` is set |
| `label` | property | note name | Property used for x labels and slice names |
| `group` | property | none | Group notes by this property and aggregate |
| `aggregate` | `sum` `avg` `count` `min` `max` | `sum` with `field`, else `count` | How to combine values inside a group |
| `sort` | `none` `label` `label-desc` `value` `value-desc` | see [Sorting](#sorting-and-limiting) | Row order |
| `limit` | integer | none | Keep the first N rows after sorting |
| `height` | pixels | `320` bar/line, `300` pie/doughnut | Chart height (width fills the container) |

> [!IMPORTANT]
> - Provide `field`, `group`, or both, otherwise you get a configuration error.
> - **Quote tag sources**: write `source: "#book"`. An unquoted `#` starts a YAML comment.
> - Option values are case-sensitive (`type: bar`, not `Bar`). Unknown keys are ignored silently.

### Choosing notes (`source`)

| Value | Matches |
|---|---|
| `Books` or `Projects/2026` | Every note under that folder, **including subfolders**. Paths are relative to the vault root. |
| `"#book"` | Notes with that tag in front matter or in the body. Case-insensitive. Also matches nested tags (`#project` includes `#project/active`). |
| `.` | Notes in the **same folder** as the chart note (no subfolders). The chart note itself is included if it has matching properties. |
| *(omitted)* | Every Markdown note in the vault. Narrow it in big vaults. |

### Reading values from front matter

<details>
<summary><strong>What counts as a number</strong></summary>

| Front matter | Read as |
|---|---|
| `rating: 4.5` or `rating: 4` | 4.5 / 4 |
| `rating: "4.5"` | 4.5 (numeric strings are parsed) |
| `rating: 4,5` | 4.5 (comma accepted as decimal separator) |
| `weight: 72kg` | 72 (leading number is used, unit dropped, no conversion) |
| empty, `null`, `abc` | missing |
| `true` / `false` | missing (booleans are not numeric) |
| `[1, 2]` | missing (lists are not numeric) |

</details>

<details>
<summary><strong>Which notes are included</strong></summary>

**Without `group`**

- Notes with no front matter are skipped.
- A note is included if at least one requested `field` is numeric.
- With several fields, a missing value in one field is plotted as `0` for that note.

**With `group`**

- Notes missing the `group` property are skipped.
- If `field` is set, notes where none of the fields are numeric are skipped.
- If `field` is omitted, every note with a `group` value is counted.

</details>

<details>
<summary><strong>Labels and dates</strong></summary>

- Labels default to the note name. Set `label: title` (or any property) to use front matter instead, with the note name as a per-note fallback.
- Dates are plain text labels on an evenly spaced axis. Use ISO dates (`YYYY-MM-DD`) and the default line sorting orders them chronologically. Spacing does **not** scale with elapsed time.

</details>

## Chart types

| Type | Behavior |
|---|---|
| **Bar** | One group of bars per row. Several `field`s render side by side with a legend. The y-axis always includes zero, and negative values extend below the baseline. |
| **Line** | One polyline per `field`, with a dot per point. The y-range fits the data (does not force zero). Defaults to `sort: label`. |
| **Pie** | One slice per row sized by the **first** value (extra fields ignored). Zero and negative values are dropped. Tooltip shows value and percentage. |
| **Doughnut** | Same as pie, with the **total** shown in the center. |

Axis details: ticks are rounded to nice values (1, 2, 5, 10 multiples). With more than 6 rows, x labels rotate about 40 degrees and truncate to 14 characters. Hover any element for the full label and exact value.

## Grouping and aggregation

`group: genre` turns "one entry per note" into "one entry per category".

| `field` | `aggregate` | Plotted per group |
|---|---|---|
| none | none | Number of notes |
| `rating` | none | **Sum** of `rating` |
| `rating` | `avg` | Average rating |
| `rating` | `count` | Notes with a numeric `rating` |
| `pages` | `max` / `min` | Largest / smallest `pages` |

> [!NOTE]
> If the group property is a list (for example `tags: [sci-fi, classic]`), the note is counted **once in every listed group**, so totals can exceed the number of notes.

With several fields (`field: [pages, rating]`), each is aggregated separately into a multi-series chart. All series share one y-axis, so very different scales will flatten the smaller one. Use separate charts in that case.

## Sorting and limiting

| `sort` | Order |
|---|---|
| `none` | Discovery order |
| `label` / `label-desc` | A to Z / Z to A (natural order: `Item 2` before `Item 10`) |
| `value` / `value-desc` | By the **first** series, ascending / descending |

**Defaults:** charts with `group` use `value-desc`; line charts without `group` use `label`; everything else uses `none`.

`limit` is applied after sorting, so `sort: value-desc` with `limit: 10` gives a top-10 chart.

## Theming

Charts use CSS variables only, so no settings are needed.

<details>
<summary><strong>Series color order</strong></summary>

Colors are assigned in order and cycle after the eighth. Missing theme variables fall back to sensible defaults.

| # | Variable |
|---|---|
| 1 | `--interactive-accent` (your accent color) |
| 2 | `--color-green` |
| 3 | `--color-orange` |
| 4 | `--color-purple` |
| 5 | `--color-red` |
| 6 | `--color-cyan` |
| 7 | `--color-yellow` |
| 8 | `--color-pink` |

A single-series chart uses color 1 throughout. Axis text and legend use `--text-muted`, titles use `--text-normal`, gridlines use `--background-modifier-border`, and axis lines use `--text-faint`.

</details>

<details>
<summary><strong>Customize with a CSS snippet</strong></summary>

All elements carry `fmchart-` classes: `.fmchart`, `.fmchart-title`, `.fmchart-axis-text`, `.fmchart-grid`, `.fmchart-axis`, `.fmchart-bar`, `.fmchart-dot`, `.fmchart-slice`, `.fmchart-legend`, `.fmchart-legend-item`, `.fmchart-swatch`, `.fmchart-error`, `.fmchart-empty`.

```css
.fmchart-grid { stroke-dasharray: 3 4; opacity: 0.6; }
.fmchart-axis-text { font-size: 12px; }
```

Data fills are inline styles, so snippets cannot easily recolor individual series. To change the palette, edit `PALETTE` at the top of `main.ts` and rebuild.

</details>

## Cookbook

Each example lists the front matter it expects and the block to use.

<details open>
<summary><strong>Average rating per genre</strong></summary>

````markdown
```fmchart
type: bar
title: Average rating by genre
source: Books
group: genre
field: rating
aggregate: avg
```
````

</details>

<details>
<summary><strong>Weight over time</strong> (<code>date</code> and <code>weight</code> in daily notes)</summary>

````markdown
```fmchart
type: line
title: Weight
source: Journal
label: date
field: weight
```
````

</details>

<details>
<summary><strong>Sleep vs mood</strong> (multi-series line)</summary>

````markdown
```fmchart
type: line
title: Sleep vs mood
source: Journal
label: date
field: [sleep, mood]
```
````

</details>

<details>
<summary><strong>Pages read per month</strong></summary>

Notes carry `month: 2026-03` and `pages: 320`.

````markdown
```fmchart
type: bar
title: Pages read per month
source: Books
group: month
field: pages
aggregate: sum
sort: label
```
````

</details>

<details>
<summary><strong>Top 5 longest books</strong></summary>

````markdown
```fmchart
type: bar
title: Longest books
source: Books
field: pages
sort: value-desc
limit: 5
```
````

</details>

<details>
<summary><strong>Projects by status from a tag</strong></summary>

````markdown
```fmchart
type: pie
title: Projects by status
source: "#project"
group: status
```
````

</details>

<details>
<summary><strong>Hours per project, labeled by a property</strong></summary>

````markdown
```fmchart
type: bar
title: Time spent
source: "#project"
label: title
field: hours
sort: value-desc
```
````

</details>

<details>
<summary><strong>Chart next to its data</strong> (<code>source: .</code>)</summary>

Put this in a note inside the same folder as the data notes:

````markdown
```fmchart
type: bar
title: Scores in this folder
source: .
field: score
```
````

</details>

<details>
<summary><strong>Notes per topic</strong> (list property)</summary>

A note with `topics: [ml, vision]` is counted under both.

````markdown
```fmchart
type: bar
title: Notes per topic
source: Papers
group: topics
```
````

</details>

<details>
<summary><strong>A small dashboard</strong></summary>

Several blocks can live in one note, with Markdown in between.

````markdown
## Reading dashboard

```fmchart
type: doughnut
title: By genre
source: Books
group: genre
height: 260
```

```fmchart
type: bar
title: Average rating by genre
source: Books
group: genre
field: rating
aggregate: avg
height: 260
```
````

</details>

## Commands

| Command | Description |
|---|---|
| **Insert chart block** | Inserts a starter `fmchart` block at the cursor, or replaces the current selection. |

## Troubleshooting

Problems appear in place of the chart.

| Message | Fix |
|---|---|
| `Invalid YAML: ...` | Check indentation, colons and quoting. Quote tag sources: `source: "#book"`. |
| `Unknown chart type "xyz".` | Use exactly `bar`, `line`, `pie` or `doughnut`. |
| `Set at least "field" ... or "group" ...` | Add `field: yourProperty` or `group: yourProperty`. |
| `No matching front matter data found.` | See the checklist below. |
| `All values are zero.` | A pie or doughnut had only zero or negative values. |

<details>
<summary><strong>"No matching front matter data found" checklist</strong></summary>

1. **Is the property in the YAML block** at the very top of the note, between `---` lines? Inline fields such as `rating:: 4` (Dataview style) are not read.
2. **Spelling and case.** `Rating` and `rating` are different properties.
3. **Is the value numeric?** See [what counts as a number](#reading-values-from-front-matter).
4. **Does `source` match?** Folder paths have no leading slash, tag sources must be quoted and start with `#`, and `source: .` only covers the chart note's own folder.
5. **Is Obsidian still indexing?** In very large vaults the chart updates itself once the cache catches up.
6. **Is the note's YAML valid?** A syntax error makes Obsidian ignore that note's properties.

</details>

<details>
<summary><strong>The chart looks wrong</strong></summary>

- **Tiny or flat bars:** a series with much larger values shares the axis. Split into separate charts.
- **Cut-off labels:** labels are truncated to stay tidy. Hover for the full text, shorten the `label` property, or use `limit`.
- **Group totals exceed the note count:** the group property is a list.
- **Colors do not follow the theme:** the theme may not define `--color-*` variables, so fallbacks are used.
- **No update after editing a note:** updates are debounced (about 0.6 s) and rely on the metadata cache. Wait a moment, or scroll the chart out of and back into view.

</details>

If you are still stuck, open the developer console (`Ctrl/Cmd+Shift+I`) and look for errors mentioning `frontmatter-charts`, then [open an issue](https://github.com/OWNER/frontmatter-charts/issues/new) with your `fmchart` block, an example note's front matter, your Obsidian version and platform, and your theme name.

## FAQ

<details>
<summary>Does it support Dataview or inline fields?</summary>

No. It reads only YAML front matter (Obsidian Properties) from the metadata cache.

</details>

<details>
<summary>Does it modify my notes?</summary>

Never. It is strictly read-only.

</details>

<details>
<summary>Will it slow down a large vault?</summary>

It reads cached metadata only, and only for notes selected by `source`. Narrowing `source` is the best optimization.

</details>

<details>
<summary>Can I chart text values such as "done" vs "todo"?</summary>

Yes, with `group`: `group: status` counts notes per status. Text cannot be plotted directly on an axis.

</details>

<details>
<summary>Can I click a bar to open the note, or export an image?</summary>

Not in this version. You can screenshot a chart, or copy its SVG from the developer tools.

</details>

<details>
<summary>Does it work on Obsidian Publish or in PDF export?</summary>

Published sites do not run community plugins, so charts will not render there. PDF export from within Obsidian captures the chart as displayed.

</details>

## Limitations and roadmap

Current constraints:

- Only four chart types, with a categorical x-axis and a single shared y-axis
- Data comes only from YAML front matter (no inline fields, note body or Dataview queries)
- No click-through to notes, no per-series color option, no settings tab
- Values with units are read by their leading number, with no conversion

Ideas for later (contributions welcome):

- [ ] Stacked bars and area charts
- [ ] Click a bar, point or slice to open the related note(s)
- [ ] Per-chart color overrides
- [ ] Time-scaled x-axis for date properties
- [ ] Secondary y-axis
- [ ] Optional minimum, maximum and axis-title options

## Development

**Requirements:** Node.js 18+ and npm.

```bash
npm install        # install dev dependencies
npm run dev        # watch mode, inline source maps
npm run build      # type-check, then minified production bundle
```

**Test in a vault** by symlinking the project into a test vault, then reload Obsidian after changes (the community *Hot Reload* plugin can automate this):

```bash
ln -s "$(pwd)" "/path/to/TestVault/.obsidian/plugins/frontmatter-charts"
```

<details>
<summary><strong>Project structure</strong></summary>

```text
frontmatter-charts/
├── main.ts               Data collection and SVG rendering
├── manifest.json         Plugin metadata
├── styles.css            Theme-variable-only styling
├── esbuild.config.mjs    Bundler configuration
├── tsconfig.json         TypeScript configuration
├── package.json          Scripts and dev dependencies
├── docs/preview.svg      README preview image
└── .github/workflows/    Release automation
```

| Piece in `main.ts` | Responsibility |
|---|---|
| `FrontmatterChartsPlugin` | Registers the `fmchart` processor and the insert command |
| `FrontmatterChart` | Owns one block: parse, collect, draw, re-render on vault events |
| `files()` | Resolves `source` to a list of notes |
| `collect()` / `aggregate()` | Turn front matter into sorted, limited rows |
| `drawAxes()` / `drawPie()` / `legend()` | Rendering |
| `niceTicks()`, `toNumber()`, `fmt()` | Axis scaling, number parsing, number display |

</details>

<details>
<summary><strong>Adding a chart type or changing the palette</strong></summary>

- **Palette:** edit the `PALETTE` array near the top of `main.ts`. Prefer CSS variables such as `var(--color-blue)` over hex codes so charts keep following the theme.
- **New chart type:** extend the `ChartType` union and the validation list in `render()`, add a `draw...` method, dispatch to it at the end of `render()`, and add classes to `styles.css` using theme variables only.

</details>

### Releasing

1. Bump `version` in `manifest.json` and `package.json`.
2. Commit, then tag with the exact version number (no `v` prefix) and push the tag:

   ```bash
   git tag 1.0.1
   git push origin 1.0.1
   ```

3. The [release workflow](.github/workflows/release.yml) builds the plugin and attaches `main.js`, `manifest.json` and `styles.css` to a new GitHub release.

## Contributing

Issues and pull requests are welcome.

1. Fork the repository and create a feature branch.
2. Make your change and run `npm run build` (it must pass the type-check).
3. Test it in a vault with both a light and a dark theme.
4. Open a pull request describing the change and, for visual changes, include a screenshot.

When reporting a bug, include the `fmchart` block, a sample note's front matter, your Obsidian version, platform and theme.

## Compatibility

| | |
|---|---|
| Obsidian | 1.4.0 or newer |
| Platforms | Windows, macOS, Linux, iOS, Android |
| Views | Reading view and Live Preview |

## License

[MIT](LICENSE)
