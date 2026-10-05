# User guide

This guide covers the full translation workflow for InDesign documents: exporting text, translating it, and importing the translations back.

- [The workflow at a glance](#the-workflow-at-a-glance)
- [Step 1: Export](#step-1-export)
- [Step 2: Translate](#step-2-translate)
- [Step 3: Import](#step-3-import)
- [Reading the import report](#reading-the-import-report)
- [Do's and don'ts](#dos-and-donts)
- [FAQ](#faq)

## The workflow at a glance

| Who | Step | Result |
|---|---|---|
| Designer / PM | Run **Translation Export** on the final source document | One `.xlf` per target language, document saved with text IDs |
| Translator | Translate the `.xlf` in a CAT tool or TMS | Translated `.xlf` files |
| Designer / PM | Run **Translation Import** on the same source document | One translated `.indd` copy per language |
| Designer | Fix overset text, line breaks and hyphenation in each copy | Final translated documents |

The single most important rule: **don't edit the source document's text between export and import.** Stories whose text changed are skipped on import.

## Step 1: Export

1. Open the source document. Make sure the text is final.
2. Open **Window › Utilities › Scripts** and double-click **Translation Export.jsx** (in the **User** folder).
3. Fill in the dialog:

| Field | Meaning |
|---|---|
| **Source language** | Language of the document, as a code such as `de-CH`, `en-GB`, `fr`. |
| **Target languages** | Comma-separated codes, for example `fr-CH, it-CH, en-GB`. One XLIFF file is created per language. Leave empty to create a single file without a target language. |
| **Include text on parent pages** | On by default. Exports text on parent (master) pages, such as running headers and footers. |
| **Include hidden text** | Also export stories whose frames are all on hidden layers or hidden. Off by default. |
| **Save the document after adding text IDs** | On by default. The IDs that link stories to translations are stored in the document, so it must be saved. |

4. Click **Export**. The files are written next to the `.indd` file:

```
Brochure.indd
Brochure_fr-CH.xlf
Brochure_it-CH.xlf
Brochure_en-GB.xlf
```

A summary shows how many stories, cells and footnotes and how many paragraphs were exported, and the folder opens.

**What gets exported:** every story (text frames, threaded frames, text on paths), on all pages, parent pages and the pasteboard, in reading order (page, then top to bottom, then left to right). Each table cell and each footnote is exported as its own group right after its story. Each paragraph becomes one translation unit.

**What doesn't:** text converted to outlines, text inside placed files (PDF, AI, images), and text in nested tables (tables inside cells) are not covered in this version. Hidden conditional text is not exported. Endnotes have not been tested yet.

> If the document has never been saved, the script asks for a folder and reminds you to save the document. Unsaved IDs are lost when you close it.

## Step 2: Translate

Send the `.xlf` files to translation, or import them into your CAT tool. XLIFF 1.2 is supported by memoQ, Trados Studio, Phrase, Crowdin, Smartcat, MateCat and most other tools.

Instructions for translators:

- **Keep the inline tags.** `<g>` tags mark formatted words (bold, a colour, a character style). Place them around the equivalent words in the translation.
- **Keep every object tag, in its original order.** `<x ctype="x-indesign-object"/>` stands for something in the layout: an inline image, a page number, a footnote reference, a table. If one is deleted or two are swapped, that paragraph keeps its source text and is reported.
- **Line breaks and tabs are flexible.** `<x ctype="lb"/>` (forced line break) and `<x ctype="x-tab"/>` (tab) can be moved, added or removed where the translation needs it.
- **Read the notes.** Each group has a note with its page, layer, paragraph style, font and size. Groups marked *fixed space, watch the length* have limited room: aim for a translation of similar length.
- **Don't merge or split segments** across trans-units. Each unit is one paragraph in the layout.
- **Return the files under any name.** The target language is read from the file, and the file name is used as a fallback.

## Step 3: Import

1. Open the **original source document** (the one you exported from, saved with the IDs).
2. Double-click **Translation Import.jsx** in the Scripts panel.
3. Select one or more translated `.xlf` files. Hold Ctrl/Cmd to select several languages at once.
4. The dialog lists each file with its language and paragraph count. A warning appears if a file was exported from a different document.

| Option | Meaning |
|---|---|
| **Create a translated copy per language** | Default. Creates `Brochure_fr-CH.indd` etc. next to the original. The original is not modified. |
| **Apply to the open document** | Writes the translation into the open document. Only available for a single file. The whole import is one step in **Edit › Undo**. |

5. Click **Import**. Each translated copy is created, filled, saved and left open. Missing fonts or links in the copy don't interrupt the import with dialogs.

If a translated copy already exists, you're asked whether to overwrite it. Close any open copy before re-importing.

## Reading the import report

After the import, a summary appears per language:

```
fr-CH -> Brochure_fr-CH.indd
  Translated paragraphs: 412
  Not translated (original kept): 3
  Kept original, object placeholders missing or moved: 1 ("Siehe Seite  für Details")
  Skipped, text changed since export: "Frühlingsaktion bis 31. Mai..."
  Stories, cells or footnotes not found (deleted?): 1
  OVERSET TEXT in 2 place(s): [page 4] "Découvrez notre nouvelle coll..."; [page 7, Table 1, row 3, column 2] "Livraison gratuite"
```

| Line | What it means | What to do |
|---|---|---|
| **Translated paragraphs** | Paragraphs written successfully. | Nothing. |
| **Not translated** | The XLIFF had no target for these paragraphs. The source text was kept. | Check with the translator, or translate manually. |
| **Object placeholders missing or moved** | An object tag (inline image, page number, footnote reference…) was deleted or reordered in the translation, so the paragraph was left in the source language to avoid losing the object. | Translate the paragraph manually, or have the translator restore the tags. |
| **Skipped, text changed since export** | The text in the document no longer matches the exported source, so the translation was not written to avoid mismatches. | Translate these places manually, or re-export and send the changes again. |
| **Not found** | A story with this ID no longer exists, or a table or footnote was removed. Or you opened a different document. | Make sure you opened the original source document. |
| **Duplicate IDs** | A frame was copied after export, so two stories share an ID. Only the first receives the translation. | Translate the copy manually. |
| **OVERSET TEXT** | The translated text doesn't fit its frames or table cell. | Enlarge the frame, adjust the layout or shorten the translation. **Window › Output › Preflight** also lists overset text. |

## Do's and don'ts

**Do**

- Export from the final, approved source document.
- Keep the source document (saved with IDs) until all languages are imported.
- Review every translated copy: line breaks, hyphenation and overset text always need a designer's eye.
- Set the language of the paragraph styles in each copy (or use a language-specific style set) so InDesign hyphenates and spell-checks correctly. The import keeps the source document's language settings.
- Re-run the export after larger source changes. Existing IDs are kept, so translation memory matches still work.

**Don't**

- Edit, add or delete text in the source between export and import.
- Run the import on a translated copy. Always import into the source.
- Rename or delete the `_p0`, `_p1` … trans-unit IDs in the XLIFF.
- Delete or reorder `x-indesign-object` tags.

## FAQ

**Does the export change my document?**
It adds an invisible label to each exported story and saves the document. Nothing visible changes.

**Are paragraph styles kept?**
Yes. The import only replaces the text inside each paragraph, never the paragraph marks, so paragraph styles and their overrides stay as they were. Character formatting is reapplied per formatted run.

**What about Track Changes?**
Track Changes is paused for each story while the translation is written, so the translated copy doesn't fill up with tracked edits, and is switched back on afterwards.

**Can I export several documents or a whole book at once?**
Not yet. Run the export per document.

**Are fonts changed for languages with special characters?**
No. The import keeps the original font. If a font lacks glyphs for a language (for example Polish or Czech characters), InDesign shows pink missing-glyph highlights, so check those copies carefully.

**Right-to-left languages (Arabic, Hebrew)?**
Text is written in correctly, but proper display needs the World-Ready composer and right-to-left paragraph direction. Expect manual layout work.

**What if the translator returns XLIFF 2.0?**
Only XLIFF 1.2 is supported. Most tools can export 1.2 if you set the format when you create the project.
