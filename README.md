# Adobe InDesign Translation

Round-trip translation for Adobe InDesign documents, by [Supertext](https://www.supertext.com).

Export all text from an `.indd` document to **XLIFF 1.2**, translate it in any CAT tool or TMS (memoQ, Trados, Phrase, …), and import the translations back into the **same stories, table cells and footnotes with their formatting intact**: one translated copy of the document per language.

```
Brochure.indd ──► Translation Export ──► Brochure_fr-CH.xlf ──► CAT tool / TMS
                                         Brochure_it-CH.xlf          │
                                                                     ▼
Brochure_fr-CH.indd ◄── Translation Import ◄── translated .xlf files
Brochure_it-CH.indd
```

The XLIFF format matches [Adobe Illustrator Translation](https://github.com/Supertext/Adobe-Illustrator-Translation) and [CorelDRAW Supertext Translation](https://github.com/Supertext/CorelDRAW-Supertext-Translation), so one translation workflow covers all three applications.

> **Status: 1.0.0, untested in InDesign.** The scripts are syntax-checked and their core logic passes a mock-based test, but they have not yet been run against real documents. Run the [test checklist](docs/developer-guide.md#test-checklist) on a sample file before using this in production.

## Features

- **Stable story IDs.** Each story gets a hidden ID stored inside the `.indd` file, so translations land in the right place even if frames are moved or rethreaded.
- **Everything that holds text.** Stories (including threaded frames, text on paths and parent pages), table cells and footnotes.
- **Formatting preserved.** One translation unit per paragraph. Paragraph styles are never touched. A bold word, a character style or a colour change inside a paragraph becomes an XLIFF `<g>` tag and is restored on import.
- **Objects stay in place.** Anchored frames, inline graphics, page numbers, footnote references, tables and markers become protected `<x>` placeholders. Forced line breaks and tabs become `<x>` tags that translators may move.
- **Context for translators.** Every group carries a `<note>` with its page, layer, paragraph style, font and size, and flags fixed-size frames ("watch the length").
- **Safe import.** The original stays untouched. Stories edited after export are skipped and reported. Untranslated paragraphs keep the source text. Locked layers and Track Changes are handled automatically. Each import is a single undo step.
- **Overset check.** After import, every story or cell whose translated text no longer fits is listed with its page.

## Quick start

1. Copy the two scripts from [`scripts/`](scripts) into InDesign's Scripts Panel folder ([installation guide](docs/installation-guide.md)).
2. Open your document. In **Window › Utilities › Scripts**, double-click **Translation Export**. Enter the source and target languages.
3. Translate the `.xlf` files.
4. Open the original document again and double-click **Translation Import**. Select the translated `.xlf` files.

## Documentation

| Guide | For |
|---|---|
| [Installation guide](docs/installation-guide.md) | Installing, updating and removing the scripts on Windows and macOS |
| [User guide](docs/user-guide.md) | Designers, project managers and translators running the workflow |
| [Developer guide](docs/developer-guide.md) | Architecture, XLIFF format, testing and releasing |

## Repository layout

```
scripts/
  Translation Export.jsx     export to XLIFF (round trip, part 1)
  Translation Import.jsx     import translated XLIFF (round trip, part 2)
tests/
  logic-test.js              tests the core logic against a mock text model (Node.js)
docs/
  installation-guide.md
  user-guide.md
  developer-guide.md
CHANGELOG.md
```

## Requirements

Adobe InDesign CC 2019 or later on Windows or macOS. No plugins, extensions or Adobe developer account required.
