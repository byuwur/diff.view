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
    await page.evaluate(() => byDIFFviewer(root, "old", '<img src=x onerror="window.injected=1">').ready);
    assert.equal(await page.locator("#viewer img").count(), 0);
    assert.match(await page.locator(".byDIFFtable").textContent(), /<img/);
    assert.equal(await page.evaluate(() => window.injected), undefined);
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

  assert.deepEqual(errors, [], "No uncaught browser errors");
});
