/*
 * File: __tests__/rendering.cjs
 * Desc: Bounded, offline checks for the public DIFF renderer contract.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { chromium, firefox, webkit } = require("playwright");
const engine = process.env.BROWSER_ENGINE || "chromium";
assert.ok(["chromium", "firefox", "webkit"].includes(engine), "Unsupported BROWSER_ENGINE");

test("DIFF library", { timeout: 30000 }, async (t) => {
  const browser = await { chromium, firefox, webkit }[engine].launch({
    timeout: 10000,
    ...(engine === "chromium" ? { channel: process.env.BROWSER_CHANNEL, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {})
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Load authored files directly; CDN availability is not part of this contract.
  await page.route("**/*", (route) => route.abort());
  // ===== BROWSER FIXTURE =====
  await page.setContent(
    /* HTML */ `<!doctype html><meta charset="UTF-8" />
      <div id="viewer"></div>`
  );
  await page.addStyleTag({ path: path.join(__dirname, "../diff.css") });
  await page.addScriptTag({ path: path.join(__dirname, "../diff.js") });
  await page.evaluate(() => {
    window.root = document.getElementById("viewer");
  });

  // ===== RENDERING BEHAVIOR =====
  await t.test("compares line sequences and renders additions and removals", async () => {
    const types = await page.evaluate(() => byDIFFviewer.diff("keep\nold\n", "keep\nnew\n").map((entry) => entry.type));
    assert.ok(types.includes("equal"));
    assert.ok(types.includes("delete"));
    assert.ok(types.includes("insert"));
    assert.equal(await page.evaluate(() => byDIFFviewer(root, "keep\nold", "keep\nnew", { animations: false }).ready), true);
    assert.match(await page.locator(".byDIFFtable").textContent(), /old/);
    assert.match(await page.locator(".byDIFFtable").textContent(), /new/);
  });

  await t.test("compared markup stays inert", async () => {
    await page.evaluate(() => byDIFFviewer(root, "keep", /* HTML */ `keep<img src="x" onerror="window.injected=1" />`).ready);
    await page.locator(".byDIFFinline").waitFor();
    assert.equal(await page.locator("#viewer img").count(), 0);
    assert.match(await page.locator(".byDIFFtable").textContent(), /<img/);
    assert.equal(await page.evaluate(() => window.injected), undefined);
  });

  await t.test("the header previews and copies either complete input", async () => {
    const before = "old\r\nlast\r\n";
    const after = "new\nlast";
    await page.evaluate(
      ([old, next]) => {
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: (text) => (window.copied = text) } });
        window.diff = byDIFFviewer(root, old, next, { batchSize: 1, copyOldButton: true });
        return diff.ready;
      },
      [before, after]
    );
    const copy = page.locator(".byVIEWcopy");
    assert.equal(await page.getByRole("button", { name: "Copy old source", exact: true }).count(), 0);
    assert.equal(await copy.innerText(), "Copy");
    assert.equal(await copy.getAttribute("title"), "Copy New (Shift+click for Copy Old)");
    await copy.hover();
    assert.equal(await copy.innerText(), "Copy New");
    assert.ok(await copy.locator("span").evaluate((caption) => caption.scrollWidth <= caption.clientWidth));
    await page.keyboard.down("Shift");
    assert.equal(await copy.innerText(), "Copy Old");
    await page.keyboard.up("Shift");
    assert.equal(await copy.innerText(), "Copy New");
    await copy.click();
    assert.equal(await page.evaluate(() => window.copied), after);
    await page.evaluate(() => diff.setOptions({ view: "unified", lineNumbers: false }));
    await page.mouse.move(0, 0);
    await page.keyboard.down("Shift");
    await copy.hover();
    assert.equal(await copy.innerText(), "Copy Old");
    await copy.click();
    assert.equal(await page.evaluate(() => window.copied), before);
    await page.keyboard.up("Shift");
    await page.mouse.move(0, 0);
    await copy.focus();
    await copy.press("Enter");
    assert.equal(await page.evaluate(() => window.copied), after);
    await copy.press("Shift+Enter");
    assert.equal(await page.evaluate(() => window.copied), before);
  });

  await t.test("side labels follow each viewer across live edits and view changes", async (t) => {
    await page.evaluate(async () => {
      window.diff = byDIFFviewer(root, "before", "after", { oldLabel: "  Draft <v1>  " });
      const other = document.body.appendChild(document.createElement("div"));
      other.id = "second-viewer";
      window.secondDiff = byDIFFviewer(other, "a", "b", { newLabel: "Published" });
      await Promise.all([diff.ready, secondDiff.ready]);
    });
    t.after(() =>
      page.evaluate(() => {
        root.style.removeProperty("width");
        secondDiff.destroy();
      })
    );
    const heads = page.locator("#viewer th");
    const copy = page.locator("#viewer .byVIEWcopy");
    const firstRow = await page.locator("#viewer tbody tr").first().elementHandle();
    assert.deepEqual(await heads.allTextContents(), ["Draft <v1>", "New"]);
    assert.deepEqual(await page.locator("#second-viewer th").allTextContents(), ["Old", "Published"]);
    await copy.hover();
    await page.evaluate(() => diff.setOptions({ newLabel: "Release" }));
    assert.equal(await copy.innerText(), "Copy Release");
    assert.equal(await copy.getAttribute("title"), "Copy Release (Shift+click for Copy Draft <v1>)");
    await page.keyboard.down("Shift");
    assert.equal(await copy.getAttribute("aria-label"), "Copy Draft <v1>");
    await page.evaluate(() => diff.setOptions({ oldLabel: "Manuscript" }));
    assert.equal(await copy.innerText(), "Copy Manuscript");
    await page.keyboard.up("Shift");
    assert.ok(await firstRow.evaluate((row) => row.isConnected));
    await page.evaluate(() => diff.setOptions({ view: "unified" }));
    assert.deepEqual(await heads.allTextContents(), ["Manuscript line", "Release line", "Change", "Text"]);
    await page.evaluate(() => diff.setOptions({ oldLabel: " ", newLabel: null, copyButton: false }));
    assert.deepEqual(await heads.allTextContents(), ["Old line", "New line", "Change", "Text"]);
    await page.evaluate(() => diff.setOptions({ copyButton: true, lineNumbers: false }));
    assert.deepEqual(await heads.allTextContents(), ["Change", "Text"]);
    assert.equal(await copy.getAttribute("title"), "Copy New (Shift+click for Copy Old)");
    assert.equal(await page.locator("#second-viewer .byVIEWcopy").getAttribute("title"), "Copy Published (Shift+click for Copy Old)");
    for (const width of ["20rem", "48rem"]) {
      await page.evaluate((width) => root.style.setProperty("width", width), width);
      await copy.hover();
      await page.mouse.move(0, 0);
      await copy.getByText("Copy", { exact: true }).waitFor();
      const idle = await copy.boundingBox();
      await page.evaluate(() => diff.setOptions({ newLabel: "release-2026-11-26-document-edition.md", oldLabel: "Draft" }));
      assert.deepEqual(await copy.boundingBox(), idle);
      await copy.hover();
      const long = await copy.boundingBox();
      assert.equal(long.y, idle.y);
      assert.ok(await copy.locator("span").evaluate((caption) => caption.scrollWidth > caption.clientWidth));
      await page.keyboard.down("Shift");
      assert.equal(await copy.innerText(), "Copy Draft");
      const short = await copy.boundingBox();
      assert.ok(idle.width < short.width && short.width < long.width);
      assert.ok(await copy.locator("span").evaluate((caption) => caption.scrollWidth <= caption.clientWidth));
      await page.keyboard.up("Shift");
      await copy.click();
      await copy.getByText("Copied!", { exact: true }).waitFor();
      assert.deepEqual(await copy.boundingBox(), long);
      assert.equal(await page.evaluate(() => window.copied), "after");
    }
  });

  await t.test("split headings and source rows share the available width equally", async (t) => {
    t.after(() => page.evaluate(() => root.style.removeProperty("width")));
    const label = "original-document-".repeat(20);
    await page.evaluate((label) => {
      window.diff = byDIFFviewer(root, "x".repeat(500) + "\n", "ok\n", { oldLabel: label, newLabel: "Revision" });
      return diff.ready;
    }, label);
    for (const width of ["18rem", "48rem"]) {
      await page.evaluate((width) => root.style.setProperty("width", width), width);
      for (const lineNumbers of [true, false]) {
        await page.evaluate((lineNumbers) => diff.setOptions({ lineNumbers }), lineNumbers);
        const table = page.locator("#viewer table");
        const headings = table.locator("th");
        const left = await headings.first().boundingBox();
        const right = await headings.last().boundingBox();
        assert.ok(Math.abs(left.width - right.width) <= 1);
        const code = table.locator("tbody tr").first().locator(".byDIFFcode");
        const oldCode = await code.first().boundingBox();
        const newCode = await code.last().boundingBox();
        assert.ok(Math.abs(newCode.x - oldCode.x - left.width) <= 1);
        assert.equal(await headings.first().getAttribute("title"), label);
        assert.ok(
          await headings
            .first()
            .locator("span")
            .evaluate((caption) => caption.scrollWidth > caption.clientWidth)
        );
        assert.ok(
          await headings
            .last()
            .locator("span")
            .evaluate((caption) => caption.scrollWidth <= caption.clientWidth)
        );
        assert.ok(await table.evaluate((table) => table.parentElement.scrollWidth <= table.parentElement.clientWidth + 1));
        assert.equal(await table.locator(".byDIFFtext").first().textContent(), "x".repeat(500));
        assert.ok(
          await table
            .locator(".byDIFFtext")
            .first()
            .evaluate((line) => line.scrollWidth > line.clientWidth)
        );
      }
    }
    await page.evaluate(() => diff.setOptions({ view: "unified", lineNumbers: true }));
    const unifiedLabel = page.locator("#viewer th").first();
    assert.equal(await unifiedLabel.getAttribute("title"), label + " line");
    assert.ok(await unifiedLabel.locator("span").evaluate((caption) => caption.scrollWidth > caption.clientWidth));
  });

  await t.test("both views mark separate edits and whole graphemes within paired lines", async () => {
    const before = "cost=120; pay=👩‍💻; cafe\u0301\r\nkeep\r\n";
    const after = "cost=125; pay=👩‍🔬; cafe\u0300\nadded line\nkeep\n";
    await page.evaluate(([old, next]) => byDIFFviewer(root, old, next, { viewSelect: true }).ready, [before, after]);
    for (const view of ["split", "unified"]) {
      await page.locator(`input[value="${view}"]`).evaluate((input) => input.click());
      const old = page.locator(".byDIFFdelete .byDIFFtext").first();
      const next = page.locator(".byDIFFinsert .byDIFFtext").first();
      await old.locator(".byDIFFinline").first().waitFor();
      await next.locator(".byDIFFinline").first().waitFor();
      assert.deepEqual(await old.locator(".byDIFFinline").allTextContents(), ["0", "👩‍💻", "e\u0301"]);
      assert.deepEqual(await next.locator(".byDIFFinline").allTextContents(), ["5", "👩‍🔬", "e\u0300"]);
      assert.equal(await old.textContent(), before.split("\r")[0]);
      assert.equal(await next.textContent(), after.split("\n")[0]);
      assert.equal(await page.locator(".byDIFFinline").count(), 6);
    }
  });

  await t.test("insertions, deletions and ignored whitespace retain original text", async () => {
    const before = "  sum(a, b)  \nabcde\ntrailing \n";
    const after = "sum( a, b, c)\nace\ntrailing\n";
    for (const [mode, oldRuns, newRuns] of [
      ["all", ["b", "d"], [",", "c"]],
      ["trim", ["b", "d"], [" ", ", c"]]
    ]) {
      await page.evaluate(([old, next, ignoreWhitespace]) => byDIFFviewer(root, old, next, { ignoreWhitespace }).ready, [before, after, mode]);
      await page.locator(".byDIFFinline").first().waitFor();
      assert.deepEqual(await page.locator(".byDIFFdelete .byDIFFinline").allTextContents(), oldRuns);
      assert.deepEqual(await page.locator(".byDIFFinsert .byDIFFinline").allTextContents(), newRuns);
      assert.equal(await page.locator(".byDIFFtext").first().textContent(), "  sum(a, b)  ");
    }
  });

  await t.test("load more preserves mounted rows and scrolling highlights a distant replacement", async () => {
    await page.evaluate(() => {
      const context = Array.from({ length: 100 }, (_, i) => `line ${i}\n`).join("");
      return byDIFFviewer(root, `head A\n${context}tail 1`, `head B\n${context}tail 2`, { batchSize: 101 }).ready;
    });
    const first = page.locator(".byDIFFinline").first();
    await first.waitFor();
    const mounted = await first.elementHandle();
    assert.equal(await page.locator("tbody tr").count(), 101);
    await page.getByRole("button", { name: "Load more differences" }).evaluate((button) => button.click());
    const last = page.locator("tbody tr").last();
    assert.match(await last.textContent(), /tail 2/);
    assert.equal(await last.locator(".byDIFFinline").count(), 0);
    await last.scrollIntoViewIfNeeded();
    await last.locator(".byDIFFinline").first().waitFor();
    assert.deepEqual(await last.locator(".byDIFFinline").allTextContents(), ["1", "2"]);
    assert.ok(await mounted.evaluate((node) => node.isConnected));
  });

  await t.test("expensive pairs keep line shading while nearby pairs still highlight", async () => {
    await page.evaluate(() => byDIFFviewer(root, `${"x".repeat(4096)}a\n${"x".repeat(200)}\nok 1`, `${"x".repeat(4096)}b\n${"y".repeat(200)}\nok 2`).ready);
    await page.locator(".byDIFFinline").first().waitFor();
    assert.deepEqual(await page.locator(".byDIFFinline").allTextContents(), ["1", "2"]);
    assert.equal(await page.locator("tr.byDIFFchange").count(), 3);
    assert.equal(await page.locator("[role=alert]").count(), 0);
  });

  await t.test("replacement and disposal respect the current instance", async () => {
    const result = await page.evaluate(async () => {
      const old = byDIFFviewer(root, "old", "before");
      await old.ready;
      const current = byDIFFviewer(root, "old", "current");
      const ready = await current.ready;
      old.destroy();
      const preserved = root.textContent.includes("current");
      current.destroy();
      return { ready, preserved, empty: root.childNodes.length === 0 };
    });
    assert.deepEqual(result, { ready: true, preserved: true, empty: true });
  });

  await t.test("loads a source URL through the public API", async () => {
    const url = "https://files.test/sample";
    await page.route(url, (route) =>
      route.fulfill({
        contentType: "text/plain",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: "new-value"
      })
    );
    const displayed = await page.evaluate(async (url) => {
      const viewer = byDIFFviewer(root, "old-value", url);
      return (await viewer.ready) && root.textContent;
    }, url);
    assert.match(displayed, /old-value/);
    assert.match(displayed, /new-value/);
  });

  await t.test("compares two source files in the requested order", async () => {
    await page.route("https://files.test/*.txt", (route) =>
      route.fulfill({
        headers: { "Access-Control-Allow-Origin": "*" },
        body: new URL(route.request().url()).pathname
      })
    );
    const rendered = await page.evaluate(() => byDIFFviewer(root, { url: "https://files.test/before.txt" }, "https://files.test/after.txt").ready);
    assert.equal(rendered, true);
    assert.deepEqual(await page.locator(".byDIFFtext").allTextContents(), ["/before.txt", "/after.txt"]);
  });

  assert.deepEqual(errors, [], "No uncaught browser errors");
});
