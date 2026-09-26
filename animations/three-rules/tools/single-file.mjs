// One self-contained HTML page with the hands-on tour inlined (no server, no
// network): double-click to open, or send it to someone.
// usage: node tools/single-file.mjs [out.html]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(ROOT, 'out', 'Pandion three rules, hands-on (prototype).html'));
const js = fs.readFileSync(path.join(ROOT, 'dist/pandion-three-rules.min.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pandion Plots: three rules, hands-on</title>
<style>
  body{margin:0;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#22364d;background:#fff}
  .wrap{max-width:980px;margin:0 auto;padding:0 24px 64px}
  .kicker{color:#8a6414;font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin:48px 0 8px}
  h1{margin:0 0 12px;color:#192E49;font-size:clamp(28px,4vw,38px);letter-spacing:-.015em;line-height:1.15}
  .lede{margin:0 0 28px;color:#5f6f80;font-size:17px;max-width:44em}
  figure{margin:0 0 28px}
  figcaption{margin-top:10px;color:#5f6f80;font-size:13.5px}
  details{color:#5f6f80;font-size:14.5px}
  summary{cursor:pointer;font-weight:700;color:#192E49}
</style></head>
<body><div class="wrap">
<p class="kicker">Prototype</p>
<h1>Pandion Plots in three rules, hands-on.</h1>
<p class="lede">The tour stops at each step and hands it to you: click the bar, pick the color, type your own axis title,
drag the bars and the legend, add data points and drag a significance bracket into place. Stuck? Show me does the step for you.
Prefer to sit back? Just watch plays it straight through.</p>
<figure><div data-pandion-three-rules data-describedby="tr-transcript" data-label="Interactive tour: the three rules of Pandion Plots"></div>
<figcaption>Click to change, drag to move, click + to add.</figcaption></figure>
<details><summary>Transcript</summary><p id="tr-transcript">An interactive tour of Pandion Plots, which works by three rules.
It stops at each step so you can do it yourself, or show you. Rule 1: to change something, click it. Clicking a bar opens its
settings under the chart; picking a color recolors that series, and clicking the axis title lets you type a new one. Rule 2: to
move something, drag it. Dragging a bar past its neighbor swaps the two groups in every category, and dragging the legend places it
anywhere. Rule 3: to add something, click the Add button. The Add menu puts data points on the chart, and a significance bracket
dragged onto two bars computes its own test. Click to change, drag to move, click plus to add.</p></details>
</div>
<script>${js}</script>
</body></html>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(out, (html.length / 1024).toFixed(1) + ' KB');
