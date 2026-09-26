// Run axe on one page at a given width (file URL or http URL).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const axeSrc = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const [url, width, wait] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +width, height: 800 } });
await page.goto(url);
await page.waitForTimeout(+(wait || 300));
await page.addScriptTag({ content: axeSrc });
const res = await page.evaluate(async () => {
  const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
  return r.violations.map(v => v.id + ' x' + v.nodes.length + ': ' + v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | '));
});
console.log(width + 'px:', res.length ? res.join('\n  ') : 'no violations');
await browser.close();
