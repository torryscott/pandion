import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const widgetPath = 'inst/widget/graphbuilder2.js';
const current = fs.readFileSync(path.join(root, widgetPath), 'utf8');
const baseline = execFileSync('git', ['show', `HEAD:${widgetPath}`], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
});

function literalAfter(source, marker, open, close) {
    const at = source.indexOf(marker);
    if (at < 0) throw new Error(`marker missing: ${marker}`);
    const start = source.indexOf(open, at + marker.length - 1);
    let depth = 0;
    let quote = '';
    let escaped = false;
    for (let i = start; i < source.length; i++) {
        const ch = source[i];
        if (quote) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === quote) quote = '';
            continue;
        }
        if (ch === '"' || ch === "'") { quote = ch; continue; }
        if (ch === open) depth++;
        else if (ch === close && --depth === 0) return source.slice(start, i + 1);
    }
    throw new Error(`unterminated literal after: ${marker}`);
}

function readCollections(source) {
    return {
        glossary: Function(`return ${literalAfter(source, 'var _GB_GLOSSARY = [', '[', ']')}`)(),
        terms: Function(`return ${literalAfter(source, 'var _GB_STAT_TERMS = {', '{', '}')}`)()
    };
}

const oldData = readCollections(baseline);
const newData = readCollections(current);
const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

function tokens(text) {
    return String(text ?? '').match(/\s+|[\p{L}\p{N}²α-ωΑ-ΩηρτχΔ–—.'’/+−=<>()[\]]+|[^\s]/gu) || [];
}

function wordDiff(a, b) {
    const A = tokens(a), B = tokens(b);
    const rows = A.length + 1, cols = B.length + 1;
    const lcs = Array.from({ length: rows }, () => new Uint16Array(cols));
    for (let i = A.length - 1; i >= 0; i--)
        for (let j = B.length - 1; j >= 0; j--)
            lcs[i][j] = A[i] === B[j]
                ? lcs[i + 1][j + 1] + 1
                : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    let i = 0, j = 0, left = '', right = '';
    while (i < A.length || j < B.length) {
        if (i < A.length && j < B.length && A[i] === B[j]) {
            left += esc(A[i]); right += esc(B[j]); i++; j++;
        } else if (j < B.length && (i === A.length || lcs[i][j + 1] >= lcs[i + 1][j])) {
            right += `<mark class="add">${esc(B[j++])}</mark>`;
        } else {
            left += `<mark class="del">${esc(A[i++])}</mark>`;
        }
    }
    return [left || '<span class="empty">Not present</span>', right || '<span class="empty">Not present</span>'];
}

function changedFields(oldEntry, newEntry, fields) {
    return fields.filter(([key]) => String(oldEntry?.[key] ?? '') !== String(newEntry?.[key] ?? ''));
}

function comparisonCard({ title, subtitle, oldEntry, newEntry, fields, kind }) {
    const changed = changedFields(oldEntry, newEntry, fields);
    if (!changed.length) return '';
    const rows = changed.map(([key, label]) => {
        const [left, right] = wordDiff(oldEntry?.[key], newEntry?.[key]);
        return `<div class="field-label">${esc(label)}</div>
          <div class="copy old">${left}</div><div class="copy new">${right}</div>`;
    }).join('');
    const search = [title, subtitle, ...fields.flatMap(([key]) => [oldEntry?.[key], newEntry?.[key]])].join(' ');
    return `<article class="change" data-kind="${esc(kind)}" data-search="${esc(search.toLowerCase())}">
      <header><div><span class="type">${esc(kind)}</span><h3>${esc(title)}</h3></div><span class="count">${changed.length} field${changed.length === 1 ? '' : 's'} changed</span></header>
      ${subtitle ? `<p class="subtitle">${esc(subtitle)}</p>` : ''}
      <div class="grid"><div></div><div class="column-title old-title">Before</div><div class="column-title new-title">After</div>${rows}</div>
    </article>`;
}

const oldGloss = new Map(oldData.glossary.map(entry => [entry.n, entry]));
const newGloss = new Map(newData.glossary.map(entry => [entry.n, entry]));
const glossNames = [...new Set([...oldGloss.keys(), ...newGloss.keys()])];
const glossaryCards = glossNames.map(name => comparisonCard({
    title: name,
    subtitle: `Modules: ${(newGloss.get(name)?.m || oldGloss.get(name)?.m || []).join(', ')}`,
    oldEntry: oldGloss.get(name),
    newEntry: newGloss.get(name),
    fields: [['b', 'Definition'], ['r', 'How to read it'], ['w', 'Common misread / caution']],
    kind: 'Glossary'
})).filter(Boolean);

const termKeys = [...new Set([...Object.keys(oldData.terms), ...Object.keys(newData.terms)])];
const termCards = termKeys.map(key => comparisonCard({
    title: newData.terms[key]?.name || oldData.terms[key]?.name || key,
    subtitle: `Linked term key: ${key}`,
    oldEntry: oldData.terms[key],
    newEntry: newData.terms[key],
    fields: [['name', 'Displayed name'], ['sym', 'Symbol'], ['body', 'Definition'], ['read', 'How to read it']],
    kind: 'Linked definition'
})).filter(Boolean);

const generated = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
const cards = [...glossaryCards, ...termCards].join('\n');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pandion Plots definition changes</title>
<style>
:root{--ink:#17202a;--muted:#64748b;--line:#d9e0e7;--paper:#fff;--wash:#f4f7fa;--old:#8d2430;--oldbg:#fff0f1;--new:#11643c;--newbg:#eaf8f0;--accent:#215b8f}
*{box-sizing:border-box}body{margin:0;background:var(--wash);color:var(--ink);font:15px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:1440px;margin:auto;padding:38px 24px 80px}.hero{background:linear-gradient(135deg,#173a5c,#296a8c);color:#fff;border-radius:18px;padding:30px 34px;box-shadow:0 12px 35px #173a5c24}
h1{font-size:30px;line-height:1.15;margin:0 0 10px}.hero p{max-width:900px;margin:7px 0;color:#e5f0f7}.summary{display:flex;gap:12px;flex-wrap:wrap;margin-top:20px}.pill{padding:7px 12px;border:1px solid #ffffff4a;border-radius:999px;background:#ffffff12;font-weight:650}
.toolbar{position:sticky;top:0;z-index:5;display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:#f4f7faf2;backdrop-filter:blur(9px);padding:16px 0 12px;margin:14px 0}
input{flex:1;min-width:260px;border:1px solid #bcc8d3;border-radius:10px;padding:11px 13px;font:inherit;background:#fff}button{border:1px solid #b9c6d1;background:#fff;border-radius:999px;padding:8px 13px;font:inherit;font-weight:650;cursor:pointer}button.active{background:var(--accent);border-color:var(--accent);color:#fff}
.change{background:var(--paper);border:1px solid var(--line);border-radius:14px;margin:16px 0;overflow:hidden;box-shadow:0 3px 14px #1f29370a}.change>header{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:17px 20px;border-bottom:1px solid var(--line)}h3{font-size:19px;margin:2px 0 0}.type{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);font-weight:800}.count,.subtitle{color:var(--muted)}.count{white-space:nowrap;font-size:13px}.subtitle{margin:0;padding:9px 20px;background:#fafbfc;font-size:13px;border-bottom:1px solid var(--line)}
.grid{display:grid;grid-template-columns:155px minmax(0,1fr) minmax(0,1fr)}.grid>*{padding:14px 18px;border-bottom:1px solid #e7ebef}.grid>*:nth-last-child(-n+3){border-bottom:0}.field-label{font-weight:750;background:#fafbfc}.column-title{font-weight:800;padding-top:10px;padding-bottom:10px}.old-title{color:var(--old);background:var(--oldbg)}.new-title{color:var(--new);background:var(--newbg)}.copy{white-space:pre-wrap}.copy.old{border-left:1px solid #e7ebef}.copy.new{border-left:1px solid #e7ebef}.empty{color:#94a3b8;font-style:italic}mark{border-radius:3px;padding:1px 2px}mark.del{background:#ffd9dd;color:#74202a;text-decoration:line-through;text-decoration-thickness:1px}mark.add{background:#ccefd9;color:#0e5633}.none{padding:40px;text-align:center;color:var(--muted)}
footer{color:var(--muted);margin-top:28px;font-size:13px}@media(max-width:850px){main{padding:20px 12px 60px}.hero{padding:24px 20px}.grid{grid-template-columns:110px 1fr}.column-title.old-title{grid-column:2}.column-title.new-title{display:none}.copy.old,.copy.new{grid-column:2}.copy.old{background:var(--oldbg)}.copy.new{background:var(--newbg)}.field-label{grid-row:span 2}.change>header{align-items:flex-start;flex-direction:column}.count{white-space:normal}}
@media print{body{background:#fff}main{max-width:none;padding:0}.hero{box-shadow:none;background:#173a5c}.toolbar{display:none}.change{break-inside:avoid;box-shadow:none}}
</style></head><body><main>
<section class="hero"><h1>Pandion Plots definition changes</h1>
<p>Side-by-side comparison of the repository baseline and the reviewed definitions now installed in jamovi. Red strike-through text was removed; green text was added. Unchanged definitions are omitted.</p>
<div class="summary"><span class="pill">${glossaryCards.length} glossary entries changed</span><span class="pill">${termCards.length} linked definitions changed</span><span class="pill">${glossaryCards.length + termCards.length} total comparisons</span></div></section>
<div class="toolbar"><input id="search" type="search" placeholder="Search terms or wording…" aria-label="Search definition changes"><button class="active" data-filter="all">All</button><button data-filter="Glossary">Glossary</button><button data-filter="Linked definition">Linked definitions</button></div>
<section id="changes">${cards}</section><p class="none" id="none" hidden>No matching definition changes.</p>
<footer>Generated ${esc(generated)}. Baseline: <code>HEAD:${widgetPath}</code>. Current: working-tree widget.</footer>
</main><script>
const search=document.querySelector('#search'),buttons=[...document.querySelectorAll('button[data-filter]')],cards=[...document.querySelectorAll('.change')];let filter='all';
function update(){const q=search.value.trim().toLowerCase();let shown=0;for(const card of cards){const okKind=filter==='all'||card.dataset.kind===filter;const okText=!q||card.dataset.search.includes(q);card.hidden=!(okKind&&okText);if(!card.hidden)shown++}document.querySelector('#none').hidden=shown!==0}
search.addEventListener('input',update);for(const button of buttons)button.addEventListener('click',()=>{filter=button.dataset.filter;for(const b of buttons)b.classList.toggle('active',b===button);update()});
</script></body></html>`;

const output = path.join(root, 'docs', 'glossary-definition-changes.html');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, html);
console.log(`Wrote ${output}`);
console.log(`${glossaryCards.length} glossary entries changed; ${termCards.length} linked definitions changed.`);
