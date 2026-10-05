# Installation guide

The round trip consists of two InDesign scripts. Installing means copying two files into InDesign's Scripts Panel folder. No administrator rights, plugins or restarts are needed.

- [1. Download](#1-download)
- [2. Copy into the Scripts Panel folder](#2-copy-into-the-scripts-panel-folder)
- [3. Verify](#3-verify)
- [No-install option](#no-install-option)
- [Optional: keyboard shortcuts](#optional-keyboard-shortcuts)
- [Updating](#updating)
- [Uninstalling](#uninstalling)
- [Troubleshooting](#troubleshooting)

## 1. Download

Download the latest release from the [Releases page](https://github.com/Supertext/Adobe-InDesign-Translation/releases), or clone the repository. You need these two files from the `scripts/` folder:

- `Translation Export.jsx`
- `Translation Import.jsx`

Always install both together.

## 2. Copy into the Scripts Panel folder

**The easy way (works for every version and language):**

1. In InDesign, open **Window › Utilities › Scripts**.
2. Right-click the **User** folder and choose **Reveal in Explorer** (Windows) or **Reveal in Finder** (macOS).
3. Open the **Scripts Panel** folder that appears and copy both `.jsx` files into it.

**The paths, if you prefer to go there directly:**

Replace `21.0` with your InDesign version number (InDesign 2024 = `19.0`, 2025 = `20.0`, 2026 = `21.0`) and `en_US` with your InDesign language (for example `de_DE`, `fr_FR`).

**Windows**

```
%APPDATA%\Adobe\InDesign\Version 21.0\en_US\Scripts\Scripts Panel\
```

**macOS**

```
~/Library/Preferences/Adobe InDesign/Version 21.0/en_US/Scripts/Scripts Panel/
```

On macOS the `Library` folder is hidden. In Finder, choose **Go › Go to Folder…** (Shift+Cmd+G) and paste the path.

### Rolling out to many machines (Windows)

```powershell
$version = "21.0"; $locale = "en_US"
$dest = "$env:APPDATA\Adobe\InDesign\Version $version\$locale\Scripts\Scripts Panel"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item ".\scripts\Translation Export.jsx", ".\scripts\Translation Import.jsx" -Destination $dest -Force
```

Run as the user (no elevation needed) from the repository folder, or deploy the same copy step through Intune or your software distribution tool. For an all-users install, use `C:\Program Files\Adobe\Adobe InDesign 2026\Scripts\Scripts Panel\` instead, which needs administrator rights.

## 3. Verify

The Scripts panel picks up new files immediately. In **Window › Utilities › Scripts**, expand **User**. You should see:

- **Translation Export.jsx**
- **Translation Import.jsx**

Double-click a script to run it. If they don't appear, see [Troubleshooting](#troubleshooting).

## No-install option

Unlike Illustrator, InDesign has no "run any script file" menu, but the user Scripts Panel folder never needs administrator rights, so installing is usually the quickest route. Developers can also run a working copy straight from Visual Studio Code with the ExtendScript Debugger (see the [developer guide](developer-guide.md#development-setup)).

## Optional: keyboard shortcuts

InDesign can assign shortcuts to scripts directly:

1. Choose **Edit › Keyboard Shortcuts…**
2. Set **Product Area** to **Scripts**.
3. Select **Translation Export.jsx**, click into **New Shortcut**, press the key combination and click **Assign**.
4. Repeat for the import, then click **OK**. You may need to create a new shortcut set first, because the default set is read-only.

## Updating

Overwrite the two `.jsx` files with the new versions. No restart is needed. Check [CHANGELOG.md](../CHANGELOG.md) first: always update **both** scripts together, because they share the ID and formatting logic.

Text IDs already stored in documents stay valid across updates.

## Uninstalling

Delete the two `.jsx` files from the Scripts Panel folder.

The hidden IDs remain in documents that were exported. They are invisible, don't affect printing or PDF export, and can be ignored. See the [developer guide](developer-guide.md#story-ids) if you need to remove them.

## Troubleshooting

| Problem | Fix |
|---|---|
| Scripts don't appear in the panel | Make sure you copied them into the **Scripts Panel** subfolder, not into `Scripts` itself. Use **Reveal in Explorer/Finder** on the User folder to find the right place. |
| Two InDesign versions installed | Each version has its own folder (`Version 20.0`, `Version 21.0`, …). Install into each one you use. |
| "Unsupported scripting language" or nothing happens | Make sure the file ends in `.jsx` and wasn't saved as `.jsx.txt` by your browser or editor. |
| Error mentioning a line number | Note the message and line number and report it in the repository's issues, with the InDesign version. |
| macOS: "Library" folder missing | It's hidden. Use **Go › Go to Folder…** in Finder, or the Reveal in Finder method above. |
