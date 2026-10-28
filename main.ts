import {
  MarkdownPostProcessorContext,
  MarkdownRenderChild,
  Plugin,
  TFile,
  debounce,
  getAllTags,
  parseYaml,
} from "obsidian";

type ChartType = "bar" | "line" | "pie" | "doughnut";
type Aggregate = "sum" | "avg" | "count" | "min" | "max";

interface ChartConfig {
  type?: ChartType;
  title?: string;
  /** Folder path, "#tag", "." (folder of current note) or empty for the whole vault */
  source?: string;
  /** Numeric front matter field(s) to plot */
  field?: string | string[];
  /** Front matter field used for x labels (defaults to the note name) */
  label?: string;
  /** Group notes by this field and aggregate (great for pie charts) */
  group?: string;
  aggregate?: Aggregate;
  sort?: "none" | "label" | "label-desc" | "value" | "value-desc";
  limit?: number;
  height?: number;
}

interface Row {
  label: string;
  values: number[];
}

// Theme variables. The first one is the user's accent color.
const PALETTE = [
  "var(--interactive-accent)",
  "var(--color-green, #08b94e)",
  "var(--color-orange, #e9973f)",
  "var(--color-purple, #886dff)",
  "var(--color-red, #fb464c)",
  "var(--color-cyan, #00bfbc)",
  "var(--color-yellow, #e0ac00)",
  "var(--color-pink, #fa99cd)",
];
const color = (i: number) => PALETTE[i % PALETTE.length];
const SVG_NS = "http://www.w3.org/2000/svg";

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  parent?: Element,
  cls?: string
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (cls) node.setAttribute("class", cls);
  parent?.appendChild(node);
  return node;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", "."));
    return isFinite(n) ? n : null;
  }
  return null;
}

function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) max = min + 1;
  const step0 = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let t = Math.floor(min / step) * step; t <= Math.ceil(max / step) * step + step / 1e6; t += step) {
    ticks.push(Math.round(t / step) * step);
  }
  return ticks;
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

class FrontmatterChart extends MarkdownRenderChild {
  constructor(
    private plugin: FrontmatterChartsPlugin,
    containerEl: HTMLElement,
    private source: string,
    private sourcePath: string
  ) {
    super(containerEl);
  }

  onload() {
    const refresh = debounce(() => this.render(), 600, true);
    this.registerEvent(this.plugin.app.metadataCache.on("changed", refresh));
    this.registerEvent(this.plugin.app.vault.on("delete", refresh));
    this.registerEvent(this.plugin.app.vault.on("rename", refresh));
    this.render();
  }

  private render() {
    const root = this.containerEl;
    root.empty();
    root.addClass("fmchart");

    let cfg: ChartConfig;
    try {
      cfg = (parseYaml(this.source) ?? {}) as ChartConfig;
    } catch (e) {
      root.createDiv({ cls: "fmchart-error", text: "Invalid YAML: " + (e as Error).message });
      return;
    }

    const type: ChartType = (cfg.type ?? "bar") as ChartType;
    if (!["bar", "line", "pie", "doughnut"].includes(type)) {
      root.createDiv({ cls: "fmchart-error", text: `Unknown chart type "${type}".` });
      return;
    }

    const fields = cfg.field == null ? [] : Array.isArray(cfg.field) ? cfg.field : [cfg.field];
    if (!fields.length && !cfg.group) {
      root.createDiv({
        cls: "fmchart-error",
        text: 'Set at least "field" (numeric property) or "group" (category property).',
      });
      return;
    }

    const rows = this.collect(cfg, fields, type);
    if (!rows.length) {
      root.createDiv({ cls: "fmchart-empty", text: "No matching front matter data found." });
      return;
    }

    const seriesNames = cfg.group && !fields.length ? ["count"] : fields;
    if (type === "pie" || type === "doughnut") this.drawPie(root, cfg, rows, type === "doughnut");
    else this.drawAxes(root, cfg, rows, seriesNames, type);
  }

  // ---------- data ----------

  private files(source: string | undefined): TFile[] {
    const { vault, metadataCache } = this.plugin.app;
    const all = vault.getMarkdownFiles();
    let s = (source ?? "").trim().replace(/^["']|["']$/g, "");
    if (!s) return all;
    if (s.startsWith("#")) {
      const want = s.toLowerCase();
      return all.filter((f) => {
        const cache = metadataCache.getFileCache(f);
        const tags = cache ? getAllTags(cache) ?? [] : [];
        return tags.some((t) => t.toLowerCase() === want || t.toLowerCase().startsWith(want + "/"));
      });
    }
    if (s === ".") {
      const dir = this.sourcePath.includes("/") ? this.sourcePath.replace(/\/[^/]*$/, "") : "";
      return all.filter((f) => (f.parent?.path === "/" ? "" : f.parent?.path) === dir);
    }
    s = s.replace(/\/$/, "");
    return all.filter((f) => f.path.startsWith(s + "/"));
  }

  private collect(cfg: ChartConfig, fields: string[], type: ChartType): Row[] {
    const { metadataCache } = this.plugin.app;
    const files = this.files(cfg.source);
    let rows: Row[] = [];

    if (cfg.group) {
      const buckets = new Map<string, number[][]>();
      for (const f of files) {
        const fm = metadataCache.getFileCache(f)?.frontmatter;
        if (!fm || fm[cfg.group] == null) continue;
        const groups = Array.isArray(fm[cfg.group]) ? fm[cfg.group] : [fm[cfg.group]];
        const vals = fields.length ? fields.map((k) => toNumber(fm[k])) : [1];
        if (fields.length && vals.every((v) => v == null)) continue;
        for (const g of groups) {
          const key = String(g);
          if (!buckets.has(key)) buckets.set(key, fields.length ? fields.map(() => []) : [[]]);
          const b = buckets.get(key)!;
          vals.forEach((v, i) => v != null && b[i].push(v));
          if (!fields.length) b[0].push(1);
        }
      }
      const agg: Aggregate = cfg.aggregate ?? (fields.length ? "sum" : "count");
      rows = [...buckets.entries()].map(([label, cols]) => ({
        label,
        values: cols.map((c) => this.aggregate(c, agg)),
      }));
    } else {
      for (const f of files) {
        const fm = metadataCache.getFileCache(f)?.frontmatter;
        if (!fm) continue;
        const vals = fields.map((k) => toNumber(fm[k]));
        if (vals.every((v) => v == null)) continue;
        const label = cfg.label && fm[cfg.label] != null ? String(fm[cfg.label]) : f.basename;
        rows.push({ label, values: vals.map((v) => v ?? 0) });
      }
    }

    const sort = cfg.sort ?? (cfg.group ? "value-desc" : type === "line" ? "label" : "none");
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    if (sort === "label") rows.sort((a, b) => collator.compare(a.label, b.label));
    else if (sort === "label-desc") rows.sort((a, b) => collator.compare(b.label, a.label));
    else if (sort === "value") rows.sort((a, b) => a.values[0] - b.values[0]);
    else if (sort === "value-desc") rows.sort((a, b) => b.values[0] - a.values[0]);

    if (cfg.limit && cfg.limit > 0) rows = rows.slice(0, cfg.limit);
    return rows;
  }

  private aggregate(v: number[], agg: Aggregate): number {
    if (!v.length) return 0;
    switch (agg) {
      case "count": return v.length;
      case "avg": return v.reduce((a, b) => a + b, 0) / v.length;
      case "min": return Math.min(...v);
      case "max": return Math.max(...v);
      default: return v.reduce((a, b) => a + b, 0);
    }
  }

  // ---------- bar / line ----------

  private drawAxes(root: HTMLElement, cfg: ChartConfig, rows: Row[], names: string[], type: ChartType) {
    const W = 640;
    const H = cfg.height ?? 320;
    const rotate = rows.length > 6;
    const m = { l: 48, r: 16, t: cfg.title ? 36 : 16, b: rotate ? 74 : 40 };
    const iw = W - m.l - m.r;
    const ih = H - m.t - m.b;

    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" }, root);
    if (cfg.title) el("text", { x: W / 2, y: 20, "text-anchor": "middle" }, svg, "fmchart-title").textContent = cfg.title;

    const all = rows.flatMap((r) => r.values);
    let min = Math.min(...all);
    let max = Math.max(...all);
    if (type === "bar") { min = Math.min(0, min); max = Math.max(0, max); }
    const ticks = niceTicks(min, max);
    const lo = ticks[0], hi = ticks[ticks.length - 1];
    const y = (v: number) => m.t + ih - ((v - lo) / (hi - lo)) * ih;

    for (const t of ticks) {
      el("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) }, svg, "fmchart-grid");
      el("text", { x: m.l - 8, y: y(t) + 4, "text-anchor": "end" }, svg, "fmchart-axis-text").textContent = fmt(t);
    }
    el("line", { x1: m.l, x2: m.l, y1: m.t, y2: m.t + ih }, svg, "fmchart-axis");
    el("line", { x1: m.l, x2: W - m.r, y1: y(Math.max(lo, Math.min(0, hi))), y2: y(Math.max(lo, Math.min(0, hi))) }, svg, "fmchart-axis");

    const band = iw / rows.length;
    const cx = (i: number) => m.l + band * i + band / 2;
    const maxLabel = rotate ? 14 : Math.max(4, Math.floor(band / 6.5));

    rows.forEach((r, i) => {
      const lx = cx(i), ly = m.t + ih + 16;
      const t = el("text", { x: lx, y: ly, "text-anchor": rotate ? "end" : "middle" }, svg, "fmchart-axis-text");
      if (rotate) t.setAttribute("transform", `rotate(-40 ${lx} ${ly - 4})`);
      t.textContent = truncate(r.label, maxLabel);
    });

    if (type === "bar") {
      const groupW = band * 0.72;
      const barW = groupW / names.length;
      const base = y(Math.max(lo, Math.min(0, hi)));
      rows.forEach((r, i) => {
        r.values.forEach((v, s) => {
          const x = cx(i) - groupW / 2 + s * barW;
          const top = y(v);
          const rect = el("rect", {
            x: x + 1, width: Math.max(1, barW - 2),
            y: Math.min(top, base), height: Math.max(1, Math.abs(base - top)), rx: 3,
          }, svg, "fmchart-bar");
          rect.style.fill = color(s);
          el("title", {}, rect).textContent = `${r.label}${names.length > 1 ? " · " + names[s] : ""}: ${fmt(v)}`;
        });
      });
    } else {
      names.forEach((name, s) => {
        const pts = rows.map((r, i) => `${cx(i)},${y(r.values[s])}`).join(" ");
        const line = el("polyline", { points: pts, fill: "none", "stroke-width": 2.5, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
        line.style.stroke = color(s);
        rows.forEach((r, i) => {
          const dot = el("circle", { cx: cx(i), cy: y(r.values[s]), r: 4 }, svg, "fmchart-dot");
          dot.style.fill = color(s);
          dot.style.stroke = "var(--background-primary)";
          dot.setAttribute("stroke-width", "1.5");
          el("title", {}, dot).textContent = `${r.label}${names.length > 1 ? " · " + name : ""}: ${fmt(r.values[s])}`;
        });
      });
    }

    if (names.length > 1) this.legend(root, names, names.map((_, i) => color(i)));
  }

  // ---------- pie / doughnut ----------

  private drawPie(root: HTMLElement, cfg: ChartConfig, rows: Row[], donut: boolean) {
    const W = 360;
    const top = cfg.title ? 36 : 12;
    const H = cfg.height ?? 300;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" }, root);
    svg.style.maxWidth = "420px";
    svg.style.margin = "0 auto";
    if (cfg.title) el("text", { x: W / 2, y: 20, "text-anchor": "middle" }, svg, "fmchart-title").textContent = cfg.title;

    const data = rows.map((r) => ({ label: r.label, v: Math.max(0, r.values[0]) })).filter((d) => d.v > 0);
    const total = data.reduce((a, d) => a + d.v, 0);
    if (!total) { root.createDiv({ cls: "fmchart-empty", text: "All values are zero." }); return; }

    const cx = W / 2, cy = top + (H - top - 8) / 2;
    const R = Math.min(W / 2 - 12, (H - top - 8) / 2);
    const r0 = donut ? R * 0.58 : 0;
    let a = -Math.PI / 2;

    data.forEach((d, i) => {
      const frac = d.v / total;
      const tip = `${d.label}: ${fmt(d.v)} (${Math.round(frac * 1000) / 10}%)`;
      let node: SVGElement;
      if (frac >= 0.9999) {
        node = el("circle", { cx, cy, r: R }, svg, "fmchart-slice");
      } else {
        const b = a + frac * Math.PI * 2;
        const p = (rad: number, ang: number) => `${cx + rad * Math.cos(ang)} ${cy + rad * Math.sin(ang)}`;
        const large = frac > 0.5 ? 1 : 0;
        const dPath = donut
          ? `M ${p(R, a)} A ${R} ${R} 0 ${large} 1 ${p(R, b)} L ${p(r0, b)} A ${r0} ${r0} 0 ${large} 0 ${p(r0, a)} Z`
          : `M ${cx} ${cy} L ${p(R, a)} A ${R} ${R} 0 ${large} 1 ${p(R, b)} Z`;
        node = el("path", { d: dPath }, svg, "fmchart-slice");
        a = b;
      }
      node.style.fill = color(i);
      el("title", {}, node).textContent = tip;
    });

    if (donut) {
      const t = el("text", { x: cx, y: cy + 6, "text-anchor": "middle" }, svg, "fmchart-title");
      t.style.fontSize = "20px";
      t.textContent = fmt(total);
    }
    this.legend(root, data.map((d) => d.label), data.map((_, i) => color(i)));
  }

  private legend(root: HTMLElement, names: string[], colors: string[]) {
    const box = root.createDiv({ cls: "fmchart-legend" });
    names.forEach((n, i) => {
      const item = box.createDiv({ cls: "fmchart-legend-item" });
      item.createSpan({ cls: "fmchart-swatch" }).style.background = colors[i];
      item.createSpan({ text: n });
    });
  }
}

export default class FrontmatterChartsPlugin extends Plugin {
  async onload() {
    this.registerMarkdownCodeBlockProcessor(
      "fmchart",
      (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        ctx.addChild(new FrontmatterChart(this, el, source, ctx.sourcePath));
      }
    );

    this.addCommand({
      id: "insert-chart-block",
      name: "Insert chart block",
      editorCallback: (editor) => {
        editor.replaceSelection(
          "```fmchart\ntype: bar\ntitle: My chart\nsource: Folder\nfield: rating\n```\n"
        );
      },
    });
  }
}
