// Concatenate src/*.js into one self-contained script (IIFE) for the site.
// usage: node tools/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = fs.readdirSync(path.join(ROOT, 'src')).filter(f => f.endsWith('.js')).sort();
let body = files.map(f => `/* ---- ${f} ---- */\n` + fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')).join('\n');
const header = `/*! Pandion Plots: "Three rules" animation. Pure JavaScript, no dependencies.
 *  Mount: <div data-pandion-three-rules></div> (auto-mounted on DOMContentLoaded),
 *  or window.PandionThreeRules.mount(element, { autoplay: true }).
 *  Brand marks CC0 (Torry Scott Dennis, PhD). */\n`;
const out = header + '(function () {\n\'use strict\';\n' + body + `
var api = {
  mount: mountThreeRules,
  renderFrame: renderFrame,
  duration: DURATION,
  chapters: CHAPTERS,
  renderSoundtrack: function (sr) { return renderSoundtrack({ sampleRate: sr || 48000, duration: DURATION, cues: SFX, finale: FINALE }); }
};
window.PandionThreeRules = api;
function autoMount() {
  var els = document.querySelectorAll('[data-pandion-three-rules]');
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    mountThreeRules(el, { autoplay: el.getAttribute('data-autoplay') !== 'false', describedBy: el.getAttribute('data-describedby') || null, label: el.getAttribute('data-label') || null });
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoMount); else autoMount();
})();
`;
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist/pandion-three-rules.js'), out);
console.log('dist/pandion-three-rules.js', (out.length / 1024).toFixed(1) + ' KB');
// optional: --site <dir> also writes the minified build there
const siteIdx = process.argv.indexOf('--site');
const siteDir = siteIdx > 0 ? path.resolve(process.argv[siteIdx + 1]) : null;
const { minify } = await import('terser');
const min = await minify(out, { compress: { passes: 2 }, mangle: true, format: { comments: /^!/ } });
fs.writeFileSync(path.join(ROOT, 'dist/pandion-three-rules.min.js'), min.code);
const zlib = await import('node:zlib');
console.log('dist/pandion-three-rules.min.js', (min.code.length / 1024).toFixed(1) + ' KB',
  '(gzip ' + (zlib.gzipSync(min.code).length / 1024).toFixed(1) + ' KB)');
if (siteDir) {
  fs.mkdirSync(siteDir, { recursive: true });
  fs.writeFileSync(path.join(siteDir, 'pandion-three-rules.min.js'), min.code);
  console.log('site copy ->', path.join(siteDir, 'pandion-three-rules.min.js'));
}
