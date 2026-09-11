// Seeded operation sequences against an independent, small spreadsheet model.
// Mutations use the application's public command paths; expected values never
// use its formula evaluator, parser, aggregation, or undo implementation.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const { chromium } = createRequire('/private/tmp/x.js')('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const seed = Number(process.env.PS_STATE_FUZZ_SEED || new Date().toISOString().slice(0, 10).replaceAll('-', ''));
assert.ok(Number.isSafeInteger(seed), 'seed must be an integer');
let randomState = seed >>> 0;
const random = n => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState % n; };
const clone = x => JSON.parse(JSON.stringify(x));
let serial = 0;
let model = { raw: {
  group: Array.from({ length: 12 }, (_, i) => i < 6 ? 'A' : 'B'),
  x: Array.from({ length: 12 }, (_, i) => String(1e10 + i * 4)),
  note: Array.from({ length: 12 }, (_, i) => String(i).padStart(3, '0')) },
  order: ['group','x','note','a','b','c'], xName: 'x',
  delta: 1, threshold: null, excluded: Array(12).fill(false), cellExcluded: Array(12).fill(false),
  ids: Array.from({length:12},()=>++serial), noteType: 'nominal', copyType: null, cycle: false };
const observedIds = new Map();
function insertRow(at, source = null) {
  for (const values of Object.values(model.raw)) values.splice(at,0,source===null?'':values[source]);
  model.excluded.splice(at,0,false); model.cellExcluded.splice(at,0,false); model.ids.splice(at,0,++serial);
}
function deleteRow(at) {
  for (const values of Object.values(model.raw)) values.splice(at,1);
  model.excluded.splice(at,1);model.cellExcluded.splice(at,1);model.ids.splice(at,1);
}
const browser = await chromium.launch();
let checks = 0;
const counts = {};
console.log('workspace sequence seed=' + seed);
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('file://' + path.resolve(root, process.env.PS_PAGE || 'standalone/index.html'));
  await page.waitForFunction(() => !!window.PS_SHELL);
  await page.evaluate(({ x, groups, notes }) => {
    const S = window.PS_SHELL;
    S.loadTable('sequence', ['group', 'x', 'note'], x.map((v, i) => [groups[i], v, notes[i]]),
      { group: 'nominal', x: 'continuous', note: 'nominal' });
    for (const [name, formula] of [['a', 'x + 1'], ['b', 'a - x'], ['c', 'b * 2']]) {
      const result = S.saveComputedColumn(name, formula);
      if (!result.ok) throw Error(result.error);
    }
    S.setModule('plotbuilder');
    S.setRoles('plotbuilder', { xvar: 'group', yvar: 'b' });
    S.setWorkspace('data');
  }, { x: model.raw.x, groups: model.raw.group, notes: model.raw.note });

  async function verify(label) {
    const actual = JSON.parse(await page.evaluate(() => {
      const S = window.PS_SHELL, t = S.project.table;
      const payload = S.buildPayload();
      return JSON.stringify({ raw: t.raw, types: t.types, order:t.order, ids:t.caseIds,
        cellExcluded:t.caseIds.map((_,i)=>!!(t.excluded && t.excluded[Object.keys(t.raw).find(k=>k==='x'||k==='measurement')]
          && t.excluded[Object.keys(t.raw).find(k=>k==='x'||k==='measurement')][i])),
        excluded: t.caseIds.map(id => !!(t.excludedRows && t.excludedRows[id])),
        formulas: t.computed, errors: t.computedErrors, filters:t.filters || [],
        roles:S.chart().roles.plotbuilder,
        bars: (payload.bars || []).map(b => ({ n: b.n, values: b.values })) });
    }));
    const x=model.raw[model.xName];
    const valid = x.map((v, i) => v !== '' && !model.excluded[i] && !model.cellExcluded[i] && !model.cycle);
    const wantedRaw = { ...model.raw,
      a: x.map((v, i) => valid[i] ? String(Number(v) + model.delta) : ''),
      b: x.map((_, i) => valid[i] ? String(model.delta) : ''),
      c: x.map((_, i) => valid[i] ? String(model.delta * 2) : '') };
    assert.deepEqual(actual.raw, wantedRaw, label + ': raw and chained computed values'); checks++;
    assert.deepEqual(actual.order,model.order,label+': column order');checks++;
    assert.equal(new Set(actual.ids).size,model.ids.length,label+': unique case identities');checks++;
    for (let i=0;i<model.ids.length;i++) {
      if (!observedIds.has(model.ids[i])) observedIds.set(model.ids[i],actual.ids[i]);
      assert.equal(actual.ids[i],observedIds.get(model.ids[i]),label+': identity follows row '+i);checks++;
    }
    assert.deepEqual(actual.excluded, model.excluded, label + ': row exclusions'); checks++;
    assert.deepEqual(actual.cellExcluded,model.cellExcluded,label+': cell exclusions follow rows/renames');checks++;
    assert.equal(actual.types.note, model.noteType, label + ': type survives'); checks++;
    if (model.copyType) {assert.equal(actual.types['note copy'],model.copyType,label+': duplicated type');checks++;}
    assert.deepEqual(actual.formulas, { a: model.cycle?'c + 1':model.xName+' + '+model.delta, b:'a - '+model.xName,c:'b * 2' }, label + ': formulas'); checks++;
    if (model.cycle) {
      assert.deepEqual(Object.keys(actual.errors).sort(),['a','b','c'],label+': all cyclic columns marked');checks++;
      assert(Object.values(actual.errors).every(v=>/circular reference/.test(v)),label+': cycle explained');checks++;
    } else {assert.deepEqual(actual.errors, {}, label + ': no computed errors'); checks++;}
    assert.deepEqual(actual.filters,model.threshold===null?[]:[{col:model.xName,op:'ge',value:String(model.threshold)}],label+': filter follows rename');checks++;
    assert.equal(actual.roles.xvar,'group',label+': group role');checks++;
    assert.equal(actual.roles.yvar,'b',label+': computed role');checks++;
    const n = valid.filter((v, i) => v && model.raw.group[i]!=='' && (model.threshold === null || Number(x[i]) >= model.threshold)).length;
    assert.equal(actual.bars.reduce((sum, b) => sum + b.n, 0), n, label + ': analysis sample size'); checks++;
    assert.deepEqual(actual.bars.flatMap(b => b.values), Array(n).fill(model.delta), label + ': analysis uses current derived values'); checks++;
  }
  await verify('baseline');
  for (let step = 0; step < 216; step++) {
    const before = clone(model);
    const action = step % 18;
    const row = random(model.ids.length);
    const x=model.raw[model.xName];
    let command;
    if (action === 0) {
      const value = random(4) ? String(1e10 + random(400)) : '';
      x[row] = value === x[row] ? String(1e10 + 401) : value;
      command = { kind: 'paste', row, value: x[row] };
    } else if (action === 1) {
      model.delta = model.delta === 7 ? -3 : model.delta + 1;
      model.cycle=false;
      command = { kind: 'formula', delta: model.delta };
    } else if (action === 2) {
      model.threshold = model.threshold === null ? 1e10 + random(40) : null;
      command = { kind: 'filter', threshold: model.threshold };
    } else if (action === 3) {
      model.excluded[row] = !model.excluded[row];
      command = { kind: 'exclude', row, on: model.excluded[row] };
    } else if (action===4) {
      model.noteType = model.noteType === 'nominal' ? 'continuous' : 'nominal';
      command = { kind: 'type', type: model.noteType };
    } else if (action===5) {
      insertRow(row);command={kind:'row',row,name:'data-insert-row-above'};
    } else if (action===6) {
      insertRow(row+1,row);command={kind:'row',row,name:'data-duplicate-row'};
    } else if (action===7) {
      deleteRow(row);command={kind:'row',row,name:'data-delete-row'};
    } else if (action===8) {
      const at=model.order.indexOf('a'),to=at===0?model.order.length-1:0;
      model.order.splice(at,1);model.order.splice(to,0,'a');command={kind:'move',by:to-at};
    } else if (action===9) {
      const old=model.xName,next=old==='x'?'measurement':'x';
      model.raw[next]=model.raw[old];delete model.raw[old];model.order[model.order.indexOf(old)]=next;model.xName=next;
      command={kind:'rename',old,next};
    } else if (action===10) {
      command={kind:'insert-column',reference:model.order[0]};
      model.order.unshift('Variable');model.raw.Variable=Array(model.ids.length).fill('');
    } else if (action===11) {
      model.order.splice(model.order.indexOf('Variable'),1);delete model.raw.Variable;
      command={kind:'delete-column',col:'Variable'};
    } else if (action===12) {
      const start=model.ids.length-1,values=[1e10+random(400),1e10+random(400),1e10+random(400)].map(String);
      insertRow(model.ids.length);insertRow(model.ids.length);
      model.raw[model.xName].splice(start,3,...values);command={kind:'grow',row:start,values};
    } else if (action===13) {
      model.cellExcluded[row]=!model.cellExcluded[row];command={kind:'cell-exclude',row,on:model.cellExcluded[row]};
    } else if (action===14) {
      model.cycle=true;command={kind:'cycle'};
    } else if (action===15) {
      model.raw['note copy']=model.raw.note.slice();model.copyType=model.noteType;
      model.order.splice(model.order.indexOf('note')+1,0,'note copy');command={kind:'duplicate-column'};
    } else if (action===16) {
      x[row]=String(1e10+random(400));command={kind:'paste',row,value:x[row]};
    } else {
      model.order.splice(model.order.indexOf('note copy'),1);delete model.raw['note copy'];model.copyType=null;
      command={kind:'delete-column',col:'note copy'};
    }
    command.xName=model.xName;
    counts[command.kind] = (counts[command.kind] || 0) + 1;
    await page.evaluate(command => {
      const S = window.PS_SHELL;
      if (command.kind === 'paste') {
        S.setGridSelection(command.xName, command.row, command.xName, command.row);
        S.pasteMatrix([[command.value]]);
      } else if (command.kind === 'formula') {
        const result = S.saveComputedColumn('a', command.xName+' + '+command.delta, 'a');
        if (!result.ok) throw Error(result.error);
      } else if (command.kind === 'filter') {
        S.setFilters(command.threshold === null ? [] : [{ col: command.xName, op: 'ge', value: String(command.threshold) }]);
      } else if (command.kind === 'exclude') S.setExcludedRows([command.row], command.on);
      else if(command.kind==='type') S.setColType('note', command.type);
      else if(command.kind==='row') {S.setGridSelection(command.xName,command.row,command.xName,command.row);S.runCommand(command.name);}
      else if(command.kind==='move') S.moveColumnBy('a',command.by);
      else if(command.kind==='rename') S.selectVariable(command.old);
      else if(command.kind==='insert-column') {S.selectVariable(command.reference);S.runCommand('data-insert-left');}
      else if(command.kind==='delete-column') S.deleteVariable(command.col);
      else if(command.kind==='grow') {S.setGridSelection(command.xName,command.row,command.xName,command.row);S.pasteMatrix(command.values.map(v=>[v]));}
      else if(command.kind==='cell-exclude') S.setExcluded(command.xName,command.row,command.on);
      else if(command.kind==='cycle') {const r=S.saveComputedColumn('a','c + 1','a');if(!r.ok) throw Error(r.error);}
      else if(command.kind==='duplicate-column') S.insertVariable('note',true);
    }, command);
    if(command.kind==='rename') {
      await page.locator('#ps-variable-name').fill(command.next);
      await page.locator('#ps-variable-name').press('Enter');
    }
    // Row insertion opens an editor; cancel it before later commands so no
    // implicit blur edit adds an unmodeled history step.
    await page.keyboard.press('Escape');
    await verify('step ' + step + ' ' + command.kind);
    // Undo and redo operate on whole snapshots, including prior unrelated
    // edits. Assert the independent before/after state at each boundary.
    {
      const after = clone(model);
      await page.evaluate(() => window.PS_SHELL.dataUndo());
      model = before; await verify('step ' + step + ' undo');
      await page.evaluate(() => window.PS_SHELL.dataRedo());
      model = after; await verify('step ' + step + ' redo');
    }
    if (step % 12 === 11) {
      await page.evaluate(() => {
        const S = window.PS_SHELL, result = S.openProjectText(S.projectFileText());
        if (!result.ok) throw Error(result.error);
      });
      await verify('step ' + step + ' save/reopen');
      await page.reload();
      await page.waitForFunction(() => !!window.PS_SHELL);
      await verify('step ' + step + ' autosave/reload');
    }
  }
  assert.deepEqual(errors, [], 'no uncaught browser errors'); checks++;
  console.log('WORKSPACE SEQUENCE PASS (' + checks + ' assertions; 216 edits, 216 undo/redo pairs, 18 save/reopen/reload cycles; ' + JSON.stringify(counts) + ')');
} finally { await browser.close(); }
