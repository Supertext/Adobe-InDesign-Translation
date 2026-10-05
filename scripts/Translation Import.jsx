/*
 * Translation Import.jsx - Adobe InDesign script (round trip, part 2 of 2)
 * Supertext - Adobe InDesign Translation
 * https://github.com/Supertext/Adobe-InDesign-Translation
 *
 * Reads translated XLIFF 1.2 files produced from "Translation Export.jsx"
 * and writes the translations back into the original stories, table cells
 * and footnotes, matched by the hidden SupertextID label. Paragraph styles
 * stay untouched; character formatting is restored per style run, and
 * <g> tags map back to the inline formatting. Anchored objects, page
 * numbers, footnote references and other markers are kept in place.
 *
 * By default a copy is created per language (<name>_<lang>.indd) and the
 * original document is left untouched. Stories whose text no longer fits
 * (overset text) are reported. Each import is a single undo step.
 *
 * Install: see docs/installation-guide.md
 */
#target indesign

(function () {
    var LABEL = "SupertextID";
    var RUN_DETECTION = "fast"; // must match the export script
    // Order matters: the character style first, the font before its style.
    var CHAR_ATTRS = ["appliedCharacterStyle", "appliedFont", "fontStyle", "pointSize", "leading",
        "fillColor", "fillTint", "strokeColor", "strokeTint", "strokeWeight", "underline", "strikeThru",
        "position", "capitalization", "baselineShift", "tracking", "horizontalScale", "verticalScale",
        "skew", "noBreak", "ligatures", "appliedLanguage"];

    if (!app.documents.length) { alert("Open the original (exported) document first."); return; }
    var doc = app.activeDocument;

    var files = pickFiles();
    if (!files) return;

    var packs = [];
    for (var f = 0; f < files.length; f++) {
        try { packs.push(readXliff(files[f])); }
        catch (e) { alert("Could not read " + files[f].displayName + ":\n" + e.message); return; }
    }

    var opts = showDialog();
    if (!opts) return;

    var redraw = app.scriptPreferences.enableRedraw;
    var interaction = app.scriptPreferences.userInteractionLevel;
    app.scriptPreferences.enableRedraw = false;

    var out = [];
    try {
        if (opts.copies) {
            if (!docFolder(doc)) { alert("Save the original document first."); return; }
            if (doc.modified) {
                if (!confirm("Save changes to " + doc.name + " first?")) return;
                doc.save();
            }
            var orig = doc.fullName;
            var base = doc.name.replace(/\.[^\.]+$/, "");
            var ext = (doc.name.match(/\.[^\.]+$/) || [".indd"])[0];
            var overwrite = null;
            for (var p = 0; p < packs.length; p++) {
                var lang = packs[p].lang || "translated" + (p + 1);
                var dest = new File(orig.parent.fsName + "/" + base + "_" + lang + ext);
                if (isOpen(dest)) { out.push(lang + ": skipped, close " + dest.displayName + " first."); continue; }
                if (dest.exists) {
                    if (overwrite === null) overwrite = confirm("Some translated copies already exist. Overwrite them?");
                    if (!overwrite) { out.push(lang + ": skipped (file exists)."); continue; }
                    dest.remove();
                }
                if (!orig.copy(dest)) { out.push(lang + ": could not create copy."); continue; }
                // Suppress missing-font / missing-link dialogs while opening the copy.
                app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;
                var d;
                try { d = app.open(dest, true); }
                finally { app.scriptPreferences.userInteractionLevel = interaction; }
                var rep = undoable(d, packs[p]);
                d.save();
                out.push(report(lang, d.name, rep));
            }
        } else {
            out.push(report(packs[0].lang, doc.name, undoable(doc, packs[0])));
        }
    } finally {
        app.scriptPreferences.enableRedraw = redraw;
        app.scriptPreferences.userInteractionLevel = interaction;
    }
    alert("Import finished\n\n" + out.join("\n\n"));

    // =============================================================== UI

    function pickFiles() {
        var filter = $.os.indexOf("Windows") >= 0
            ? "XLIFF files:*.xlf;*.xliff;*.xml,All files:*.*"
            : function (f) { return f instanceof Folder || /\.(xlf|xliff|xml)$/i.test(f.name); };
        var r = File.openDialog("Select translated XLIFF file(s)", filter, true);
        if (!r) return null;
        return r instanceof Array ? r : [r];
    }

    function showDialog() {
        var d = new Window("dialog", "Import Translation (XLIFF)");
        d.alignChildren = "fill";

        var p = d.add("panel", undefined, "Files");
        p.alignChildren = "left";
        p.margins = 14;
        for (var i = 0; i < packs.length; i++) {
            var k = packs[i];
            p.add("statictext", undefined, (k.lang || "?") + "  -  " + k.count + " paragraphs  -  " + k.file.displayName +
                (k.original && k.original !== doc.name ? "   (exported from " + k.original + "!)" : ""));
        }

        var m = d.add("panel", undefined, "Mode");
        m.alignChildren = "left";
        m.margins = 14;
        var rbCopy = m.add("radiobutton", undefined, "Create a translated copy per language (original stays untouched)");
        var rbHere = m.add("radiobutton", undefined, "Apply to the open document (one undo step)");
        rbCopy.value = true;
        rbHere.enabled = packs.length === 1;

        var b = d.add("group");
        b.alignment = "right";
        b.add("button", undefined, "Cancel", { name: "cancel" });
        b.add("button", undefined, "Import", { name: "ok" });

        if (d.show() !== 1) return null;
        return { copies: rbCopy.value };
    }

    // ===================================================== XLIFF reading

    function readXliff(file) {
        file.encoding = "UTF-8";
        if (!file.open("r")) throw new Error("Cannot open file.");
        var s = file.read();
        file.close();
        s = s.replace(/^\uFEFF/, "").replace(/^\s*<\?xml[^>]*\?>/, "").replace(/<!DOCTYPE[^>]*>/i, "");
        XML.ignoreWhitespace = false;
        XML.ignoreComments = true;
        XML.ignoreProcessingInstructions = true;
        var x = new XML(s);
        var pack = { file: file, lang: "", original: "", units: {}, count: 0 };
        eachElement(x, "file", function (fe) {
            if (!pack.lang) pack.lang = String(fe.attribute("target-language"));
            if (!pack.original) pack.original = String(fe.attribute("original"));
            eachElement(fe, "trans-unit", function (u) {
                var m = String(u.attribute("id")).match(/^(.+)_p(\d+)$/);
                if (!m) return;
                var src = null, tgt = null, kids = u.elements();
                for (var i = 0; i < kids.length(); i++) {
                    if (kids[i].localName() === "source") src = kids[i];
                    else if (kids[i].localName() === "target") tgt = kids[i];
                }
                var unit = { source: src ? inline(src, 0, []) : [], target: tgt ? inline(tgt, 0, []) : null };
                if (unit.target && !translatable(plain(unit.target))) unit.target = null;
                (pack.units[m[1]] = pack.units[m[1]] || {})[m[2]] = unit;
                pack.count++;
            });
        });
        if (!pack.lang) {
            var fm = File.decode(file.name).match(/_([A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*)\.(xlf|xliff|xml)$/i);
            if (fm) pack.lang = fm[1];
        }
        if (!pack.count) throw new Error("No translation units found.");
        return pack;
    }

    function eachElement(node, name, fn) {
        var kids = node.elements();
        for (var i = 0; i < kids.length(); i++) {
            if (kids[i].localName() === name) fn(kids[i]);
            else eachElement(kids[i], name, fn);
        }
    }

    // Flattens a <source>/<target> into segments:
    //   {text, style}  text in the style of run `style` (0 = paragraph base)
    //   {hard, style}  an object placeholder (<x ctype="x-indesign-object">)
    function inline(node, style, segs) {
        var kids = node.children();
        for (var i = 0; i < kids.length(); i++) {
            var c = kids[i], kind = c.nodeKind();
            if (kind === "text") {
                segs.push({ text: String(c).replace(/\r\n|\r|\n/g, "\n"), style: style });
            } else if (kind === "element") {
                var n = c.localName();
                if (n === "g") {
                    var gid = parseInt(String(c.attribute("id")).replace(/\D/g, ""), 10);
                    inline(c, isNaN(gid) ? style : gid, segs);
                } else if (n === "x") {
                    var ct = String(c.attribute("ctype"));
                    if (ct === "lb") segs.push({ text: "\n", style: style });
                    else if (ct === "x-tab") segs.push({ text: "\t", style: style });
                    else if (ct === "x-indesign-object") segs.push({ hard: String(c.attribute("id")), text: "", style: style });
                } else if (n === "mrk" || n === "sub") {
                    inline(c, style, segs);
                }
            }
        }
        return segs;
    }

    // Plain text with object placeholders as U+E000, for comparisons.
    function plain(segs) {
        var s = "";
        for (var i = 0; i < segs.length; i++) s += segs[i].hard ? "\uE000" : segs[i].text;
        return s;
    }

    function canon(text) {
        var s = "";
        for (var i = 0; i < text.length; i++) s += isHard(text.charAt(i)) ? "\uE000" : text.charAt(i);
        return s;
    }

    // ========================================================= applying

    function undoable(d, pack) {
        var rep, err;
        try {
            app.doScript(function () {
                try { rep = applyPack(d, pack); } catch (e) { err = e; }
            }, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT, "Import translation");
        } catch (e2) {
            if (!rep && !err) rep = applyPack(d, pack); // doScript not available
        }
        if (err) throw err;
        return rep;
    }

    function applyPack(d, pack) {
        var rep = { translated: 0, untranslated: 0, changed: [], tags: [], missing: 0, dupes: 0, overflow: [] };
        var index = {}, seen = {};
        var stories = d.stories.everyItem().getElements();
        for (var i = 0; i < stories.length; i++) {
            var id = "";
            try { id = stories[i].extractLabel(LABEL); } catch (e) {}
            if (!id) continue;
            if (seen[id]) { rep.dupes++; continue; }
            seen[id] = true;
            var cs = textContainers(stories[i]);
            for (var c = 0; c < cs.length; c++) {
                cs[c].story = stories[i];
                index[id + cs[c].suffix] = cs[c];
            }
        }
        var touched = [];
        for (var gid in pack.units) {
            if (!pack.units.hasOwnProperty(gid)) continue;
            var entry = index[gid];
            if (!entry) { rep.missing++; continue; }
            var res = withUnlocked(entry.story, function () { return applyContainer(entry, pack.units[gid], rep); });
            if (res === "changed") rep.changed.push(snippet(entry.text));
            else if (res === "ok") touched.push(entry);
        }
        var reported = {};
        for (var t = 0; t < touched.length; t++) {
            var en = touched[t];
            var over = en.kind === "cell" ? safe(function () { return en.cell.overflows; })
                : safe(function () { return en.story.overflows; });
            var key = en.kind === "cell" ? "cell" + t : "story" + safe(function () { return en.story.id; });
            if (over === true && !reported[key]) {
                reported[key] = true;
                rep.overflow.push(where(en) + " " + snippet(en.kind === "footnote" ? en.story : en.text));
            }
        }
        return rep;
    }

    function applyContainer(entry, unitMap, rep) {
        var t = entry.text, a = analyze(t), paras = a.paras, any = false;

        // Safety: the source text must still match what was exported.
        for (var key in unitMap) {
            if (!unitMap.hasOwnProperty(key)) continue;
            var pi = parseInt(key, 10);
            if (!paras[pi] || plain(unitMap[key].source) !== canon(paras[pi].text)) return "changed";
        }

        // Last paragraph first, so earlier character offsets stay valid.
        for (var p = paras.length - 1; p >= 0; p--) {
            var u = unitMap[p];
            if (!u) continue;
            if (!u.target) { rep.untranslated++; continue; }
            if (applyParagraph(t, paras[p], u.target)) { rep.translated++; any = true; }
            else rep.tags.push(snippetText(paras[p].text));
        }
        return any ? "ok" : "unchanged";
    }

    // Replaces the text between the object characters of one paragraph.
    // Returns false (and changes nothing) if the placeholders don't match.
    function applyParagraph(t, para, segs) {
        var hard = [], i, k;
        for (i = 0; i < para.text.length; i++) if (isHard(para.text.charAt(i))) hard.push(para.start + i);

        // Split the target at its placeholders, which must be o1..oN in order.
        var chunks = [[]], n = 0;
        for (i = 0; i < segs.length; i++) {
            if (segs[i].hard) {
                n++;
                if (segs[i].hard !== "o" + n) return false;
                chunks.push([]);
            } else if (segs[i].text) {
                chunks[chunks.length - 1].push(segs[i]);
            }
        }
        if (n !== hard.length) return false;

        // Formatting of each style run, read before the text changes.
        var styles = [];
        for (k = 0; k < para.runs.length; k++) styles[k] = readChar(t.characters[para.runs[k].start]);

        var bounds = [para.start];
        for (i = 0; i < hard.length; i++) bounds.push(hard[i], hard[i] + 1);
        bounds.push(para.start + para.text.length);

        for (var c = chunks.length - 1; c >= 0; c--) {
            var s = bounds[c * 2], e = bounds[c * 2 + 1], str = "";
            for (i = 0; i < chunks[c].length; i++) str += chunks[c][i].text;
            if (e > s) t.characters.itemByRange(s, e - 1).texts[0].contents = str;
            else if (str) t.insertionPoints[s].contents = str;

            var off = s;
            for (i = 0; i < chunks[c].length; i++) {
                var seg = chunks[c][i], L = seg.text.length;
                var st = styles[seg.style] || styles[0];
                if (L && st) applyChar(t, off, L, st);
                off += L;
            }
        }
        return true;
    }

    function readChar(ch) {
        var o = {};
        for (var i = 0; i < CHAR_ATTRS.length; i++) {
            try {
                var v = ch[CHAR_ATTRS[i]];
                if (v !== undefined && v !== null) o[CHAR_ATTRS[i]] = v;
            } catch (e) {}
        }
        return o;
    }

    function applyChar(t, start, len, props) {
        var r;
        try { r = t.characters.itemByRange(start, start + len - 1).texts[0]; } catch (e) { return; }
        try { r.properties = props; return; } catch (e2) {}
        for (var i = 0; i < CHAR_ATTRS.length; i++) {
            if (props[CHAR_ATTRS[i]] === undefined) continue;
            try { r[CHAR_ATTRS[i]] = props[CHAR_ATTRS[i]]; } catch (e3) {}
        }
    }

    // Unlocks the story's frames and layers and pauses Track Changes,
    // then restores everything.
    function withUnlocked(story, fn) {
        var undo = [];
        var tc = safe(function () { return story.textContainers; }) || [];
        for (var i = 0; i < tc.length; i++) {
            var fr = tc[i], layer = safe(function () { return fr.itemLayer; });
            if (layer) {
                try { if (layer.locked) { layer.locked = false; undo.push([layer, "locked", true]); } } catch (e1) {}
            }
            try { if (fr.locked) { fr.locked = false; undo.push([fr, "locked", true]); } } catch (e2) {}
        }
        try { if (story.trackChanges) { story.trackChanges = false; undo.push([story, "trackChanges", true]); } } catch (e3) {}
        try {
            return fn();
        } finally {
            for (var u = undo.length - 1; u >= 0; u--) {
                try { undo[u][0][undo[u][1]] = undo[u][2]; } catch (e4) {}
            }
        }
    }

    // =========================================================== report

    function report(lang, name, r) {
        var l = [(lang ? lang + " -> " : "") + name, "  Translated paragraphs: " + r.translated];
        if (r.untranslated) l.push("  Not translated (original kept): " + r.untranslated);
        if (r.tags.length) l.push("  Kept original, object placeholders missing or moved: " + r.tags.length + " (" + r.tags.slice(0, 3).join("; ") + ")");
        if (r.changed.length) l.push("  Skipped, text changed since export: " + r.changed.slice(0, 5).join("; "));
        if (r.missing) l.push("  Stories, cells or footnotes not found (deleted?): " + r.missing);
        if (r.dupes) l.push("  Stories with duplicate IDs (copied after export): " + r.dupes);
        if (r.overflow.length) l.push("  OVERSET TEXT in " + r.overflow.length + " place(s): " + r.overflow.slice(0, 5).join("; "));
        return l.join("\n");
    }

    function where(entry) {
        var fr = firstContainer(entry.story), lbl = "";
        try {
            var pg = fr.parentPage;
            lbl = pg ? (pg.parent.constructor.name === "MasterSpread" ? "parent page " : "page ") + pg.name : "pasteboard";
        } catch (e) {}
        return "[" + lbl + (entry.kind === "story" ? "" : ", " + entry.label) + "]";
    }

    function snippet(t) {
        return snippetText(safe(function () { return contentsOf(t); }));
    }

    function snippetText(s) {
        s = String(s).replace(/[\r\n\t]+/g, " ").replace(/[\u0000-\u001F\uFEFF\uFFFC]/g, "");
        return '"' + (s.length > 30 ? s.substr(0, 30) + "..." : s) + '"';
    }

    function isOpen(file) {
        for (var i = 0; i < app.documents.length; i++) {
            try { if (app.documents[i].fullName.fsName === file.fsName) return true; } catch (e) {}
        }
        return false;
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
