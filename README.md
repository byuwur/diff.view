# DIFF.view

Compare two strings in a unified or side-by-side view, with line numbers and exact source copying.

![DIFF.view preview](prev.jpg)

## Index

1. [Quick start](#quick-start)
2. [Try it](#try-it)
3. [Downloads](#downloads)
4. [API and options](#api-and-options)
5. [Themes](#themes)
6. [Checks and releases](#checks-and-releases)
7. [Related projects](#related-projects)
8. [License](#license)

## Quick start

```html
<link href="https://cdn.jsdelivr.net/gh/byuwur/diff.view@latest/diff.min.css" rel="stylesheet" />
<script src="https://cdn.jsdelivr.net/gh/byuwur/diff.view@latest/diff.min.js" defer></script>
<div id="viewer" data-theme="light"></div>
<script>
  document.addEventListener("DOMContentLoaded", () => {
    byDIFFviewer(document.getElementById("viewer"), "before\n", "after\n", { view: "split" });
  });
</script>
```

Pin a published tag in place of `@latest` for a fixed version.

### Offline use and Content Security Policy

The renderer loads no remote scripts, fonts, or styles. Local library files work without a CDN, including in a `file://` host. Host optional `diff.themes.css` locally for extra palettes. The online playground and exported CDN starter still require internet access; a local starter requires all referenced files beside it. Playground fetches and clipboard permissions remain subject to browser restrictions.

Allow the script and style origins in your CSP. Authorize inline initialization and custom theme CSS separately, or move them into local files. The controls use static HTML templates and do not support enforced Trusted Types.

## Try it

[Playground](https://diff.byuwur.co/)

Open [index.html](index.html) locally. Its host assets use the network. Exported starters use the default settings. The playground accepts local files up to 6 MiB.

## Downloads

[ZIP](https://github.com/byuwur/diff.view/releases/latest/download/diff.view.zip) · [Minified ZIP](https://github.com/byuwur/diff.view/releases/latest/download/diff.view.minified.zip)

## API and options

1. [API and comparison contract](#api-and-comparison-contract)
2. [Diff options and limits](#diff-options-and-limits)
3. [Shared controls and lifecycle](#shared-controls-and-lifecycle)

### API and comparison contract

`byDIFFviewer(element, oldText, newText, options?)` requires two strings. Invalid types/target throw `TypeError`. Comparison errors are displayed, and `ready` resolves false.

The main Copy button copies the exact new input; Copy old copies the exact old input. Display line endings normalize CR/LF/CRLF to LF; copying keeps the originals.

`byDIFFviewer.diff(oldText, newText, options?)` synchronously returns an array of `{ type, oldLine, newLine, oldText, newText }`. Types are `equal`, `delete`, and `insert`. Line numbers start at 1; an absent side is null. Text includes its normalized line terminator where present. Concatenating non-null `oldText` or `newText` reconstructs the corresponding normalized input. Equal lines may contain different text when whitespace is ignored or only their newline terminators differ. A trailing newline adds an empty final line. Invalid input throws `TypeError`/`RangeError`.

The engine uses Myers' shortest edit script. Shifted and repeated lines are compared as sequences. Line text is compared separately from its terminator, so adding or removing a final newline changes the empty final line instead of replacing unchanged text. Whitespace options apply to line text. Empty input has zero lines.

Intraline/word diff, file parsing, and patch application are unsupported.

### Diff options and limits

| Option             | Default   | Behavior                                                                                                                                                          |
| ------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `view`             | `"split"` | `"unified"` or `"split"`; invalid values use `"split"`.                                                                                                           |
| `lineNumbers`      | `true`    | Show old/new line numbers.                                                                                                                                        |
| `ignoreWhitespace` | none      | `"trim"` ignores leading/trailing whitespace per line; `"all"` ignores whitespace within lines too. Other values compare exactly. Original line text is retained. |
| `batchSize`        | `500`     | Initial/per Load more displayed row count, integer 1-2000; invalid values use 500.                                                                                |

Each input is limited to 2 million characters and 20,000 lines, including the empty final line when present. After matching prefixes/suffixes are trimmed, the changed region allows at most 1,000 edits and 4 million comparison operations. Empty-sided regions are handled directly. Exceeding a limit displays an error; compare smaller sections for large rewrites.

Trace memory grows quadratically with edit distance within these limits. The viewer yields during comparison and mounts one batch initially; `.diff()`, line splitting, prefix trimming, and individual search steps are synchronous.

Use `--by-diff-add` and `--by-diff-remove` on `.byDIFFdocument` to customize change colors alongside the shared variables below.

### Shared controls and lifecycle

| Option             | Default     | Behavior                                                                                                                                                   |
| ------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `animations`       | `true`      | Brief control/disclosure motion and background fades; overrides the system motion preference.                                                              |
| `appearAnimation`  | `false`     | Fade the viewer in on each render when `animations` is enabled. Initial rendering remains immediate by default.                                            |
| `toolbar`          | `true`      | Show the viewer header; secondary tools are configured separately.                                                                                         |
| `credits`          | `true`      | Show attribution in the header.                                                                                                                            |
| `displayContainer` | `true`      | Show the content panel frame and inner horizontal padding. `false` also hides status information.                                                          |
| `statusBar`        | `true`      | Show counts and metadata when `displayContainer` is true. With `statusBar: false`, loading and empty results remain visible; errors always remain visible. |
| `viewSelect`       | `false`     | Show segmented Unified / Side by side buttons.                                                                                                             |
| `copyOldButton`    | `false`     | Show a separate button to copy the old source.                                                                                                             |
| `loadMore`         | `true`      | Load differences in batches; false displays every line.                                                                                                    |
| `theme`            | Container   | Initial `"light"` or `"dark"` mode class.                                                                                                                  |
| `palette`          | Container   | Initial `data-theme` palette, including custom CSS names.                                                                                                  |
| `fontSize`         | Container   | Number in rem or a CSS size such as `"1.25em"` or `"20px"`; bounded to `0.5rem`-`3rem`.                                                                    |
| `themeToggle`      | `true`      | Show the theme toggle.                                                                                                                                     |
| `fontSizeControls` | `true`      | Show text-size controls.                                                                                                                                   |
| `copyButton`       | `true`      | Show full source copy button.                                                                                                                              |
| `controlsSize`     | `"regular"` | `"xs"` (0.5rem), `"small"` (0.7rem), `"regular"` (0.875rem), `"large"` (1rem), or `"xl"` (1.25rem); invalid values use `"regular"`.                        |
| `controlsCompact`  | `true`      | Keep credits beside controls; `false` stacks them. Wraps as needed.                                                                                        |
| `controlsPosition` | `"top"`     | Sticky `"top"` or `"bottom"` toolbar; invalid values use `"top"`.                                                                                          |

The controller exposes `ready` and `destroy()`. `ready` resolves `true` after initial rendering, or `false` on a displayed data error or cancellation. Invalid targets/options can throw synchronously.

`ready` describes the initial render only; it does not track later view changes or Load more actions.

```javascript
const viewer = byDIFFviewer(target, before, after, { view: "split" });
const rendered = await viewer.ready; // false on data errors or cancellation.
viewer.destroy(); // Call when the host panel is removed.
```

Re-rendering disposes the previous instance. `destroy()` cancels pending work and clears the target only if the instance still owns it. Duplicate script loads preserve the API. Read its version with `byDIFFviewer.VERSION`.

Input is displayed as text, never executed. Style `.byDIFFdocument` with `--by-view-bg`, `--by-view-text`, `--by-view-muted`, `--by-view-border`, `--by-view-accent`, `--by-view-alt`, `--by-view-string`, and `--by-view-literal`. The container uses system-ui; source/tree content uses monospace. Override the class or target's inline font/size as needed.

In split view, adjacent removed and added lines share rows. Unmatched lines have an empty cell opposite them. Batches count displayed rows so replacements stay together.

Copy requires clipboard permission in a secure context.

Requires a modern browser with async functions, WeakMap, ES2022 array methods, and CSS variables. The browser suites can run in Chromium, Firefox, and WebKit (see Checks).

`--by-view-content-font` and `--by-view-line-height` set source/tree typography.

The playground disables header-only settings while Viewer header is off, preserving their values. Appearing animation is disabled while Animations is off.

Use `toolbar: false` to hide the header, or disable `credits`, `themeToggle`, `fontSizeControls`, and `copyButton` individually. Content actions such as search and format-specific buttons use their own options.

Controls use monospace by default; override `--by-view-controls-font` to change it.

## Themes

Use `theme` for light or dark mode and `palette` for the color scheme. Monokai, GitHub, Solarized and High Contrast are built in. Load [diff.themes.css](diff.themes.css) after the base stylesheet for the other palettes.

Options override container settings. Omit an option or pass `null` to keep its current value. Numeric `fontSize` uses rem. CSS sizes such as `20px` also work within the `0.5rem` to `3rem` range. Invalid appearance values throw `RangeError` before replacing the document.

```html
<div id="viewer" class="dark" data-theme="github"></div>
```

Use **Copy CSS** in the playground to export appearance settings. Set `--by-view-document-bg` for the outer background and `--by-view-container-bg` for panels and controls. Define custom palette variables on the component’s mode class and `[data-theme]` selector. For example:

```css
.byDIFFdocument.dark[data-theme="my-ocean"] {
  --by-view-bg: #102a43;
  --by-view-text: #f0f6fc;
}
```

### Palette names

`monokai`, `github`, `solarized`, `high-contrast`, `dracula`, `darcula`, `nord`, `catppuccin`, `catppuccin-frappe`, `catppuccin-macchiato`, `rose-pine`, `rose-pine-moon`, `gruvbox`, `gruvbox-material`, `tokyo-night`, `tokyo-storm`, `tokyo-moon`, `one`, `material`, `material-ocean`, `night-owl`, `synthwave`, `ayu`, `everforest`, `kanagawa`, `selenized`, `vscode`, `monokai-dimmed`, `discord`, `slack`, `bonyur`, `sakura`, `bubblegum`, `candy`, `rose-gold`, `lavender`, `cyberpunk`, `sunset`, `volcano`, `amber`, `terminal`, `paper`, `ink`, `ocean`, `forest`, `mint`, `ice`, `sepia`.

High Contrast text colors target at least [7:1 contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced.html), with [3:1 contrast for control boundaries and focus cues](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). Check contrast again when you override colors.

Legacy integrations can use `#byVIEWtheme` or a detected `diff.light.css` / `diff.dark.css` link. The toggle keeps its path, query, and hash and updates viewers sharing the link. Explicit container themes stay independent. Separate theme files are no longer shipped; retain your hosted legacy files to use this alternative.

## Checks and releases

Use Node.js 22+ and run these commands from the repository root. For playground checks, place sibling checkouts of `spa.js` at `v20.16`, `code.view` at `v2` next to this repository.

```sh
npm --prefix .github ci --ignore-scripts --no-audit --no-fund
node .github/node_modules/playwright/cli.js install chromium
export NODE_PATH="$PWD/.github/node_modules"
node --test --test-concurrency=1 __tests__/rendering.cjs __tests__/playground.cjs
node .github/scripts/build.mjs --tag v0.0.0-local
npm --prefix .github run release:test
```

In PowerShell, replace the `export` line with `$env:NODE_PATH = "$PWD/.github/node_modules"`. [CI](.github/workflows/rendering.yml) runs Chromium automatically; choose Firefox or WebKit on a manual run.

The [release workflow](.github/workflows/release.yml) tests the regular and minified ZIPs. Both contain the runtime files, README and license. The build manifest records the version and source commit. The local build writes `dist/assets/` and `dist/RELEASE_NOTES.md`. Use `--offline` for local minification. Publish by pushing a version tag matching the library’s `VERSION` (for example, `v2` for version 2).

## Related projects

[CODE.view](https://github.com/byuwur/code.view) · [CSV.view](https://github.com/byuwur/csv.view) · [JSON.view](https://github.com/byuwur/json.view) · [LOG.view](https://github.com/byuwur/log.view) · [MD.edit](https://github.com/byuwur/md.edit) · [MD.view](https://github.com/byuwur/md.view) · [XML.view](https://github.com/byuwur/xml.view) · [YAML.view](https://github.com/byuwur/yaml.view)

## License

MIT (c) 2026 Andres Trujillo [Mateus] byUwUr. See [LICENSE](LICENSE.md).
