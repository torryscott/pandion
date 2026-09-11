"""80-digit cell-mean Wald contrasts, independent of R and the JS model fits.

Consumes exact binary64 observations serialized by the R fixture generator.
Decimal arithmetic covers SS/F/epsilon; scipy.stats.f.sf supplies tail areas.
No application code is imported. The package comparison remains separate.
"""
import itertools
import json
import sys
from decimal import Decimal as D, getcontext
from scipy.stats import f
import scipy
getcontext().prec = 80
src = sys.argv[1] if len(sys.argv) > 1 else '/tmp/pandion-anova-reference.json'
out = sys.argv[2] if len(sys.argv) > 2 else '/tmp/pandion-anova-precision.json'
refs = json.load(open(src))

def mean(v): return sum(v, D(0)) / len(v)
def solve(a, b):
    a = [row[:] + [v] for row, v in zip(a, b)]
    for j in range(len(b)):
        p = max(range(j, len(b)), key=lambda i: abs(a[i][j]))
        a[j], a[p] = a[p], a[j]
        assert a[j][j] != 0
        q = a[j][j]
        a[j] = [v / q for v in a[j]]
        for i in range(len(b)):
            if i != j:
                q = a[i][j]
                a[i] = [x-q*y for x, y in zip(a[i], a[j])]
    return [row[-1] for row in a]

def hypothesis(dims, cells, counts, means, subset):
    # Equal marginal means define Type III hypotheses for a complete
    # factorial model. Contrast each included level with its last level;
    # average over factors not included in the tested term.
    contrasts = []
    for indices in itertools.product(*(range(dims[j]-1) for j in subset)):
        row = []
        for cell in cells:
            v = D(1)
            for j, size in enumerate(dims):
                if j in subset:
                    i = indices[subset.index(j)]
                    v *= (1 if cell[j] == i else -1 if cell[j] == size-1 else 0)
                else: v /= size
            row.append(v)
        contrasts.append(row)
    cm = [sum((a*b for a,b in zip(row,means)),D(0)) for row in contrasts]
    cov = [[sum((a*b/n for a,b,n in zip(x,y,counts)),D(0)) for y in contrasts] for x in contrasts]
    sol = solve(cov,cm)
    return sum((a*b for a,b in zip(cm,sol)),D(0)), len(contrasts)

cases=[]
for case in refs['cases']:
    if case['expected']['status'] != 'ok':
        cases.append({'id':case['id'],'expected':case['expected']});continue
    dims=case['levels'][:]; k=case['k']; nb=len(dims)
    rows=[r for r in case['rows'] if all(v is not None for v in r['values']) and all(r.get(chr(65+j)) is not None for j in range(nb))]
    # Missing an entire level of the one between factor yields a smaller model.
    if case['id']=='mixed_empty_cell': dims=[len(set(r['A'] for r in rows))]
    cells=list(itertools.product(*(range(n) for n in dims)))
    data={cell:[] for cell in cells}
    for r in rows:
        data[tuple(r[chr(65+j)] for j in range(nb))].append([D.from_float(float(v)) for v in r['values']])
    counts=[D(len(data[c])) for c in cells]
    avg={c:[mean([r[j] for r in data[c]]) for j in range(k)] for c in cells}
    subj={c:[mean(r) for r in data[c]] for c in cells}
    msub=[mean(subj[c]) for c in cells]
    sseB=sum((sum(((v-mean(subj[c]))**2 for v in subj[c]),D(0)) for c in cells),D(0))*k
    errors=[]
    for c in cells:
        for r in data[c]:
            errors.append([r[j]-mean(r)-avg[c][j]+mean(avg[c]) for j in range(k)])
    sseW=sum((sum((v*v for v in row),D(0)) for row in errors),D(0))
    cross=[[sum((r[i]*r[j] for r in errors),D(0)) for j in range(k)] for i in range(k)]
    if k>1:
        eps=sum((cross[j][j] for j in range(k)),D(0))**2 / ((k-1)*sum((v*v for row in cross for v in row),D(0)))
    else: eps=D(1)
    terms=[]
    keymap={'A':'grp','B':'fac','AB':'gf'}
    for size in range(nb+1):
        for subset in itertools.combinations(range(nb),size):
            name=''.join(chr(65+j) for j in subset)
            if subset:
                ss,df=hypothesis(dims,cells,counts,msub,subset);ss*=k
                terms.append((name if k==1 else keymap[name],ss,sseB,D(df),D(len(rows)-len(cells)),D(1)))
            if k>1:
                # Trace of the hypothesis SSP after orthogonal projection
                # onto occasion contrasts (subtract each cell's mean).
                ss=sum((hypothesis(dims,cells,counts,[avg[c][j]-mean(avg[c]) for c in cells],subset)[0] for j in range(k)),D(0))
                df=1
                for j in subset: df*=dims[j]-1
                wn={'':'occ','A':'og','B':'of','AB':'ogf'}[name]
                terms.append((wn,ss,sseW,D(df*(k-1)),D((len(rows)-len(cells))*(k-1)),eps))
    expected=[]
    for key,ss,sse,df1,df2,ep in terms:
        F=(ss/df1)/(sse/df2)
        expected.append(dict(key=key,ss=float(ss),sse=float(sse),df1=float(df1*ep),df2=float(df2*ep),
                             F=float(F),p=float(f.sf(float(F),float(df1*ep),float(df2*ep))),eta=float(ss/(ss+sse)),eps=float(ep)))
    cases.append({'id':case['id'],'expected':dict(status='ok',n=len(rows),terms=expected)})
json.dump(dict(schemaVersion=1,arithmetic='Decimal(80)',scipy=scipy.__version__,seed=refs['seed'],cases=cases),open(out,'w'),indent=2,allow_nan=False)
print('ANOVA PRECISION REFERENCES:',len(cases),'cases; 80 digits; scipy',scipy.__version__)
