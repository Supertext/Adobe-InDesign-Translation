# Developer guide

How the scripts work, what the XLIFF looks like, and how to test and release changes.

- [Overview](#overview)
- [ExtendScript constraints](#extendscript-constraints)
- [Story IDs](#story-ids)
- [Text model: containers, paragraphs, style runs and objects](#text-model-containers-paragraphs-style-runs-and-objects)
- [XLIFF format](#xliff-format)
- [Import algorithm](#import-algorithm)
- [Shared code](#shared-code)
- [Development setup](#development-setup)
- [Test checklist](#test-checklist)
- [Releasing](#releasing)
- [Known limitations and roadmap](#known-limitations-and-roadmap)

## Overview

| File | Role |
|---|---|
| `scripts/Translation Export.jsx` | Labels stories, analyses text, writes XLIFF 1.2 |
| `scripts/Translation Import.jsx` | Parses XLIFF, matches containers by ID, replaces text, restores character formatting |
| `tests/logic-test.js` | Runs the core logic in Node.js against a mock of InDesign's text model |

Each script is a single self-contained file wrapped in an IIFE, so it can be dropped into the Scripts Panel folder without dependencies. The price is duplicated code between export and import (see [Shared code](#shared-code)).

This project mirrors [Adobe Illustrator Translation](https://github.com/Supertext/Adobe-Illustrator-Translation). The XLIFF structure, ID conventions and import report are deliberately the same, so a CAT tool setup or downstream tooling works for both.

## ExtendScript constraints

InDesign scripts run in **ExtendScript**, Adobe's JavaScript dialect:

- **ES3 only.** No `let`/`const`, arrow functions, template literals, `Array.prototype.forEach/map/indexOf`, `JSON` (not built in), or `String.prototype.trim`. Stick to `var`, `for` loops and string concatenation.
- **E4X is available** and is used for XML parsing (`new XML(string)`). Namespaces are handled via `localName()`.
- **ScriptUI** provides the dialogs.
- **File I/O** via `File`/`Folder`. Always set `file.encoding = "UTF-8"`.
- **Keep the source ASCII.** Write non-ASCII characters in strings and regexes as `\uXXXX` escapes. A literal U+2028 in a regex literal is a line terminator and breaks the script.
- **Performance:** every DOM access crosses into InDesign. Use `collection.everyItem().getElements()` to fetch collections in one call. The import runs inside `app.doScript(…, UndoModes.ENTIRE_SCRIPT)`, which makes it one undo step and much faster, and disables screen redraw.

## Story IDs

Each exported story gets a **script label** (`story.insertLabel("SupertextID", id)`). Script labels are saved in the `.indd`, invisible in the UI and survive moving, rethreading and restyling. Labels sit on the story, not on frames, so threaded frames share one ID.

```
id = "st" + Date.now().toString(36) + random(1e8).toString(36)   // e.g. stmg5k1x2a9vq3
```

Table cells and footnotes have no labels of their own. Their IDs are derived from the story ID and their position:

| Container | ID |
|---|---|
| Story | `st…` |
| Table cell | `st…_t<table index>_c<cell index>` (indices within the story, 0-based) |
| Footnote | `st…_fn<footnote index>` |

Because cell and footnote IDs are positional, adding a table or footnote before an existing one after export shifts the indices. The source-text check on import catches this: the shifted cells don't match and are reported as changed rather than overwritten with the wrong text.

`ensureId()` rules:

- An existing label is reused, so re-exporting keeps the same IDs and TM matches stay stable.
- If two stories carry the same label (a frame was duplicated), the first keeps it and the later one gets a new ID on export. On import, duplicates are counted and only the first story is used.

**Removing IDs** (for example before handing a file to a client): run once, for example from the ExtendScript Debugger:

```javascript
var s = app.activeDocument.stories.everyItem().getElements();
for (var i = 0; i < s.length; i++) s[i].insertLabel("SupertextID", "");
```

## Text model: containers, paragraphs, style runs and objects

`textContainers(story)` returns the story itself, then each table cell (`cell.texts[0]`), then each footnote (`footnote.texts[0]`). Each is an InDesign text object with `contents`, `characters`, `textStyleRanges` and `insertionPoints`, and is processed the same way.

`analyze(textObject)` turns a container into:

```
{ text, paras: [ { start, text, runs: [ { start, len, key } ] } ] }
```

- **Paragraphs:** `contents` is split on `\r`. `start` is the character offset in the container.
- **Style runs:** consecutive characters with the same `styleKey()` form a run. The key combines character style, font, font style, size, fill and stroke colour, tint, underline, strikethrough, position (super/subscript), capitalization, baseline shift, tracking, horizontal scale and skew.
- **Characters in `contents`:** forced line breaks are `\n`, tabs are `\t`. Objects and markers appear as single control or private characters, for example `￼` anchored object, `\u0016` table, `\u0004` footnote reference, `\u0018` auto page number, `\u0019` section marker, `﻿` index, hyperlink and XML markers, `\u0007` indent-to-here, `\u0003` end nested style. `isHard()` defines this set.

### Run detection modes

`RUN_DETECTION` at the top of both scripts:

| Mode | How | Speed |
|---|---|---|
| `"fast"` (default) | Iterates `textStyleRanges`, which InDesign splits at every attribute change. Falls back to `exact` if the summed lengths don't match the text length. | Fast |
| `"exact"` | Computes `styleKey()` for every character. | Slow on long stories |

`textStyleRanges` can split more finely than `styleKey()` distinguishes (for example on an OpenType feature change); `pushRun()` merges adjacent ranges with equal keys, so the result is the same. The run indices that `<g id>` refers to must be computed identically on export and import, so always switch **both** scripts.

## XLIFF format

XLIFF 1.2, one `<file>` per document and target language, one `<group>` per container, one `<trans-unit>` per paragraph with translatable text.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file original="Brochure.indd" source-language="de-CH" target-language="fr-CH" datatype="x-indesign">
    <header>
      <tool tool-id="supertext-indesign" tool-name="Supertext InDesign Translation" tool-version="1.0.0"/>
    </header>
    <body>
      <!-- group id = story label (+ _t<n>_c<n> for cells, _fn<n> for footnotes) -->
      <group id="stmg5k1x2a9vq3">
        <!-- context for the translator -->
        <note>Page 3 | Layer: Text | 2 linked frames | Paragraph style: Body | Minion Pro Regular 10 pt | fixed space, watch the length</note>
        <!-- trans-unit id = <group id>_p<paragraph index> -->
        <trans-unit id="stmg5k1x2a9vq3_p0" xml:space="preserve">
          <source>Jetzt <g id="1">neu</g> im<x id="tab1" ctype="x-tab"/>Sortiment<x id="lb1" ctype="lb"/>ab <x id="o1" ctype="x-indesign-object"/> März</source>
          <target>Désormais <g id="1">nouveau</g> dans l'assortiment<x id="lb1" ctype="lb"/>dès <x id="o1" ctype="x-indesign-object"/> mars</target>
        </trans-unit>
      </group>
    </body>
  </file>
</xliff>
```

Conventions:

- **Paragraph index** `_pN` is the index in the container's `\r`-split, including empty paragraphs. Paragraphs without translatable text get no unit, so indices can have gaps, which is intended.
- **`<g id="k">`** wraps text whose style differs from run 0. `k` is the run index within the paragraph. Text in run 0's style (including later runs that happen to match it) is emitted untagged.
- **`<x ctype="lb"/>`** is a forced line break (`\n`), **`<x ctype="x-tab"/>`** a tab. Both are "soft": translators may move, add or drop them. Literal newlines in a target are treated as forced line breaks.
- **`<x ctype="x-indesign-object"/>`** with `id="o1"`, `o2`, … numbered per paragraph is a "hard" placeholder for an object character. Targets must contain all of them in the same order.
- **`<mrk>` and `<sub>`** in targets are unwrapped, other unknown elements ignored.
- **Target language** comes from `target-language`, falling back to a `_xx-YY` suffix in the file name.

## Import algorithm

Per XLIFF file (`applyPack`), wrapped in `app.doScript` as one undo step:

1. Index the document's stories by label, and their cells and footnotes by derived ID.
2. For each group in the XLIFF (`applyContainer`), with the story's layers and frames unlocked and Track Changes paused (`withUnlocked`):
   1. **Verify.** Re-analyse the container. If any unit's `<source>` (flattened, objects as U+E000) differs from the current paragraph text, skip the container as *changed*.
   2. **Process paragraphs from last to first**, so character offsets of earlier paragraphs stay valid. Untranslated paragraphs are not touched at all.
3. Per translated paragraph (`applyParagraph`):
   1. Split the target at its object placeholders. If they aren't exactly `o1…oN` in order, with N = number of object characters in the paragraph, leave the paragraph unchanged and report it.
   2. Read each style run's character attributes from its first character (`CHAR_ATTRS`).
   3. The paragraph text is cut into **chunks** between object characters. From the last chunk to the first, replace the chunk's text with the target chunk (`characters.itemByRange(s, e).texts[0].contents`, or `insertionPoints[s].contents` for an empty chunk). Object characters and the paragraph return are never replaced, so anchored objects, tables, footnotes and the paragraph style survive.
   4. Apply each segment's run attributes to its new characters, first via `range.properties = {…}` (one call), falling back to one property at a time if InDesign rejects the batch.
4. Check overset: `story.overflows` for stories and footnotes, `cell.overflows` for cells.
5. Save the copy and collect the report.

`appliedLanguage` is restored from the source, so translated text keeps the source language setting. Setting the target language for hyphenation is on the roadmap.

## Shared code

Everything below the marker comment

```
// ===================================== shared (identical in both scripts)
```

must stay **byte-identical** in both scripts, because export and import must segment text the same way. It contains `textContainers`, `firstContainer`, `isHidden`, `isHard`, `translatable`, `contentsOf`, `analyze`, `getRuns`, `pushRun`, `styleKey`, `hasText` and `safe`. The constants `LABEL` and `RUN_DETECTION` must also match.

Check it with:

```bash
diff <(sed -n '/shared (identical in both scripts)/,$p' "scripts/Translation Export.jsx") \
     <(sed -n '/shared (identical in both scripts)/,$p' "scripts/Translation Import.jsx") && echo identical
```

## Development setup

- **Editor:** VS Code with the [ExtendScript Debugger](https://marketplace.visualstudio.com/items?itemName=Adobe.extendscript-debug) extension. It runs a `.jsx` against a running InDesign, with breakpoints and DOM inspection.
- **Symlink the Scripts Panel folder** to your working copy, so the panel always runs your latest code:

  ```bash
  # macOS
  ln -s "$PWD/scripts" ~/Library/Preferences/Adobe\ InDesign/Version\ 21.0/en_US/Scripts/Scripts\ Panel/dev
  ```

  ```powershell
  # Windows (as administrator, or with developer mode on)
  New-Item -ItemType SymbolicLink -Path "$env:APPDATA\Adobe\InDesign\Version 21.0\en_US\Scripts\Scripts Panel\dev" -Target "$PWD\scripts"
  ```

- **Syntax check without InDesign:**

  ```bash
  for f in scripts/*.jsx; do
    sed '/^#target/d' "$f" > /tmp/check.js && node --check /tmp/check.js && echo "OK $f"
  done
  ```

  Node accepts ES5+ features that ExtendScript doesn't, so review new code for ES3 compatibility by hand.

- **Logic test without InDesign:** `node tests/logic-test.js` (add `-v` to print the generated XLIFF). It loads the real functions from both scripts and runs them against a mock story with styled runs, a tab, a forced line break, an anchored object, a page number and a footnote reference. It checks the XLIFF tags, the translated text, that bold and character-style formatting land on the moved words, that misplaced object tags leave the paragraph unchanged, and that edited source text is detected. The mock imitates InDesign's documented behaviour; it can't prove InDesign behaves the same, so it complements the checklist below.
- **Logging:** `$.writeln()` prints to the debugger console. Remove or guard log calls before committing.

## Test checklist

Build a test document `test/roundtrip.indd` (not committed) containing:

- [ ] A single text frame, a threaded story across two pages, text on a path
- [ ] A paragraph with a **bold** word, a word with a character style and a coloured word
- [ ] A forced line break (Shift+Enter), a tab, an empty paragraph
- [ ] An inline graphic and an anchored text frame inside a paragraph
- [ ] An auto page number on a parent page, a section marker
- [ ] A table with merged cells and a header row, a footnote
- [ ] A hyperlink, an index marker, a cross-reference
- [ ] Text on a locked layer and on a hidden layer, a locked frame
- [ ] Track Changes switched on for one story
- [ ] Umlauts and special characters: `äöü ÄÖÜ ß é è à ç € « » – “ ” & <tag>`

Round trip:

1. Export with targets `fr-CH, it-CH`. Open the XLIFF in a validator or CAT tool: it must parse, with the expected unit count.
2. **Identity test:** copy every `<source>` into a `<target>` and import. The result must be visually identical to the source, including objects, hyperlinks and the table.
3. **Real test:** translate with longer text and moved `<g>` tags, then import. Check formatting lands on the right words, forced line breaks become line breaks (not paragraph returns), and overset stories and cells are reported.
4. **Safety tests:** edit one story before import (reported as changed), delete one frame (not found), duplicate a frame after export (duplicate ID), remove an object tag from one target (paragraph kept, reported).
5. **Undo:** with *Apply to the open document*, one **Edit › Undo** must revert the whole import.
6. Run on Windows and macOS, in both run detection modes if time allows.

## Releasing

1. Update `VERSION` in `Translation Export.jsx` (written into the XLIFF `<tool>`).
2. Add an entry to `CHANGELOG.md`.
3. Run `node tests/logic-test.js` and the test checklist.
4. Tag the release: `git tag v1.1.0 && git push --tags`, and attach the two scripts to a GitHub release so users can download them without cloning.

Versioning follows [SemVer](https://semver.org). A change that alters the XLIFF structure or the ID scheme is a **major** version, because existing exported files may no longer import.

## Known limitations and roadmap

**Limitations**

- Untested in InDesign so far (see status in the README).
- Text in placed files, nested tables and outlined text is not exported. Hidden conditional text is not exported.
- Hyperlink and cross-reference *sources* that span replaced text may be lost or shortened, because their text is replaced. Their markers are kept.
- Translated text keeps the source `appliedLanguage`.
- Only XLIFF 1.2 is supported. In an XLIFF with several `<file>` elements, the target language is taken from the first one.
- No batch or book export yet.

**Roadmap ideas**

- **Target language:** map the XLIFF target language to an InDesign language and set `appliedLanguage` on import, for correct hyphenation and spell-checking.
- **UXP panel:** a dockable panel with export/import buttons, language presets and a clickable list of overset stories.
- **Book and folder batch mode.**
- **Supertext API integration:** send the XLIFF straight to Supertext and import on completion.
- **XLIFF 2.0** export and import.
- **Hyperlink sources:** export them as `<g>` with a link marker so they are re-created around the translated words.
