const assert = (ok, msg) => { if (!ok) { console.error("FAIL: " + msg); process.exitCode = 1; } };
// Logic test for the InDesign scripts without InDesign.
// Runs the export analysis and the import's paragraph replacement against a
// small mock of InDesign's text model. Run: node tests/logic-test.js [-v]
// It does not replace a real round trip in InDesign (see the developer guide).
const fs = require("fs");
const dir = require("path").join(__dirname, "../scripts/");
const exp = fs.readFileSync(dir + "Translation Export.jsx", "utf8");
const imp = fs.readFileSync(dir + "Translation Import.jsx", "utf8");

function body(src, from) {
  let s = src.slice(src.indexOf(from));
  s = s.slice(0, s.lastIndexOf("})();"));
  return s;
}
// ---------- mock InDesign text model ----------
const PROPS = ["appliedCharacterStyle", "appliedFont", "fontStyle", "pointSize", "fillColor", "underline"];
function mkStyle(o) { return Object.assign({ appliedCharacterStyle: { name: "[None]" }, appliedFont: { name: "Minion\tRegular" }, fontStyle: "Regular", pointSize: 10, fillColor: { name: "Black" }, underline: false }, o); }
class Story {
  constructor(parts) { this.chars = []; for (const [t, st] of parts) for (const c of t) this.chars.push({ c, st: { ...st } }); }
  get contents() { return this.chars.map(x => x.c).join(""); }
  rangeObj(a, b) { // inclusive b
    const story = this;
    const o = {
      get contents() { return story.chars.slice(a, b + 1).map(x => x.c).join(""); },
      set contents(v) { const st = story.chars[a].st; story.chars.splice(a, b - a + 1, ...[...v].map(c => ({ c, st: { ...st } }))); },
      set properties(p) { for (let i = a; i <= b; i++) Object.assign(story.chars[i].st, p); },
    };
    for (const k of PROPS) Object.defineProperty(o, k, {
      get() { return story.chars[a].st[k]; }, set(v) { for (let i = a; i <= b; i++) story.chars[i].st[k] = v; } });
    return o;
  }
  get characters() {
    const story = this;
    return new Proxy({}, { get(_, k) {
      if (k === "itemByRange") return (a, b) => ({ texts: [story.rangeObj(a, b)] });
      if (k === "everyItem") return () => ({ getElements: () => story.chars.map((_, i) => story.rangeObj(i, i)) });
      if (/^\d+$/.test(k)) return story.rangeObj(+k, +k);
    } });
  }
  get insertionPoints() {
    const story = this;
    return new Proxy({}, { get(_, k) { const i = +k; return { set contents(v) {
      const st = (story.chars[i - 1] || story.chars[i]).st;
      story.chars.splice(i, 0, ...[...v].map(c => ({ c, st: { ...st } }))); } }; } });
  }
  get textStyleRanges() {
    const story = this;
    return { everyItem: () => ({ getElements: () => {
      const out = []; let s = 0;
      for (let i = 1; i <= story.chars.length; i++)
        if (i === story.chars.length || JSON.stringify(story.chars[i].st) !== JSON.stringify(story.chars[s].st)) { out.push(story.rangeObj(s, i - 1)); s = i; }
      return out; } }) };
  }
}
// ---------- load functions ----------
const expFns = new Function("doc", "items", 'var VERSION="t",LABEL="SupertextID",RUN_DETECTION="fast";' +
  body(exp, "    // =========================================================== XLIFF") +
  "return {buildXliff,analyze,inlineXml};");
const impFns = new Function('var LABEL="SupertextID",RUN_DETECTION="fast";var CHAR_ATTRS=' +
  JSON.stringify(PROPS) + ";" + body(imp, "    // Plain text with object placeholders") +
  "return {applyContainer,analyze,plain,canon};");

const base = mkStyle({}), bold = mkStyle({ fontStyle: "Bold" }), red = mkStyle({ fillColor: { name: "Red" }, appliedCharacterStyle: { name: "Emph" } });
const story = new Story([
  ["Jetzt ", base], ["neu", bold], [" im\tSortiment\nab ", base], ["￼", base], [" März", base], ["\r", base],
  ["\r", base],
  ["Seite \u0018 von ", base], ["Total", red], ["\u0004", base],
]);
const E = expFns({ name: "Test.indd" }, null);
const a = E.analyze(story);
const items = [{ id: "stX", analysis: a, note: "n" }];
const xl = expFns({ name: "Test.indd" }, items).buildXliff("de-CH", "fr-CH").text;
if (process.argv.includes("-v")) console.log(xl);

// minimal XLIFF inline parser (stands in for E4X)
function parseInline(s) {
  const segs = []; const stack = [0]; const re = /<g id="(\d+)">|<\/g>|<x id="([^"]+)" ctype="([^"]+)"\/>|([^<]+)/g; let m;
  const un = t => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  while ((m = re.exec(s))) {
    const st = stack[stack.length - 1];
    if (m[1]) stack.push(+m[1]); else if (m[0] === "</g>") stack.pop();
    else if (m[3]) segs.push(m[3] === "lb" ? { text: "\n", style: st } : m[3] === "x-tab" ? { text: "\t", style: st } : { hard: m[2], text: "", style: st });
    else segs.push({ text: un(m[4]), style: st });
  }
  return segs;
}
const units = {}; const re = /<trans-unit id="stX_p(\d+)"[^>]*>\s*<source>(.*)<\/source>/g; let m;
while ((m = re.exec(xl))) units[m[1]] = { source: parseInline(m[2]) };
// translations: p0 moves the bold word and the object; p2 keeps placeholders
units[0].target = parseInline('Désormais <g id="1">nouveau</g> dans\tl’assortiment<x id="lb1" ctype="lb"/>dès <x id="o1" ctype="x-indesign-object"/> mars');
units[2].target = parseInline('Page <x id="o1" ctype="x-indesign-object"/> sur <g id="1">Total</g><x id="o2" ctype="x-indesign-object"/>');
const rep = { translated: 0, untranslated: 0, tags: [] };
impFns().applyContainer({ text: story }, units, rep);

const out = story.contents;

const want = "Désormais nouveau dans\tl’assortiment\ndès ￼ mars\r\rPage \u0018 sur Total\u0004";
assert(out === want, "TEXT MISMATCH");
const at = s => story.chars[out.indexOf(s)].st;
assert(at("nouveau").fontStyle === "Bold" && at("Désormais").fontStyle === "Regular", "bold wrong");
assert(at(" dans").fontStyle === "Regular", "bold leaked");
assert(at("Total").fillColor.name === "Red" && at("Total").appliedCharacterStyle.name === "Emph", "red wrong");
assert(at(" sur").fillColor.name === "Black", "red leaked");
// placeholder mismatch -> original kept
const s2 = new Story([["A ￼ B", base]]);
const a2 = E.analyze(s2);
const u2 = { 0: { source: [{ text: "A ", style: 0 }, { hard: "o1", text: "", style: 0 }, { text: " B", style: 0 }], target: [{ text: "X Y", style: 0 }] } };
const rep2 = { translated: 0, untranslated: 0, tags: [] };
impFns().applyContainer({ text: s2 }, u2, rep2);
assert(s2.contents === "A ￼ B" && rep2.tags.length === 1, "mismatch not kept");
// changed source -> skipped
const rep3 = { translated: 0, untranslated: 0, tags: [] };
assert(impFns().applyContainer({ text: new Story([["Other", base]]) }, units, rep3) === "changed", "changed not detected");
console.log(process.exitCode ? "FAILED" : "All checks passed");
