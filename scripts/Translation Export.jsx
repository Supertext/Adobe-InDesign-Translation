/*
 * Translation Export.jsx - Adobe InDesign script (round trip, part 1 of 2)
 * Supertext - Adobe InDesign Translation
 * https://github.com/Supertext/Adobe-InDesign-Translation
 *
 * Exports all text of the active document to XLIFF 1.2 for translation.
 * Every exported story gets a hidden, persistent ID (a script label saved
 * inside the .indd file), so "Translation Import.jsx" can write the
 * translations back into exactly the same stories, keeping formatting.
 *
 * - One trans-unit per paragraph; threaded frames are exported once per story.
 * - Table cells and footnotes are exported as their own groups.
 * - Formatting changes inside a paragraph (bold word, colour, character
 *   style...) are exported as <g id="n"> inline tags.
 * - Forced line breaks become <x ctype="lb"/>, tabs <x ctype="x-tab"/>.
 *   Anchored objects, page numbers, footnote references, tables and other
 *   markers become <x ctype="x-indesign-object"/>, which must stay in place.
 * - Each group carries a <note> with page, layer, paragraph style and font.
 *
 * Install: see docs/installation-guide.md
 */
#target indesign

(function () {
    var VERSION = "1.0.0";
    var LABEL = "SupertextID";
    // "fast" reads formatting runs via textStyleRanges. If inline formatting
    // ever goes missing after import, switch BOTH scripts to "exact" (slower).
    var RUN_DETECTION = "fast";

    if (app.documents.length === 0) {
        alert("Open a document first.");
        return;
    }
    var doc = app.activeDocument;

    var opts = showDialog();
    if (!opts) return;

    // ------------------------------------------------------- collect text
    var used = {};
    var items = [];
    var skipped = 0;
    var stories = doc.stories.everyItem().getElements();

    for (var i = 0; i < stories.length; i++) {
        var story = stories[i];
        var frame = firstContainer(story);
        if (!frame) continue;

        var where = placement(frame);
        if (where.parent && !opts.includeParent) continue;
        var hidden = isHidden(story);
        if (hidden && !opts.includeHidden) continue;

        var containers = textContainers(story);
        var found = [];
        for (var c = 0; c < containers.length; c++) {
            var a = analyze(containers[c].text);
            if (hasText(a)) found.push({ c: containers[c], analysis: a });
        }
        if (!found.length) continue;

        var sid = ensureId(story, used);
        if (!sid) { skipped++; continue; }

        var b = safe(function () { return frame.geometricBounds; }) || [0, 0, 0, 0];
        for (var f = 0; f < found.length; f++) {
            items.push({
                id: sid + found[f].c.suffix,
                analysis: found[f].analysis,
                order: where.order,
                seq: items.length,
                y: b[0],
                x: b[1],
                note: describe(story, frame, where, found[f].c, hidden)
            });
        }
    }

    if (!items.length) {
        alert("No translatable text found in " + doc.name + ".");
        return;
    }

    // Reading order: page, then top-to-bottom, then left-to-right.
    // Tables and footnotes stay right after their story.
    items.sort(function (a, b) {
        if (a.order !== b.order) return a.order - b.order;
        if (Math.abs(a.y - b.y) > 2) return a.y - b.y;
        if (Math.abs(a.x - b.x) > 2) return a.x - b.x;
        return a.seq - b.seq;
    });

    // ------------------------------------------------------------ write
    var folder = docFolder(doc) || Folder.selectDialog("Choose where to save the XLIFF files");
    if (!folder) return;

    var base = doc.name.replace(/\.[^\.]+$/, "");
    var targets = opts.targets.length ? opts.targets : [""];
    var written = [];
    var units = 0;

    for (var t = 0; t < targets.length; t++) {
        var file = new File(folder.fsName + "/" + base + (targets[t] ? "_" + targets[t] : "") + ".xlf");
        var x = buildXliff(opts.source, targets[t]);
        units = x.units;
        file.encoding = "UTF-8";
        file.lineFeed = "Unix";
        if (!file.open("w")) { alert("Could not write " + file.fsName); return; }
        file.write(x.text);
        file.close();
        written.push(file.fsName);
    }

    var msg;
    if (opts.save && docFolder(doc)) {
        doc.save();
        msg = "The document was saved with the text IDs.";
    } else {
        msg = "IMPORTANT: save this document. The text IDs needed for the import are stored in it.";
    }

    alert("Exported " + items.length + " stories, table cells and footnotes (" + units + " paragraphs) to:\n\n" +
        written.join("\n") + "\n\n" + msg +
        (skipped ? "\n\n" + skipped + " story/stories could not be tagged and were skipped." : ""));

    folder.execute();

    // =============================================================== UI

    function showDialog() {
        var d = new Window("dialog", "Export for Translation (XLIFF)");
        d.orientation = "column";
        d.alignChildren = "fill";

        var p = d.add("panel", undefined, "Languages");
        p.alignChildren = "left";
        p.margins = 14;
        var g1 = p.add("group");
        g1.add("statictext", undefined, "Source language:").preferredSize.width = 120;
        var src = g1.add("edittext", undefined, "de-CH");
        src.characters = 10;
        var g2 = p.add("group");
        g2.add("statictext", undefined, "Target languages:").preferredSize.width = 120;
        var tgt = g2.add("edittext", undefined, "fr-CH, it-CH, en-GB");
        tgt.characters = 26;
        p.add("statictext", undefined, "One XLIFF file per target language. Leave empty for a single file.");

        var o = d.add("panel", undefined, "Options");
        o.alignChildren = "left";
        o.margins = 14;
        var cbP = o.add("checkbox", undefined, "Include text on parent pages (master pages)");
        cbP.value = true;
        var cbH = o.add("checkbox", undefined, "Include hidden text (hidden layers and frames)");
        var cbS = o.add("checkbox", undefined, "Save the document after adding text IDs (needed for import)");
        cbS.value = true;

        var btn = d.add("group");
        btn.alignment = "right";
        btn.add("button", undefined, "Cancel", { name: "cancel" });
        btn.add("button", undefined, "Export", { name: "ok" });

        while (true) {
            if (d.show() !== 1) return null;
            var s = parseLangs(src.text);
            var ts = parseLangs(tgt.text);
            if (!s || s.length !== 1) { alert("Enter one source language code, e.g. de-CH."); continue; }
            if (!ts) { alert("Target languages must be codes like fr-CH, it-CH, en-GB (comma separated)."); continue; }
            return { source: s[0], targets: ts, includeParent: cbP.value, includeHidden: cbH.value, save: cbS.value };
        }
    }

    function parseLangs(s) {
        var out = [];
        var parts = String(s).split(/[,;\s]+/);
        for (var i = 0; i < parts.length; i++) {
            if (!parts[i]) continue;
            if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(parts[i])) return null;
            out.push(parts[i]);
        }
        return out;
    }

    // =========================================================== XLIFF

    function buildXliff(src, tgt) {
        var x = [];
        var n = 0;
        x.push('<?xml version="1.0" encoding="UTF-8"?>');
        x.push('<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">');
        x.push('  <file original="' + esc(doc.name) + '" source-language="' + esc(src) + '"' +
            (tgt ? ' target-language="' + esc(tgt) + '"' : '') + ' datatype="x-indesign">');
        x.push('    <header>');
        x.push('      <tool tool-id="supertext-indesign" tool-name="Supertext InDesign Translation" tool-version="' + VERSION + '"/>');
        x.push('    </header>');
        x.push('    <body>');
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var paras = it.analysis.paras;
            x.push('      <group id="' + esc(it.id) + '">');
            x.push('        <note>' + esc(it.note) + '</note>');
            for (var p = 0; p < paras.length; p++) {
                if (!translatable(paras[p].text)) continue;
                x.push('        <trans-unit id="' + esc(it.id) + '_p' + p + '" xml:space="preserve">');
                x.push('          <source>' + inlineXml(paras[p]) + '</source>');
                x.push('        </trans-unit>');
                n++;
            }
            x.push('      </group>');
        }
        x.push('    </body>');
        x.push('  </file>');
        x.push('</xliff>');
        return { text: x.join("\n") + "\n", units: n };
    }

    // Run 0 is the paragraph's base style. Runs with another style become
    // <g id="run index">. Placeholder numbering runs across the paragraph.
    function inlineXml(para) {
        var out = "";
        var cnt = { lb: 0, tab: 0, obj: 0 };
        var baseKey = para.runs.length ? para.runs[0].key : null;
        for (var k = 0; k < para.runs.length; k++) {
            var r = para.runs[k];
            var inner = escInline(para.text.substr(r.start - para.start, r.len), cnt);
            out += (k === 0 || r.key === baseKey) ? inner : '<g id="' + k + '">' + inner + '</g>';
        }
        return out;
    }

    function escInline(t, cnt) {
        var s = "";
        var plainRun = "";
        for (var i = 0; i < t.length; i++) {
            var ch = t.charAt(i);
            if (ch === "\n") {
                s += esc(plainRun); plainRun = "";
                cnt.lb++; s += '<x id="lb' + cnt.lb + '" ctype="lb"/>';
            } else if (ch === "\t") {
                s += esc(plainRun); plainRun = "";
                cnt.tab++; s += '<x id="tab' + cnt.tab + '" ctype="x-tab"/>';
            } else if (isHard(ch)) {
                s += esc(plainRun); plainRun = "";
                cnt.obj++; s += '<x id="o' + cnt.obj + '" ctype="x-indesign-object"/>';
            } else {
                plainRun += ch;
            }
        }
        return s + esc(plainRun);
    }

    function esc(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "");
    }

    // ============================================================== IDs

    function ensureId(story, used) {
        var id = "";
        try { id = story.extractLabel(LABEL); } catch (e) {}
        // Keep an existing ID unless another story already has it (duplicated frame).
        if (id && !used[id]) { used[id] = true; return id; }
        do {
            id = "st" + new Date().getTime().toString(36) + Math.floor(Math.random() * 1e8).toString(36);
        } while (used[id]);
        try { story.insertLabel(LABEL, id); } catch (e2) { return null; }
        used[id] = true;
        return id;
    }

    // ========================================================= helpers

    function placement(frame) {
        var pg = null;
        try { pg = frame.parentPage; } catch (e) {}
        if (!pg) return { label: "Pasteboard", order: 900000, parent: false };
        var isParent = false;
        try { isParent = pg.parent.constructor.name === "MasterSpread"; } catch (e2) {}
        if (isParent) return { label: "Parent page " + pg.name, order: -1, parent: true };
        var off = safe(function () { return pg.documentOffset; });
        return { label: "Page " + pg.name, order: off === "" ? 0 : off, parent: false };
    }

    function describe(story, frame, where, c, hidden) {
        var p = [where.label];
        p.push("Layer: " + safe(function () { return frame.itemLayer.name; }));
        if (c.kind === "cell") p.push(c.label);
        else if (c.kind === "footnote") p.push(c.label);
        else {
            var n = safe(function () { return story.textContainers.length; });
            if (n > 1) p.push(n + " linked frames");
        }
        var t = c.text;
        var ps = safe(function () { return t.paragraphs[0].appliedParagraphStyle.name; });
        if (ps) p.push("Paragraph style: " + ps);
        var font = safe(function () { return t.characters[0].appliedFont.name; });
        var size = safe(function () { return Math.round(t.characters[0].pointSize * 10) / 10; });
        if (font) p.push(String(font).replace(/\t/g, " ") + (size !== "" ? " " + size + " pt" : ""));
        var fixed = c.kind === "cell" ? true : safe(function () {
            return frame.textFramePreferences.autoSizingType === AutoSizingTypeEnum.OFF;
        });
        if (fixed !== false && c.kind !== "footnote") p.push("fixed space, watch the length");
        var over = c.kind === "cell" ? safe(function () { return c.cell.overflows; }) : safe(function () { return story.overflows; });
        if (over === true) p.push("already overset in the source");
        if (hidden) p.push("hidden");
        return p.join(" | ");
    }

    function docFolder(d) {
        try { if (d.fullName && d.fullName.exists) return d.fullName.parent; } catch (e) {}
        return null;
    }

    // ===================================== shared (identical in both scripts)

    // The story itself, its table cells and its footnotes, each a text object.
    function textContainers(story) {
        var list = [{ suffix: "", kind: "story", text: story, label: "" }];
        var tables = safe(function () { return story.tables.everyItem().getElements(); }) || [];
        for (var t = 0; t < tables.length; t++) {
            var cells = safe(function () { return tables[t].cells.everyItem().getElements(); }) || [];
            for (var c = 0; c < cells.length; c++) {
                var cell = cells[c];
                var txt = safe(function () { return cell.texts[0]; });
                if (!txt) continue;
                var r = safe(function () { return cell.parentRow.index + 1; });
                var col = safe(function () { return cell.parentColumn.index + 1; });
                list.push({ suffix: "_t" + t + "_c" + c, kind: "cell", text: txt, cell: cell,
                    label: "Table " + (t + 1) + ", row " + r + ", column " + col });
            }
        }
        var notes = safe(function () { return story.footnotes.everyItem().getElements(); }) || [];
        for (var f = 0; f < notes.length; f++) {
            var ft = safe(function () { return notes[f].texts[0]; });
            if (ft) list.push({ suffix: "_fn" + f, kind: "footnote", text: ft, label: "Footnote " + (f + 1) });
        }
        return list;
    }

    function firstContainer(story) {
        try { if (story.textContainers.length) return story.textContainers[0]; } catch (e) {}
        return null;
    }

    function isHidden(story) {
        try {
            var tc = story.textContainers;
            for (var i = 0; i < tc.length; i++) {
                if (tc[i].itemLayer.visible && tc[i].visible !== false) return false;
            }
            return tc.length > 0;
        } catch (e) {
            return false;
        }
    }

    // Characters that stand for objects (anchored frames, tables, footnote
    // references, page numbers, markers...). They must survive the import.
    function isHard(ch) {
        return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u2028\u2029\uFEFF\uFFFC]/.test(ch);
    }

    function translatable(t) {
        return /[^\s\u0000-\u001F\u2028\u2029\uFEFF\uFFFC]/.test(t);
    }

    function contentsOf(t) {
        var c = t.contents;
        return typeof c === "string" ? c : "\uFFFC"; // a single special character
    }

    function analyze(textObj) {
        var text = contentsOf(textObj);
        var runs = getRuns(textObj, text.length);
        var parts = text.split("\r");
        var paras = [];
        var pos = 0;
        for (var p = 0; p < parts.length; p++) {
            var end = pos + parts[p].length;
            var para = { start: pos, text: parts[p], runs: [] };
            for (var k = 0; k < runs.length; k++) {
                var s = Math.max(runs[k].start, pos);
                var e = Math.min(runs[k].start + runs[k].len, end);
                if (e > s) pushRun(para.runs, s, e - s, runs[k].key);
            }
            paras.push(para);
            pos = end + 1;
        }
        return { text: text, paras: paras };
    }

    function getRuns(textObj, len) {
        var runs = null;
        if (RUN_DETECTION === "fast") {
            try {
                var trs = textObj.textStyleRanges.everyItem().getElements();
                var pos = 0;
                runs = [];
                for (var i = 0; i < trs.length; i++) {
                    var l = contentsOf(trs[i]).length;
                    if (!l) continue;
                    pushRun(runs, pos, l, styleKey(trs[i]));
                    pos += l;
                }
                if (pos !== len) runs = null;
            } catch (e) {
                runs = null;
            }
        }
        if (!runs) {
            runs = [];
            var ch = textObj.characters.everyItem().getElements();
            for (var j = 0; j < ch.length; j++) pushRun(runs, j, 1, styleKey(ch[j]));
        }
        return runs;
    }

    function pushRun(runs, start, len, key) {
        var last = runs[runs.length - 1];
        if (last && last.key === key && last.start + last.len === start) last.len += len;
        else runs.push({ start: start, len: len, key: key });
    }

    function styleKey(r) {
        return [
            safe(function () { return r.appliedCharacterStyle.name; }),
            safe(function () { return r.appliedFont.name; }),
            safe(function () { return r.fontStyle; }),
            safe(function () { return r.pointSize; }),
            safe(function () { return r.fillColor.name; }),
            safe(function () { return r.fillTint; }),
            safe(function () { return r.strokeColor.name; }),
            safe(function () { return r.underline; }),
            safe(function () { return r.strikeThru; }),
            safe(function () { return String(r.position); }),
            safe(function () { return String(r.capitalization); }),
            safe(function () { return r.baselineShift; }),
            safe(function () { return r.tracking; }),
            safe(function () { return r.horizontalScale; }),
            safe(function () { return r.skew; })
        ].join("|");
    }

    function hasText(a) {
        for (var p = 0; p < a.paras.length; p++) if (translatable(a.paras[p].text)) return true;
        return false;
    }

    function safe(fn) {
        try { var v = fn(); return v == null ? "" : v; } catch (e) { return ""; }
    }
})();
