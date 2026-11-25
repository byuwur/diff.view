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
