"use strict";
/*
 * File: diff.js
 * Desc: Standalone DIFF.view. No runtime dependencies.
 * Copyright (c) 2026 Andres Trujillo [Mateus] byUwUr
 * https://github.com/byuwur/diff.view
 * MIT License (see LICENSE).
 */
(function (global) {
  // ===== INITIALIZATION =====
  if (global.byDIFFviewer?.initialized) return;

  // ===== METADATA =====
  byDIFFviewer.VERSION = "2.5"; // 2026-11-26
  // Mirrored helpers are checked by code.view/.github/scripts/check-family.mjs.
  const componentName = "DIFF.view";
  const themeFile = "diff";
  const documentClass = "byDIFFdocument";
  const contentSelector = ":scope > .byVIEWcontent";

  // ===== STATE =====
  const instances = new WeakMap();
  let nextViewId = 0;
  let graphemeSegmenter;
  // ===== HELPERS =====
  const node = (tag, className = "", text) => {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = String(text);
    return element;
  };
  const button = (parent, text, label, action) => {
    const control = node("button", "", text);
    control.type = "button";
    control.title = label;
    control.setAttribute("aria-label", label);
    control.addEventListener("click", action);
    parent.appendChild(control);
    return control;
  };
  // Yield at a chunk boundary so input events and replacement renders can run.
  const pause = () => new Promise((resolve) => setTimeout(resolve, 0));
  const positive = (value, fallback, maximum) => (Number.isInteger(value) && value > 0 ? Math.min(value, maximum) : fallback);
  // ===== APPEARANCE =====
  const extraPalettes = new Set([
    "dracula",
    "darcula",
    "nord",
    "catppuccin",
    "catppuccin-frappe",
    "catppuccin-macchiato",
    "rose-pine",
    "rose-pine-moon",
    "gruvbox",
    "gruvbox-material",
    "tokyo-night",
    "tokyo-storm",
    "tokyo-moon",
    "one",
    "material",
    "material-ocean",
    "night-owl",
    "synthwave",
    "ayu",
    "everforest",
    "kanagawa",
    "selenized",
    "vscode",
    "monokai-dimmed",
    "discord",
    "slack",
    "bonyur",
    "sakura",
    "bubblegum",
    "candy",
    "rose-gold",
    "lavender",
    "cyberpunk",
    "sunset",
    "volcano",
    "amber",
    "terminal",
    "paper",
    "ink",
    "ocean",
    "forest",
    "mint",
    "ice",
    "sepia"
  ]);
  const warnedPalettes = new Set();
  const warnMissingThemes = (element, palette = element.dataset.theme) => {
    if (!extraPalettes.has(palette) || warnedPalettes.has(palette)) return;
    const document = element.ownerDocument;
    if (document.defaultView.getComputedStyle(document.documentElement).getPropertyValue(`--by-${themeFile}-themes-loaded`).trim() === "1") return;
    warnedPalettes.add(palette);
    console.warn(`${componentName}: Palette "${palette}" requires ${themeFile}.themes.css. Import it after ${themeFile}.css. https://${themeFile}.byuwur.co/`);
  };

  const getLocalTheme = (target) => {
    if (["light", "dark"].includes(target.dataset.theme)) return target.dataset.theme;
    if (target.classList.contains("dark")) return "dark";
    if (target.classList.contains("light")) return "light";
    return target.dataset.theme ? "light" : null;
  };

  const setLocalTheme = (element, mode, palette) => {
    element.classList.toggle("light", mode === "light");
    element.classList.toggle("dark", mode === "dark");
    if (palette != null) element.dataset.theme = palette;
    else if (["light", "dark"].includes(element.dataset.theme)) element.dataset.theme = mode;
  };

  // Explicit appearance options override markup; omitted values preserve the container's state.
  const applyAppearance = (element, options) => {
    const { theme, palette, fontSize } = options;
    if (theme != null && !["light", "dark"].includes(theme)) throw new RangeError("Theme must be light or dark.");
    if (palette != null && (typeof palette !== "string" || !/^[a-z][\w-]*$/i.test(palette) || ["light", "dark"].includes(palette))) throw new RangeError("Palette must be a CSS theme name; use theme for light or dark.");
    warnMissingThemes(element, palette ?? element.dataset.theme);
    const size = typeof fontSize === "number" ? `${Math.max(0.5, Math.min(3, fontSize))}rem` : typeof fontSize === "string" ? `clamp(0.5rem, ${fontSize}, 3rem)` : "";
    if (fontSize != null && (typeof fontSize === "number" ? !Number.isFinite(fontSize) : typeof fontSize !== "string" || !CSS.supports("font-size", size))) throw new RangeError("Font size must be a finite multiplier or a CSS size.");
    // Keep palette identity in data-theme while light/dark classes select its mode.
    if (theme != null || palette != null) setLocalTheme(element, theme ?? getLocalTheme(element) ?? "light", palette);
    return size;
  };

  const applyContentAppearance = (element, options, content) => {
    const size = applyAppearance(element, options);
    const previous = element.querySelector(contentSelector);
    content.style.fontSize = size || previous?.style.fontSize || "";
    content.dataset.byViewDefaultFontSize = size || previous?.dataset.byViewDefaultFontSize || "";
  };

  const syncMotion = (element, { animations = true, appearAnimation = false }) => {
    const appear = animations && appearAnimation;
    element.classList.toggle("byVIEWmotion", animations);
    element.classList.toggle("byVIEWappear", appear);
    return appear;
  };

  // ===== CONTROLS =====
  // Mirrored across the family so each viewer can run without a shared runtime.
  const createThemeButton = () => {
    const button = node("button", "byVIEWthemeToggle");
    button.type = "button";
    button.innerHTML = /* HTML */ ` <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M21 12.8A9 9 0 0 1 11.2 3 9 9 0 1 0 21 12.8Z" />
      </svg>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4" />
      </svg>`;
    return button;
  };

  /**
   * Create the theme toggle, retaining legacy stylesheet links as a fallback.
   * @param {HTMLElement} element Viewer container and theme owner.
   * @returns {{button: HTMLButtonElement, sync: Function}} Theme control and label update.
   */
  const createThemeToggle = (element) => {
    const themePattern = new RegExp(`^([^?#]*/)?${themeFile}\\.(light|dark)\\.css([?#].*)?$`, "i");
    const stylesheet = [document.getElementById("byVIEWtheme"), ...document.querySelectorAll('link[rel~="stylesheet"]')].find((link) => link && themePattern.test(link.getAttribute("href") || ""));
    const legacyTheme = () => (stylesheet?.isConnected ? (stylesheet.getAttribute("href") || "").match(themePattern) : null);
    const getTheme = () => getLocalTheme(element) || legacyTheme()?.[2].toLowerCase() || "light";
    const button = createThemeButton();
    const sync = () => {
      const next = getTheme() === "dark" ? "light" : "dark";
      const toggles = !getLocalTheme(element) && legacyTheme() ? [button, ...document.querySelectorAll(`.${documentClass} > .byVIEWtoolbar > .byVIEWcontrols > .byVIEWthemeToggle`)] : [button];
      for (const toggle of toggles) {
        // A legacy link must not change the controls of independently themed viewers.
        if (toggle !== button && getLocalTheme(toggle.closest(`.${documentClass}`))) continue;
        toggle.title = `Switch to ${next} theme`;
        toggle.setAttribute("aria-label", toggle.title);
      }
    };
    button.addEventListener("click", () => {
      const next = getTheme() === "dark" ? "light" : "dark";
      if (!getLocalTheme(element) && legacyTheme()) {
        const href = stylesheet.getAttribute("href");
        stylesheet.setAttribute(
          "href",
          href.replace(themePattern, (_, path = "", theme, suffix = "") => `${path}${themeFile}.${next}.css${suffix}`)
        );
      } else {
        // Preserve attribute-only themes and keep existing mode classes in sync.
        const palette = element.dataset.theme;
        if (!element.matches(".light, .dark") && (!palette || ["light", "dark"].includes(palette))) element.dataset.theme = next;
        else setLocalTheme(element, next, palette === "" ? next : undefined);
      }
      sync();
    });
    button.addEventListener("focus", sync);
    button.addEventListener("pointerenter", sync);
    sync();
    return { button, sync };
  };

  /**
   * Create text size controls for a renderer.
   * @param {HTMLElement} element - Renderer whose font size is changed.
   * @return {{group: HTMLElement, sync: Function}} Size controls and button state update.
   */
  const createFontSizeControls = (element) => {
    const sizes = document.createElement("div");
    sizes.className = "byVIEWfontSizes";
    const getSize = () => (parseFloat(getComputedStyle(element).fontSize) || 16) / (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
    const decrease = document.createElement("button");
    const increase = document.createElement("button");
    const reset = document.createElement("button");
    reset.textContent = "A";
    decrease.textContent = "A-";
    increase.textContent = "A+";
    for (const [button, title] of [
      [decrease, "Decrease text size"],
      [reset, "Reset text size"],
      [increase, "Increase text size"]
    ]) {
      button.type = "button";
      button.className = "byVIEWfontSize";
      button.title = title;
      button.setAttribute("aria-label", title);
      sizes.appendChild(button);
    }
    const sync = () => {
      const size = getSize();
      decrease.disabled = size <= 0.5;
      increase.disabled = size >= 3;
    };
    for (const [button, step] of [
      [decrease, -0.125],
      [increase, 0.125]
    ]) {
      button.addEventListener("click", () => {
        const size = Math.max(0.5, Math.min(3, getSize() + step));
        element.style.fontSize = `${size}rem`;
        sync();
      });
    }
    reset.addEventListener("click", () => {
      element.style.fontSize = element.dataset.byViewDefaultFontSize;
      sync();
    });
    sync();
    return { group: sizes, sync };
  };

  const sideLabel = (value, fallback) => (typeof value === "string" && value.trim()) || fallback;
  const copyTitle = (button) => `Copy ${button.dataset.newLabel} (Shift+click for Copy ${button.dataset.oldLabel})`;
  let copyShiftPressed = false;

  const showCopyAction = (button, active) => {
    const label = copyShiftPressed ? button.dataset.oldLabel : button.dataset.newLabel;
    const caption = active ? `Copy ${label}` : "Copy";
    delete button.dataset.state;
    // WebKit cancels a pointer click if focus replaces the pressed text node.
    const text = button.lastElementChild.firstChild;
    if (text.data !== caption) text.data = caption;
    button.lastElementChild.dataset.action = caption;
    button.title = copyTitle(button);
    button.setAttribute("aria-label", active && copyShiftPressed ? caption : button.title);
  };

  const syncCopyShift = (event) => {
    if (event.type !== "blur" && event.key !== "Shift") return;
    const pressed = !!event.shiftKey;
    if (pressed === copyShiftPressed) return;
    copyShiftPressed = pressed;
    for (const button of document.querySelectorAll(`.${documentClass} > .byVIEWtoolbar .byVIEWcopy:is(:hover, :focus-visible)`)) showCopyAction(button, true);
  };

  // A hovered preview can receive pointer events while its host page still has keyboard focus.
  const listenForCopyShift = (event) => {
    const method = event?.type === "pagehide" ? "removeEventListener" : "addEventListener";
    for (let frame = window; frame; frame = frame.frameElement?.ownerDocument.defaultView) {
      frame[method]("keydown", syncCopyShift, true);
      frame[method]("keyup", syncCopyShift, true);
      frame[method]("blur", syncCopyShift);
    }
  };

  const createCopyButton = (getText) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "byVIEWcopy";
    button.innerHTML = /* HTML */ `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true" focusable="false">
      <!--!Font Awesome Free 7.3.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.-->
      <path
        d="M288 64C252.7 64 224 92.7 224 128L224 384C224 419.3 252.7 448 288 448L480 448C515.3 448 544 419.3 544 384L544 183.4C544 166 536.9 149.3 524.3 137.2L466.6 81.8C454.7 70.4 438.8 64 422.3 64L288 64zM160 192C124.7 192 96 220.7 96 256L96 512C96 547.3 124.7 576 160 576L352 576C387.3 576 416 547.3 416 512L416 496L352 496L352 512L160 512L160 256L176 256L176 192L160 192z" />
    </svg>`;
    const caption = node("span", "", "Copy");
    caption.setAttribute("aria-live", "polite");
    button.appendChild(caption);
    listenForCopyShift();
    window.addEventListener("pagehide", listenForCopyShift);
    window.addEventListener("pageshow", listenForCopyShift);
    button.addEventListener("pointerenter", (event) => {
      copyShiftPressed = event.shiftKey;
      showCopyAction(button, true);
    });
    button.addEventListener("focus", () => showCopyAction(button, true));
    const reset = (event) => {
      if (button.dataset.state !== "error") showCopyAction(button, button.matches(event.type === "pointerleave" ? ":focus-visible" : ":hover"));
    };
    button.addEventListener("pointerleave", reset);
    button.addEventListener("blur", reset);
    button.addEventListener("click", async (event) => {
      button.disabled = true;
      let message = "Copied!";
      try {
        await navigator.clipboard.writeText(getText(event.shiftKey || (event.detail === 0 && copyShiftPressed)));
        caption.textContent = message;
        button.dataset.state = "success";
      } catch {
        caption.textContent = "Failed";
        button.dataset.state = "error";
        message = "Copy failed. Check clipboard access.";
      } finally {
        button.disabled = false;
        button.title = `${message} ${copyTitle(button)}`;
        button.setAttribute("aria-label", button.title);
      }
    });
    return button;
  };

  // Keep the toolbar mounted while the current renderer applies option changes.
  const mountControls = (element, content, initialOptions, getText, version) => {
    const toolbar = node("div", "byVIEWtoolbar");
    const controls = node("div", "byVIEWcontrols");
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Viewer controls");
    const info = node("small", "byVIEWinfo");
    for (const [text, href] of [
      [componentName, `https://github.com/byuwur/${themeFile}.view`],
      ["@byUwUr", "https://byuwur.co"]
    ]) {
      const link = node("a", "", text);
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      if (info.childNodes.length) info.append(` · v${version} · `);
      info.appendChild(link);
    }
    let theme, sizes, copy;
    const update = (options, changes = {}) => {
      const rebuild = ["toolbar", "credits", "themeToggle", "fontSizeControls", "copyButton"].some((key) => key in changes && changes[key] !== options[key]);
      if ("fontSize" in changes || "theme" in changes || "palette" in changes) {
        applyContentAppearance(element, changes, content);
        theme?.sync();
        sizes?.sync();
      }
      Object.assign(options, changes);
      options.oldLabel = sideLabel(options.oldLabel, "Old");
      options.newLabel = sideLabel(options.newLabel, "New");
      const { toolbar: showToolbar = true, credits = true, themeToggle = true, fontSizeControls = true, copyButton = true, controlsCompact = true, controlsPosition, controlsSize } = options;
      if ("animations" in changes || "appearAnimation" in changes) syncMotion(element, options);
      element.classList.toggle("byVIEWcompact", controlsCompact);
      const bottom = controlsPosition === "bottom";
      toolbar.dataset.size = ["xs", "small", "regular", "large", "xl"].includes(controlsSize) ? controlsSize : "regular";
      if (showToolbar && (!toolbar.childElementCount || rebuild)) {
        controls.replaceChildren();
        if (themeToggle) {
          theme ??= createThemeToggle(element);
          controls.appendChild(theme.button);
        }
        if (fontSizeControls) {
          sizes ??= createFontSizeControls(content);
          controls.appendChild(sizes.group);
        }
        if (copyButton) {
          copy ??= createCopyButton(getText);
          const slot = node("div", "byVIEWcopySlot");
          slot.appendChild(copy);
          controls.appendChild(slot);
        }
        toolbar.replaceChildren();
        if (credits) toolbar.appendChild(info);
        if (controls.childElementCount) toolbar.appendChild(controls);
      }
      const visible = showToolbar && toolbar.childElementCount > 0;
      element.classList.toggle("byVIEWbottom", visible && bottom);
      if (!visible) toolbar.remove();
      else if (bottom && toolbar !== element.lastElementChild) element.appendChild(toolbar);
      else if (!bottom && toolbar !== element.firstElementChild) element.prepend(toolbar);
      if (copy && (copy.dataset.oldLabel !== options.oldLabel || copy.dataset.newLabel !== options.newLabel)) {
        copy.dataset.oldLabel = options.oldLabel;
        copy.dataset.newLabel = options.newLabel;
        showCopyAction(copy, copy.matches(":hover, :focus-visible"));
      }
    };
    update(initialOptions);
    return update;
  };

  // ===== PARSING =====
  const splitLines = (source) => {
    if (typeof source !== "string") throw new TypeError("Diff inputs must be strings.");
    if (source.length > 2000000) throw new RangeError("Each diff input is limited to 2 million characters.");
    const normalized = source.replace(/\r\n?/g, "\n");
    const lines = normalized.match(/[^\n]*\n|[^\n]+$/g) || [];
    // Keep the final blank line separate from the preceding line's text.
    if (normalized.endsWith("\n")) lines.push("");
    if (lines.length > 20000) throw new RangeError("Each diff input is limited to 20,000 lines.");
    return lines;
  };
  const lineText = (line) => (line.endsWith("\n") ? line.slice(0, -1) : line);
  function* compare(oldSource, newSource, options = {}) {
    const before = splitLines(oldSource),
      after = splitLines(newSource);
    // Comparison keys may ignore whitespace; operation payloads keep both original line texts.
    const key = (line) => {
      const text = lineText(line);
      return options.ignoreWhitespace === "all" ? text.replace(/\s/g, "") : options.ignoreWhitespace === "trim" ? text.trim() : text;
    };
    const a = before.map(key),
      b = after.map(key);
    const operation = (type, x, y) => ({
      type,
      oldLine: x === null ? null : x + 1,
      newLine: y === null ? null : y + 1,
      oldText: x === null ? null : before[x],
      newText: y === null ? null : after[y]
    });
    return yield* compareSequences(a, b, operation, 1000, 4000000);
  }
  // Both line edits and character highlights use the same bounded Myers search.
  function* compareSequences(a, b, operation, maxEdits, maxWork) {
    let prefix = 0,
      suffix = 0;
    // Trim unchanged edges before spending the comparison budget on the changed middle.
    while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
    while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
    const n = a.length - prefix - suffix,
      m = b.length - prefix - suffix;
    const output = [];
    for (let i = 0; i < prefix; i++) output.push(operation("equal", i, i));
    if (!n || !m) {
      for (let i = 0; i < n; i++) output.push(operation("delete", prefix + i, null));
      for (let i = 0; i < m; i++) output.push(operation("insert", null, prefix + i));
    } else {
      // Myers tracks the furthest match on each diagonal; saved frontiers reconstruct the edit path.
      const trace = [],
        frontier = new Map([[1, 0]]);
      let work = 0,
        distance = -1;
      // Bound saved frontiers as well as comparisons so unrelated large inputs fail predictably.
      search: for (let d = 0; d <= Math.min(n + m, maxEdits); d++) {
        trace.push(new Map(frontier));
        for (let k = -d; k <= d; k += 2) {
          let x = k === -d || (k !== d && (frontier.get(k - 1) ?? -1) < (frontier.get(k + 1) ?? -1)) ? (frontier.get(k + 1) ?? 0) : (frontier.get(k - 1) ?? 0) + 1;
          let y = x - k;
          while (x < n && y < m && a[prefix + x] === b[prefix + y]) {
            x++;
            y++;
            work++;
          }
          frontier.set(k, x);
          work++;
          if (work > maxWork) throw new RangeError("Diff exceeded its comparison budget; compare smaller sections.");
          if (x >= n && y >= m) {
            distance = d;
            break search;
          }
        }
        if (d % 20 === 0) yield;
      }
      if (distance < 0) throw new RangeError(`Diff exceeds ${maxEdits.toLocaleString("en-US")} edits in the changed region; compare smaller sections.`);
      let x = n,
        y = m;
      const edits = [];
      for (let d = distance; d >= 0; d--) {
        const previous = trace[d],
          k = x - y;
        const previousK = k === -d || (k !== d && (previous.get(k - 1) ?? -1) < (previous.get(k + 1) ?? -1)) ? k + 1 : k - 1;
        const previousX = previous.get(previousK) ?? 0,
          previousY = previousX - previousK;
        while (x > previousX && y > previousY) {
          edits.push(operation("equal", prefix + x - 1, prefix + y - 1));
          x--;
          y--;
        }
        if (d === 0) break;
        if (x === previousX) {
          edits.push(operation("insert", null, prefix + y - 1));
          y--;
        } else {
          edits.push(operation("delete", prefix + x - 1, null));
          x--;
        }
      }
      // Backtracking discovers edits from the end; restore source order before reattaching the unchanged suffix.
      output.push(...edits.reverse());
    }
    for (let i = suffix; i > 0; i--) output.push(operation("equal", a.length - i, b.length - i));
    return output;
  }

  const finishComparison = (iterator) => {
    let step;
    do {
      step = iterator.next();
    } while (!step.done);
    return step.value;
  };

  // ===== RENDERING =====
  // Keep source offsets so ignored whitespace and multi-unit characters render verbatim.
  const lineCharacters = (text, ignoreWhitespace) => {
    let offset = 0;
    if (ignoreWhitespace === "trim") {
      const trimmed = text.trimStart();
      offset = text.length - trimmed.length;
      text = trimmed.trimEnd();
    }
    let segments = text;
    if (/[^\x00-\x7f]/.test(text) && global.Intl?.Segmenter) {
      graphemeSegmenter ||= new Intl.Segmenter(undefined, { granularity: "grapheme" });
      segments = graphemeSegmenter.segment(text);
    }
    const characters = [],
      offsets = [];
    for (const part of segments) {
      const character = typeof part === "string" ? part : part.segment;
      if (ignoreWhitespace !== "all" || !/^\s+$/u.test(character)) {
        characters.push(character);
        offsets.push(offset);
      }
      offset += character.length;
    }
    return { characters, offsets };
  };

  const changedRanges = (pair, ignoreWhitespace) => {
    const ranges = { delete: [], insert: [] };
    const before = lineText(pair.oldText),
      after = lineText(pair.newText);
    if (Math.max(before.length, after.length) > 4096) return ranges;
    const old = lineCharacters(before, ignoreWhitespace),
      next = lineCharacters(after, ignoreWhitespace);
    let edits;
    try {
      edits = finishComparison(compareSequences(old.characters, next.characters, (type) => type, 64, 16384));
    } catch (error) {
      // Expensive replacements keep their line shading.
      if (error instanceof RangeError) return ranges;
      throw error;
    }
    let x = 0,
      y = 0;
    for (const type of edits) {
      if (type !== "equal") {
        const side = type === "delete" ? old : next;
        const index = type === "delete" ? x : y;
        const start = side.offsets[index],
          end = start + side.characters[index].length;
        const previous = ranges[type].at(-1);
        if (previous?.[1] === start) previous[1] = end;
        else ranges[type].push([start, end]);
      }
      if (type !== "insert") x++;
      if (type !== "delete") y++;
    }
    return ranges;
  };

  const highlightRanges = (span, ranges) => {
    if (!ranges.length) return;
    const text = span.textContent;
    const fragment = document.createDocumentFragment();
    let offset = 0;
    for (const [start, end] of ranges) {
      if (offset < start) fragment.append(text.slice(offset, start));
      fragment.appendChild(node("span", "byDIFFinline", text.slice(start, end)));
      offset = end;
    }
    if (offset < text.length) fragment.append(text.slice(offset));
    span.replaceChildren(fragment);
  };

  // Align replacements within each change block without changing the public edit list.
  const pairChanges = (edits) => {
    const rows = [];
    for (let index = 0; index < edits.length; ) {
      if (edits[index].type === "equal") {
        rows.push(edits[index++]);
        continue;
      }
      const removed = [],
        added = [];
      while (index < edits.length && edits[index].type !== "equal") {
        const edit = edits[index++];
        (edit.type === "delete" ? removed : added).push(edit);
      }
      for (let offset = 0; offset < Math.max(removed.length, added.length); offset++) {
        const old = removed[offset],
          next = added[offset];
        const row = {
          type: old && next ? "change" : old ? "delete" : "insert",
          oldText: old?.oldText ?? null,
          oldLine: old?.oldLine ?? null,
          newText: next?.newText ?? null,
          newLine: next?.newLine ?? null
        };
        if (old && next) old.pair = next.pair = row;
        rows.push(row);
      }
    }
    return rows;
  };

  // ===== LIFECYCLE =====
  // Replace the previous owner and return its cancellable state. Only the current owner may clear the host.
  const mount = (element, options, getText, previous) => {
    const { displayContainer = true } = options;
    if (!(element instanceof HTMLElement)) throw new TypeError("byDIFFviewer: element must be an HTMLElement.");
    // Validate appearance before disposing the current instance, so invalid options leave it usable.
    const content = node("div", "byVIEWcontent");
    if (!previous) applyContentAppearance(element, options, content);
    const painted = element.classList.contains("byVIEWready");
    if (previous) {
      previous.active = false;
      cancelAnimationFrame(previous.motionFrame);
    } else instances.get(element)?.destroy();
    const state = { active: true, getText, content, mountedContent: previous?.mountedContent ?? content, api: previous?.api ?? {} };
    state.destroy = () => {
      if (!state.active) return;
      state.active = false;
      state.request?.abort();
      cancelAnimationFrame(state.motionFrame);
      // An old controller must not clear a replacement mounted on the same element.
      if (instances.get(element) === state) {
        instances.delete(element);
        element.replaceChildren();
        element.classList.remove(documentClass, "byVIEWplain", "byVIEWcompact", "byVIEWbottom", "byVIEWmotion", "byVIEWappear", "byVIEWready");
        element.removeAttribute("aria-busy");
      }
    };
    instances.set(element, state);
    state.error = (error) => {
      if (!state.active) return;
      element.setAttribute("aria-busy", "false");
      const message = node("p", "byVIEWerror", error.message);
      message.setAttribute("role", "alert");
      state.content.replaceChildren(message);
    };
    if (previous) {
      element.classList.add("byVIEWready");
      state.updateControls = previous.updateControls;
      return state;
    }
    element.replaceChildren();
    element.classList.add(documentClass);
    element.classList.toggle("byVIEWplain", !displayContainer);
    const appear = syncMotion(element, options);
    if (painted && !appear) element.classList.add("byVIEWready");
    else {
      // Paint opacity 0 before starting each requested fade.
      element.classList.remove("byVIEWready");
      state.motionFrame = requestAnimationFrame(() => {
        state.motionFrame = requestAnimationFrame(() => {
          if (state.active) element.classList.add("byVIEWready");
        });
      });
    }
    element.appendChild(content);
    state.updateControls = mountControls(element, content, options, (event) => instances.get(element).getText(event), byDIFFviewer.VERSION);
    return state;
  };

  const sourceURL = (input, options) => {
    if (options?.sourceType === "text") return;
    if (typeof input === "string") return /^(?:https?:\/\/|\.{1,2}\/|\/(?![/*]))[^\s]+$/i.test(input) ? input : undefined;
    if (input && Object.hasOwn(input, "url") && typeof input.url === "string" && Object.keys(input).length === 1) return input.url.trim() || undefined;
  };
  const fetchSource = async (url, signal) => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Unable to load source: HTTP ${response.status}.`);
    return response.text();
  };

  // ===== PUBLIC API =====
  // Compare two strings without executing either. ready resolves after the first display batch.
  function byDIFFviewer(element, oldSource, newSource, options = {}) {
    return renderViewer(element, oldSource, newSource, options, undefined, sourceURL(oldSource, options), sourceURL(newSource, options));
  }

  function renderViewer(element, oldSource, newSource, options, previous, oldURL, newURL) {
    if ((!oldURL && typeof oldSource !== "string") || (!newURL && typeof newSource !== "string")) throw new TypeError("Diff inputs must be text or source URLs.");
    options = { view: "split", batchSize: 500, highlightCharacters: true, ...options };
    const { lineNumbers = true, viewSelect = false, loadMore = true } = options;
    options.batchSize = positive(options.batchSize, 500, 2000);
    const state = mount(element, options, (shiftPressed) => (shiftPressed ? oldSource : newSource), previous);
    if (oldURL || newURL) {
      state.request = previous?.request ?? new AbortController();
      state.sources = previous?.sources ?? Promise.all([oldURL ? fetchSource(oldURL, state.request.signal) : oldSource, newURL ? fetchSource(newURL, state.request.signal) : newSource]);
    }
    previous?.highlights.disconnect();
    element.setAttribute("aria-busy", "true");
    const actions = node("div", "byVIEWactions");
    let view = options.view === "unified" ? "unified" : "split";
    const viewControl = node("div", "byVIEWsegments");
    viewControl.setAttribute("role", "group");
    viewControl.setAttribute("aria-label", "Diff view");
    // Each instance needs its own radio group so changing one diff cannot deselect another.
    const viewName = `byDIFFview-${++nextViewId}`;
    for (const [value, label] of [
      ["unified", "Unified"],
      ["split", "Side by side"]
    ]) {
      const choice = node("label");
      const input = node("input");
      input.type = "radio";
      input.name = viewName;
      input.value = value;
      input.checked = value === view;
      input.addEventListener("change", () => {
        if (!input.checked) return;
        view = value;
        render();
      });
      choice.append(input, node("span", "", label));
      viewControl.appendChild(choice);
    }
    if (viewSelect) actions.appendChild(viewControl);
    const status = node("p", "byVIEWstatus", "Comparing...");
    status.setAttribute("role", "status");
    const scroll = node("div", "byDIFFscroll");
    scroll.tabIndex = 0;
    scroll.setAttribute("role", "region");
    scroll.setAttribute("aria-label", "Text comparison");
    const table = node("table", "byDIFFtable");
    table.setAttribute("aria-label", "Line differences");
    scroll.appendChild(table);
    let edits = [],
      splitEdits = [],
      inserted = 0,
      deleted = 0,
      shown = options.batchSize;
    const more = button(state.content, "Load more", "Load more differences", () => {
      shown += options.batchSize;
      render(true);
    });
    more.hidden = true;
    const panel = node("div", "byVIEWpanel");
    panel.append(status, scroll);
    state.content.replaceChildren(actions, panel, more);
    const rowEdits = new WeakMap();
    state.highlights = new IntersectionObserver(
      (entries) => {
        if (!state.active || !options.highlightCharacters) return;
        for (const { target, isIntersecting } of entries) {
          if (!isIntersecting || !table.contains(target)) continue;
          state.highlights.unobserve(target);
          const edit = rowEdits.get(target);
          const pair = edit.pair ?? edit;
          pair.ranges ??= changedRanges(pair, options.ignoreWhitespace);
          const spans = target.getElementsByClassName("byDIFFtext");
          if (edit.type === "change") {
            highlightRanges(spans[0], pair.ranges.delete);
            highlightRanges(spans[1], pair.ranges.insert);
          } else highlightRanges(spans[0], pair.ranges[edit.type]);
        }
      },
      { rootMargin: "160px" }
    );
    const destroy = state.destroy;
    state.destroy = () => {
      state.highlights.disconnect();
      destroy();
    };
    const appendLineText = (cell, text, kind) => {
      cell.appendChild(node("span", "byDIFFtext", lineText(text ?? "")));
      // An empty payload represents the final newline; null represents a missing side of a split row.
      if (text === "" && kind !== "equal") cell.appendChild(node("small", "byDIFFnewline", "Newline at end of file"));
      else if (text && !text.endsWith("\n")) cell.appendChild(node("small", "byDIFFnoNewline", "No newline at end of file"));
    };
    const addCell = (row, text, number, kind) => {
      if (lineNumbers) {
        const gutter = node("td", "byDIFFnumber", number ?? "");
        gutter.setAttribute("aria-label", number === null ? "No line" : `Line ${number}`);
        row.appendChild(gutter);
      }
      const cell = node("td", `byDIFFcode byDIFF${kind}`);
      appendLineText(cell, text, kind);
      row.appendChild(cell);
    };
    // ===== RENDERING =====
    const tableHead = () => {
      const head = node("thead");
      const heading = head.insertRow();
      const { oldLabel, newLabel } = options;
      let labels = [oldLabel, newLabel];
      if (view === "unified") labels = lineNumbers ? [`${oldLabel} line`, `${newLabel} line`, "Change", "Text"] : ["Change", "Text"];
      for (const label of labels) {
        const th = node("th");
        th.appendChild(node("span", "", label));
        th.title = label;
        th.scope = view === "split" && lineNumbers ? "colgroup" : "col";
        if (view === "split" && lineNumbers) th.colSpan = 2;
        heading.appendChild(th);
      }
      return head;
    };
    const render = (append = false) => {
      if (!state.active) return;
      if (!append) {
        state.highlights.disconnect();
        table.dataset.view = view;
        table.replaceChildren(tableHead(), node("tbody"));
        if (view === "split" && lineNumbers) {
          const side = node("colgroup");
          const gutter = node("col", "byDIFFgutter");
          gutter.style.width = `calc(${String(edits.length).length}ch + 1rem)`;
          side.append(gutter, node("col"));
          table.prepend(side, side.cloneNode(true));
        }
      }
      const body = table.tBodies[0],
        batch = document.createDocumentFragment();
      const rows = view === "split" ? splitEdits : edits;
      const count = loadMore ? Math.min(shown, rows.length) : rows.length;
      for (let index = body.rows.length; index < count; index++) {
        const edit = rows[index];
        const row = node("tr", `byDIFF${edit.type}`);
        if (view === "split") {
          addCell(row, edit.oldText, edit.oldLine, edit.type !== "equal" && edit.oldText !== null ? "delete" : "equal");
          addCell(row, edit.newText, edit.newLine, edit.type !== "equal" && edit.newText !== null ? "insert" : "equal");
        } else {
          if (lineNumbers) {
            row.append(node("td", "byDIFFnumber", edit.oldLine ?? ""), node("td", "byDIFFnumber", edit.newLine ?? ""));
          }
          const marker = node("td", "byDIFFmarker", edit.type === "insert" ? "+" : edit.type === "delete" ? "−" : " ");
          marker.setAttribute("aria-label", edit.type);
          row.appendChild(marker);
          const code = node("td", "byDIFFcode");
          const text = edit.type === "delete" ? edit.oldText : edit.newText;
          appendLineText(code, text, edit.type);
          row.appendChild(code);
        }
        if (edit.type === "change" || edit.pair) {
          rowEdits.set(row, edit);
          if (options.highlightCharacters) state.highlights.observe(row);
        }
        batch.appendChild(row);
      }
      body.appendChild(batch);
      more.hidden = !loadMore || shown >= rows.length;
      state.syncStatus = () => {
        const { statusBar = true } = options;
        status.hidden = !statusBar && edits.length > 0;
      };
      state.syncStatus();
      status.textContent = edits.length ? `${inserted} additions · ${deleted} deletions · ${count} of ${rows.length} rows displayed` : "Both inputs are empty.";
      element.setAttribute("aria-busy", "false");
    };
    state.ready = (async () => {
      try {
        if (state.sources) [oldSource, newSource] = await state.sources;
        await pause();
        if (!state.active) return false;
        const iterator = compare(oldSource, newSource, options);
        let step;
        do {
          if (!state.active) return false;
          step = iterator.next();
          if (!step.done) await pause();
        } while (!step.done);
        edits = step.value;
        for (const edit of edits) {
          if (edit.type === "insert") inserted++;
          if (edit.type === "delete") deleted++;
        }
        splitEdits = pairChanges(edits);
        render();
        return state.active;
      } catch (error) {
        state.error(error);
        return false;
      }
    })();
    if (previous) {
      // Publish the replacement together so the current document stays visible while rendering.
      state.ready = state.ready.then((result) => {
        if (!state.active) return false;
        const current = state.mountedContent.querySelector(".byDIFFscroll");
        const left = current?.scrollLeft ?? 0;
        const top = current?.scrollTop ?? 0;
        state.mountedContent.replaceChildren(...state.content.childNodes);
        state.content = state.mountedContent;
        state.content.querySelector(".byDIFFscroll")?.scrollTo(left, top);
        return result;
      });
    }
    Object.assign(state.api, {
      ready: state.ready,
      destroy: state.destroy,
      setOptions(changes) {
        if (!state.active) return;
        const { oldLabel, newLabel, highlightCharacters } = options;
        const redraw = ["view", "lineNumbers", "ignoreWhitespace", "batchSize", "viewSelect", "loadMore"].some((key) => key in changes && changes[key] !== options[key]);
        state.updateControls(options, changes);
        if ("displayContainer" in changes) {
          const { displayContainer = true } = changes;
          element.classList.toggle("byVIEWplain", !displayContainer);
        }
        if (Object.hasOwn(changes, "statusBar")) state.syncStatus?.();
        if (redraw) {
          return renderViewer(element, oldSource, newSource, options, state, oldURL, newURL).ready;
        }
        if ((options.oldLabel !== oldLabel || options.newLabel !== newLabel) && table.tHead) table.tHead.replaceWith(tableHead());
        if (options.highlightCharacters !== highlightCharacters) {
          if (options.highlightCharacters) {
            for (const row of table.tBodies[0]?.rows ?? []) {
              if (rowEdits.has(row)) state.highlights.observe(row);
            }
          } else {
            state.highlights.disconnect();
            for (const mark of table.querySelectorAll(".byDIFFinline")) mark.replaceWith(mark.textContent);
          }
        }
      }
    });
    return state.api;
  }

  byDIFFviewer.diff = (oldSource, newSource, options = {}) => finishComparison(compare(oldSource, newSource, options));
  // ===== EXPORT =====
  global.byDIFFviewer = byDIFFviewer;
  byDIFFviewer.initialized = true;
})(typeof window !== "undefined" ? window : this);
