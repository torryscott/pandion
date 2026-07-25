# Help Me Choose - a graph chooser wizard with two routes:
#   * QUESTION route (no data needed): the student answers plain-language
#     prompts about what they want to show.
#   * DATA route (optional): if the student drops variables into the optional
#     "Variables you're considering" box, the .b.R classifies their types and
#     hands a small JSON summary to the wizard, which recommends a fitting
#     analysis + graph shortlist with a "why this fits YOUR variables" rationale.
#
# It draws NO chart. Self-contained HTML + inline JS; state lives in the iframe
# (resets if the analysis re-runs). helpmechoose_html(dataJson) injects the data
# summary (or "null"). ASCII-only, dash-free copy, matching house style.

helpmechoose_html <- function(dataJson = "null") {
    if (is.null(dataJson) || !nzchar(dataJson)) dataJson <- "null"
    # Neutralize any "</" so a variable name can never break out of <script>.
    dataJson <- gsub("</", "<\\/", dataJson, fixed = TRUE)
    template <- r"---(
<style>
  .hmc-wrap{font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#222;max-width:680px;line-height:1.5;}
  .hmc-h{display:flex;align-items:center;gap:9px;margin:2px 0 2px;}
  .hmc-badge{background:#0f766e;color:#fff;font-size:11px;font-weight:700;padding:3px 11px;border-radius:11px;letter-spacing:0.02em;}
  .hmc-sub{color:#666;font-size:12.5px;margin:0 0 14px;}
  .hmc-q{font-size:15px;font-weight:700;color:#1a3b38;margin:0 0 3px;}
  .hmc-qsub{color:#666;font-size:12px;margin:0 0 11px;}
  .hmc-opt{display:block;width:100%;text-align:left;box-sizing:border-box;cursor:pointer;background:#fff;border:1px solid #d9e2e0;border-left:3px solid #0f766e;border-radius:7px;padding:11px 13px;margin:0 0 9px;transition:background 90ms,border-color 90ms,box-shadow 90ms;}
  .hmc-opt:hover{background:#f1faf8;border-color:#0f766e;box-shadow:0 1px 4px rgba(15,118,110,0.12);}
  .hmc-opt .t{font-weight:650;font-size:13.5px;color:#173f3a;}
  .hmc-opt .d{color:#5e6c6a;font-size:12px;margin-top:2px;}
  .hmc-opt .arr{float:right;color:#0f766e;font-weight:700;}
  .hmc-crumbs{font-size:11.5px;color:#888;margin:0 0 12px;}
  .hmc-crumb{color:#0f766e;cursor:pointer;text-decoration:none;}
  .hmc-crumb:hover{text-decoration:underline;}
  .hmc-block{border:1px solid #b5ded6;border-radius:10px;margin:0 0 16px;background:#f7fbfa;overflow:hidden;}
  .hmc-block.hmc-alt{border-color:#d5dbda;background:#fafbfb;}
  .hmc-blockhead{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap;padding:10px 14px;background:#e4f2ee;border-bottom:1px solid #cbe5de;}
  .hmc-block.hmc-alt .hmc-blockhead{background:#eef1f0;border-bottom-color:#dee3e2;}
  .hmc-blockhead .lbl{font-size:11px;color:#4c6a65;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;}
  .hmc-blockhead .nm{font-size:17px;font-weight:800;color:#0f766e;}
  .hmc-block.hmc-alt .hmc-blockhead .nm{color:#3c5a54;}
  .hmc-blockbody{padding:11px 13px 5px;}
  .hmc-reclead{color:#3a4a48;font-size:12.5px;margin:0 0 9px;}
  .hmc-reclead b{color:#0f766e;}
  .hmc-open{color:#555;font-size:12px;margin:0 0 10px;}
  .hmc-open b{color:#0f766e;}
  .hmc-graph{background:#fff;border:1px solid #e4e9e8;border-radius:7px;padding:9px 12px;margin:0 0 8px;display:flex;gap:11px;align-items:center;}
  .hmc-graph .gt{flex-shrink:0;width:44px;height:32px;}
  .hmc-graph .gtxt{flex:1;min-width:0;}
  .hmc-graph .gn{font-weight:700;color:#1d4640;font-size:13px;}
  .hmc-graph .gw{color:#566;font-size:12px;margin-top:1px;}
  .hmc-tip{color:#5e6c6a;font-size:12px;background:#fff;border:1px dashed #cdddda;border-radius:7px;padding:9px 12px;margin:11px 0 0;}
  .hmc-tip b{color:#0f766e;}
  .hmc-actions{margin:14px 0 0;display:flex;gap:8px;flex-wrap:wrap;}
  .hmc-btn{cursor:pointer;font-size:12px;font-weight:650;border-radius:6px;padding:6px 14px;border:1px solid #0f766e;background:#fff;color:#0f766e;}
  .hmc-btn:hover{background:#0f766e;color:#fff;}
  .hmc-btn.solid{background:#0f766e;color:#fff;}
  .hmc-btn.solid:hover{background:#0b5e57;}
  .hmc-detected{background:#f7faff;border:1px solid #c9dcfb;border-radius:10px;margin:0 0 14px;overflow:hidden;}
  .hmc-dethead{display:flex;align-items:baseline;gap:9px;padding:8px 14px;background:#e7effd;border-bottom:1px solid #d5e2fb;}
  .hmc-dethead .lbl{font-size:11px;font-weight:700;color:#3c5488;text-transform:uppercase;letter-spacing:0.05em;}
  .hmc-dethead .cnt{margin-left:auto;font-size:11.5px;color:#5b6b8c;}
  .hmc-detbody{padding:9px 14px 10px;}
  .hmc-detlead{font-size:12px;color:#33415c;font-weight:600;margin:0 0 6px;}
  .hmc-var{font-size:12.5px;margin:2px 0;}
  .hmc-var .vn{font-weight:700;color:#1e293b;}
  .hmc-var .vt{color:#5b6b8c;font-size:11.5px;}
  .hmc-note{color:#173f3a;font-size:13px;margin:0 0 11px;}
  .hmc-warn{background:#fff7ed;border:1px solid #fed7aa;border-radius:7px;color:#7c2d12;font-size:12px;padding:8px 11px;margin:0 0 11px;}
  .hmc-cap{background:#fff4ed;border:1px solid #fcb88f;border-left:3px solid #d9670f;border-radius:7px;color:#7c3a06;font-size:12.5px;padding:9px 12px;margin:0 0 11px;}
  .hmc-cap b{color:#b4500e;}
  .hmc-switch{margin:0 0 9px;}
  .hmc-link{background:none;border:none;color:#0f766e;font-size:12px;cursor:pointer;padding:0;font-weight:600;}
  .hmc-link:hover{text-decoration:underline;}
  .hmc-hint{color:#5c6c69;font-size:11.5px;background:#fafefd;border:1px dashed #d4ebe6;border-radius:7px;padding:9px 12px;margin:13px 0 0;}
</style>
<div class="hmc-wrap" id="hmcRoot">
  <div class="hmc-h"><span class="hmc-badge">Help me choose</span></div>
  <div class="hmc-sub">Answer a couple of quick questions, or drop the exact variables you want to plot into the box on the left, and this will point you to the right Pandion Plots analysis and the chart types that fit.</div>
  <div id="hmcBody"></div>
</div>
<script>
(function(){
  var root = document.getElementById('hmcRoot'); if (!root) return;
  var body = document.getElementById('hmcBody');
  var HMC_DATA = __HMC_DATA__;

  var NODES = {
    root: {
      q: "What do you want your graph to show?",
      sub: "Pick the option closest to your goal.",
      opts: [
        { t:"Compare a measurement across groups", d:"Different subjects in each group (between-subjects), e.g. does the average score differ between conditions?", go:"cmp_detail" },
        { t:"Compare the same subjects across time or conditions", d:"Each subject measured more than once (within-subjects), e.g. before vs after treatment.", go:"L_rm" },
        { t:"Show the shape or spread of one numeric variable", d:"e.g. how are reaction times distributed?", go:"L_dist" },
        { t:"Show the relationship between two numeric variables", d:"e.g. does anxiety change as sleep changes?", go:"L_scatter" },
        { t:"Show counts or percentages of categories", d:"e.g. how many people chose each option?", go:"L_freq" },
        { t:"Show how several numeric variables relate to each other", d:"e.g. a correlation table across many measures", go:"L_corr" },
        { t:"Summarize survey or rating-scale items", d:"e.g. several agree-to-disagree (Likert) questions", go:"L_likert" }
      ]
    },
    cmp_detail: {
      q: "How much of the data do you want to show?",
      opts: [
        { t:"Just the summary", d:"One clean mean per group with error bars, or a median without them.", go:"L_cg_summary" },
        { t:"The full spread", d:"Show the distribution inside each group, not only the average.", go:"L_cg_dist" },
        { t:"Show me the options", d:"Not sure yet. Compare the choices side by side.", go:"L_cg_all" }
      ]
    }
  };

  var LEAVES = {
    L_dist: { module:"Distribution", lead:"To show how a single numeric variable is distributed:", graphs:[
      { n:"Histogram", k:"histogram", w:"Counts how many values fall in each bin. The go-to answer to 'what does my data look like?'" },
      { n:"Density", k:"density", w:"A smoothed version of the histogram; nice for comparing the shape across groups." },
      { n:"Box / Violin / Raincloud", k:"raincloud", w:"Summarize the distribution as median, spread, and outliers (split by group if you add one); the raincloud also shows every raw point." },
      { n:"Q-Q plot", k:"qq", w:"Check whether the values are roughly normal (they hug the line if so)." },
      { n:"ECDF", k:"ecdf", w:"Read off 'what fraction of the values are at or below X?'" }
    ]},
    L_scatter: { module:"Scatter", lead:"To show how two numeric variables relate:", graphs:[
      { n:"Scatter plot", k:"scatter", w:"One dot per observation. Look for trend, spread, and outliers; add a fit line for the overall pattern." },
      { n:"Heatmap", k:"heatmap", w:"Use this instead when you have so many points that the dots overlap and hide the dense areas." }
    ]},
    L_freq: { module:"Frequencies", lead:"To show counts or percentages of categories:", graphs:[
      { n:"Bar", k:"bar", w:"Compare counts across categories. The clearest, most precise option." },
      { n:"Pie / Donut", k:"pie", w:"Parts of a single whole. Best with no more than about 6 slices." },
      { n:"Pareto", k:"pareto", w:"Counts sorted largest to smallest with a running cumulative % line; find the few categories that dominate." }
    ]},
    L_corr: { module:"Correlation Matrix", lead:"To show how several numeric variables relate to each other:", graphs:[
      { n:"Heatmap", k:"corrheatmap", w:"Every pairwise correlation as a colored cell. Scan the grid for strong relationships." },
      { n:"Circles / Numbers / Mixed", k:"corrmixed", w:"Same matrix, shown as area-true circles, printed r values, or both at once." }
    ]},
    L_likert: { module:"Likert / Survey", lead:"To summarize a battery of rating-scale (Likert) items:", graphs:[
      { n:"Diverging stacked bar", k:"likertdiverging", w:"Each item centred on the middle, disagreement to the left and agreement to the right. Best for reading the balance of opinion." },
      { n:"100% stacked bar", k:"likertstacked", w:"Each item as a full-width bar split by response. Best for comparing the response mix." },
      { n:"Item means", k:"likertmeans", w:"One dot per item showing the average response, with a confidence interval." }
    ]},
    L_rm: { module:"Repeated Measures", lead:"To compare the same subjects measured more than once:", graphs:[
      { n:"Line", k:"line", w:"Joins each occasion so you can read the trend across time or conditions. Mean summaries can use a within-subject error correction; median summaries do not show error bars." },
      { n:"Bar", k:"bar", w:"A summary per occasion when a trend line is not the point." },
      { n:"Dot", k:"dot", w:"A mean at each occasion with a within-subject error bar, or a median without one, and no connecting trend line." },
      { n:"Box", k:"box", w:"Median, the middle 50%, and outliers at each occasion. Shows the spread a line or bar hides; each occasion is summarized on its own." },
      { n:"Violin", k:"violin", w:"The full distribution shape at each occasion; best with larger samples." },
      { n:"Raincloud", k:"raincloud", w:"Distribution, a small box, and every raw point at each occasion. Best when you want to show all the data." }
    ]},
    L_cg_summary: { module:"Compare Groups", lead:"To compare a clean summary across different groups:", graphs:[
      { n:"Bar", k:"bar", w:"A mean with error bars, or a median without them. Quick magnitude comparison." },
      { n:"Dot", k:"dot", w:"A mean with an error bar, or a median without one. Read by position, so it does not need a zero baseline." },
      { n:"Line", k:"line", w:"Only if your groups have a natural order (like dose or time); otherwise a bar reads more honestly." }
    ]},
    L_cg_dist: { module:"Compare Groups", lead:"To compare the full distribution across different groups:", graphs:[
      { n:"Box", k:"box", w:"Median, the middle 50%, and outliers. Good with a moderate sample." },
      { n:"Violin", k:"violin", w:"The full distribution shape; best with larger samples." },
      { n:"Raincloud", k:"raincloud", w:"Distribution, a small box, and every raw point at once. Best when you want to show all the data." }
    ]},
    L_cg_all: { module:"Compare Groups", lead:"All the ways to compare a number across groups:", graphs:[
      { n:"Bar", k:"bar", w:"Just the summary (mean/median). Simple, but hides the spread." },
      { n:"Line", k:"line", w:"Like a bar, but only when the groups are ordered (dose, time)." },
      { n:"Dot", k:"dot", w:"A mean with an error bar, or a median without one; no bar to imply length, no line to imply a trend." },
      { n:"Box", k:"box", w:"Shows the median, spread, and outliers." },
      { n:"Violin", k:"violin", w:"Shows the full distribution shape; wants a larger sample." },
      { n:"Raincloud", k:"raincloud", w:"Distribution plus every raw point. The most transparent option." }
    ]}
  };

  var LABELS = {
    root:"Start", cmp_detail:"Compare groups",
    L_dist:"Distribution", L_scatter:"Relationship", L_freq:"Counts",
    L_corr:"Correlations", L_likert:"Survey items", L_rm:"Repeated",
    L_cg_summary:"Summary", L_cg_dist:"Spread", L_cg_all:"Compare options"
  };

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // Tiny SVG previews for the graph shortlist (44x32; the same glyphs the
  // in-chart "Which graph?" tab shows). Decoration only.
  function thumb(name){
    var C='#0f766e', F='#8fbfb8', L='#d7ebe7', G='#999999', RD='#c96b6b', BL='#6b93c4', GY='#dcdcdc';
    function seg(x,y,w,f){ return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="6" fill="'+f+'"/>'; }
    function grid(cb){ var s=''; for (var r=0;r<3;r++) for (var q=0;q<3;q++) s+=cb(r,q,9+q*9,3.5+r*9); return s; }
    var T = {
      bar: '<rect x="5" y="14" width="8" height="13" fill="'+F+'"/><rect x="17" y="6" width="8" height="21" fill="'+C+'"/><rect x="29" y="17" width="8" height="10" fill="'+F+'"/><line x1="3" y1="27.5" x2="41" y2="27.5" stroke="'+G+'"/>',
      line: '<polyline points="5,24 15,12 26,17 39,6" fill="none" stroke="'+C+'" stroke-width="2"/><circle cx="5" cy="24" r="2.2" fill="'+C+'"/><circle cx="15" cy="12" r="2.2" fill="'+C+'"/><circle cx="26" cy="17" r="2.2" fill="'+C+'"/><circle cx="39" cy="6" r="2.2" fill="'+C+'"/>',
      dot: '<line x1="9" y1="7" x2="9" y2="23" stroke="'+C+'" stroke-width="1.6"/><circle cx="9" cy="15" r="2.8" fill="'+C+'"/><line x1="22" y1="3" x2="22" y2="17" stroke="'+C+'" stroke-width="1.6"/><circle cx="22" cy="10" r="2.8" fill="'+C+'"/><line x1="35" y1="11" x2="35" y2="27" stroke="'+C+'" stroke-width="1.6"/><circle cx="35" cy="19" r="2.8" fill="'+C+'"/><line x1="3" y1="29.5" x2="41" y2="29.5" stroke="'+G+'"/>',
      box: '<line x1="22" y1="3" x2="22" y2="29" stroke="'+C+'" stroke-width="1.4"/><line x1="17" y1="3" x2="27" y2="3" stroke="'+C+'" stroke-width="1.4"/><line x1="17" y1="29" x2="27" y2="29" stroke="'+C+'" stroke-width="1.4"/><rect x="13" y="11" width="18" height="11" fill="'+L+'" stroke="'+C+'" stroke-width="1.4"/><line x1="13" y1="15" x2="31" y2="15" stroke="'+C+'" stroke-width="2"/>',
      violin: '<path d="M22,3 C29,8 32,13 22,29 C12,13 15,8 22,3 Z" fill="'+L+'" stroke="'+C+'" stroke-width="1.4"/><line x1="18" y1="14" x2="26" y2="14" stroke="'+C+'" stroke-width="2"/>',
      raincloud: '<path d="M7,12 C13,2 31,2 37,12 L37,13 L7,13 Z" fill="'+L+'" stroke="'+C+'" stroke-width="1.2"/><rect x="13" y="16" width="18" height="5" fill="#ffffff" stroke="'+C+'" stroke-width="1.2"/><line x1="20" y1="16" x2="20" y2="21" stroke="'+C+'" stroke-width="1.6"/><circle cx="12" cy="27" r="1.7" fill="'+C+'"/><circle cx="19" cy="26" r="1.7" fill="'+C+'"/><circle cx="26" cy="28" r="1.7" fill="'+C+'"/><circle cx="33" cy="26" r="1.7" fill="'+C+'"/>',
      scatter: '<circle cx="8" cy="25" r="2" fill="'+C+'"/><circle cx="13" cy="19" r="2" fill="'+C+'"/><circle cx="18" cy="22" r="2" fill="'+F+'"/><circle cx="21" cy="13" r="2" fill="'+C+'"/><circle cx="27" cy="16" r="2" fill="'+F+'"/><circle cx="31" cy="9" r="2" fill="'+C+'"/><circle cx="36" cy="12" r="2" fill="'+F+'"/><circle cx="39" cy="5" r="2" fill="'+C+'"/>',
      heatmap: (function(){ var op=[[0.15,0.35,0.55,0.3],[0.4,0.9,0.7,0.45],[0.2,0.5,0.85,0.35]], s=''; for (var r=0;r<3;r++) for (var q=0;q<4;q++) s+='<rect x="'+(5+q*9)+'" y="'+(3+r*9)+'" width="8" height="8" fill="'+C+'" fill-opacity="'+op[r][q]+'"/>'; return s; })(),
      histogram: (function(){ var hs=[5,10,16,21,14,7], s=''; for (var q=0;q<6;q++) s+='<rect x="'+(4+q*6)+'" y="'+(27-hs[q])+'" width="6" height="'+hs[q]+'" fill="'+F+'"/>'; return s+'<line x1="3" y1="27.5" x2="41" y2="27.5" stroke="'+G+'"/>'; })(),
      density: '<path d="M3,28 C10,26 13,6 22,6 C31,6 34,26 41,28 Z" fill="'+L+'"/><path d="M3,28 C10,26 13,6 22,6 C31,6 34,26 41,28" fill="none" stroke="'+C+'" stroke-width="2"/>',
      qq: '<line x1="5" y1="27" x2="39" y2="5" stroke="'+G+'" stroke-width="1.4" stroke-dasharray="3,2"/><circle cx="7" cy="29.5" r="1.8" fill="'+C+'"/><circle cx="12" cy="23.5" r="1.8" fill="'+C+'"/><circle cx="17" cy="20" r="1.8" fill="'+C+'"/><circle cx="22" cy="16.5" r="1.8" fill="'+C+'"/><circle cx="27" cy="13" r="1.8" fill="'+C+'"/><circle cx="32" cy="9.5" r="1.8" fill="'+C+'"/><circle cx="38" cy="2.5" r="1.8" fill="'+C+'"/>',
      ecdf: '<path d="M4,29 L10,29 L10,24 L15,24 L15,20 L21,20 L21,15 L27,15 L27,10 L33,10 L33,5 L40,5" fill="none" stroke="'+C+'" stroke-width="2"/>',
      pie: '<circle cx="22" cy="16" r="12.5" fill="'+L+'" stroke="'+C+'" stroke-width="1.2"/><path d="M22,16 L22,3.5 A12.5,12.5 0 0 1 33.6,20.6 Z" fill="'+C+'"/>',
      pareto: '<rect x="5" y="7" width="6" height="20" fill="'+F+'"/><rect x="13" y="14" width="6" height="13" fill="'+F+'"/><rect x="21" y="19" width="6" height="8" fill="'+F+'"/><rect x="29" y="22" width="6" height="5" fill="'+F+'"/><line x1="3" y1="27.5" x2="41" y2="27.5" stroke="'+G+'"/><polyline points="8,13 16,8 24,5.5 32,4 38,3.5" fill="none" stroke="'+C+'" stroke-width="1.6"/><circle cx="8" cy="13" r="1.5" fill="'+C+'"/><circle cx="16" cy="8" r="1.5" fill="'+C+'"/><circle cx="24" cy="5.5" r="1.5" fill="'+C+'"/><circle cx="32" cy="4" r="1.5" fill="'+C+'"/>',
      corrheatmap: (function(){ var op=[[1,0.35,0.15],[0.35,1,0.6],[0.15,0.6,1]]; return grid(function(r,q,x,y){ return '<rect x="'+x+'" y="'+y+'" width="8" height="8" fill="'+C+'" fill-opacity="'+op[r][q]+'"/>'; }); })(),
      corrmixed: (function(){ var rr=[[0,2.2,1.2],[0,0,2.9],[0,0,0]], tx=[['','',''],['.4','',''],['-.2','.6','']]; return grid(function(r,q,x,y){ var s='<rect x="'+x+'" y="'+y+'" width="8" height="8" fill="'+C+'" fill-opacity="'+(r===q?0.3:0.08)+'"/>'; if (q>r) s+='<circle cx="'+(x+4)+'" cy="'+(y+4)+'" r="'+rr[r][q]+'" fill="'+C+'" fill-opacity="0.85"/>'; if (q<r) s+='<text x="'+(x+4)+'" y="'+(y+6.1)+'" font-size="5.5" font-family="sans-serif" fill="#14524b" text-anchor="middle">'+tx[r][q]+'</text>'; return s; }); })(),
      likertdiverging: seg(9,5,13,RD)+seg(22,5,15,BL)+seg(14,13,8,RD)+seg(22,13,10,BL)+seg(6,21,16,RD)+seg(22,21,7,BL)+'<line x1="22" y1="3" x2="22" y2="29" stroke="'+G+'"/>',
      likertstacked: seg(4,5,12,RD)+seg(16,5,9,GY)+seg(25,5,15,BL)+seg(4,13,8,RD)+seg(12,13,12,GY)+seg(24,13,16,BL)+seg(4,21,18,RD)+seg(22,21,8,GY)+seg(30,21,10,BL),
      likertmeans: '<line x1="10" y1="7" x2="27" y2="7" stroke="'+C+'" stroke-width="1.6"/><circle cx="18" cy="7" r="2.6" fill="'+C+'"/><line x1="16" y1="16" x2="34" y2="16" stroke="'+C+'" stroke-width="1.6"/><circle cx="25" cy="16" r="2.6" fill="'+C+'"/><line x1="8" y1="25" x2="22" y2="25" stroke="'+C+'" stroke-width="1.6"/><circle cx="15" cy="25" r="2.6" fill="'+C+'"/>'
    };
    var b = T[name];
    return b ? '<svg viewBox="0 0 44 32" width="44" height="32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">'+b+'</svg>' : '';
  }

  // One self-contained recommendation card: the analysis name is the HEADER
  // (always first), the "why this fits" rationale sits under it, then any
  // capacity caveats, the open-from-menu line, and the graph shortlist -
  // all inside one bordered block so each option reads as a single unit.
  // No ranking labels: the "Why this fits" / "Choose this instead if" leads
  // carry the reasoning so students weigh the options instead of defaulting
  // to a "best match" badge. opts: { alt: true, caps: [strings] }
  function leafBlock(L, note, opts){
    opts = opts || {};
    var h = '<div class="hmc-block'+(opts.alt?' hmc-alt':'')+'">';
    h += '<div class="hmc-blockhead"><span class="lbl">Use the analysis</span><span class="nm">'+esc(L.module)+'</span>';
    h += '</div><div class="hmc-blockbody">';
    if (note) h += '<div class="hmc-reclead"><b>'+(opts.alt?'Choose this instead if:':'Why this fits:')+'</b> '+esc(note)+'</div>';
    else h += '<div class="hmc-reclead">'+esc(L.lead)+'</div>';
    var caps = opts.caps || [];
    for (var ci=0; ci<caps.length; ci++) h += '<div class="hmc-cap">'+esc(caps[ci])+'</div>';
    h += '<div class="hmc-open">Open <b>'+esc(L.module)+'</b> from the <b>Pandion Plots</b> menu, then drop in your variables.</div>';
    for (var g=0; g<L.graphs.length; g++) {
      var th = thumb(L.graphs[g].k);
      h += '<div class="hmc-graph">'+(th?('<div class="gt">'+th+'</div>'):'')+'<div class="gtxt"><div class="gn">'+esc(L.graphs[g].n)+'</div><div class="gw">'+esc(L.graphs[g].w)+'</div></div></div>';
    }
    h += '</div></div>';
    return h;
  }
  function tipBlock(){ return '<div class="hmc-tip">Once the chart is open, click the <b>?</b> button (top-right of the chart) and use the <b>Which graph?</b> tab to switch between these, or <b>Check graph</b> to scan it for common pitfalls.</div>'; }
  // Grouping vs Panels: the one design decision every multi-categorical
  // chart forces, taught at the moment the student meets it. Grouped levels
  // share one panel and its axes (exact comparison); a panels variable
  // splits the chart into mini charts (pattern comparison). Shown on leaves
  // whose module actually has both slots (CAP.cat is finite and >= 2).
  function gpBlock(lead){
    return '<div class="hmc-tip"><b>Color grouping or panels?</b> '+esc(lead)+'grouped levels sit side by side in one panel and share every axis, so exact comparisons are easy. A panels variable draws a separate mini chart for each level, which is better for comparing overall patterns than exact values. Put the comparison you care about most in the grouping slot.</div>';
  }

  // ---------- question route ----------
  var path = ['root'];
  function crumbsHtml(){
    if (path.length < 2) return '';
    var parts = [];
    for (var i=0;i<path.length;i++){
      var lbl = LABELS[path[i]] || path[i];
      if (i < path.length-1) parts.push('<a class="hmc-crumb" data-back="'+i+'">'+esc(lbl)+'</a>');
      else parts.push('<span>'+esc(lbl)+'</span>');
    }
    return '<div class="hmc-crumbs">'+parts.join(' &rsaquo; ')+'</div>';
  }
  function renderQuestions(){
    var id = path[path.length-1];
    var html = '';
    if (HMC_DATA && HMC_DATA.hasVars) html += '<div class="hmc-switch"><button type="button" class="hmc-link" data-mode="data">&lsaquo; Back to the suggestion for my variables</button></div>';
    html += crumbsHtml();
    if (NODES[id]) {
      var n = NODES[id];
      html += '<div class="hmc-q">'+esc(n.q)+'</div>';
      if (n.sub) html += '<div class="hmc-qsub">'+esc(n.sub)+'</div>';
      for (var i=0;i<n.opts.length;i++){
        var o = n.opts[i];
        html += '<button type="button" class="hmc-opt" data-go="'+esc(o.go)+'"><span class="arr">&rsaquo;</span><div class="t">'+esc(o.t)+'</div>'+(o.d?'<div class="d">'+esc(o.d)+'</div>':'')+'</button>';
      }
    } else if (LEAVES[id]) {
      html += leafBlock(LEAVES[id]);
      if (CAP[id] && isFinite(CAP[id].cat) && CAP[id].cat >= 2)
        html += gpBlock('If you also have a second categorical variable (like gender or site): ');
      html += tipBlock();
      html += '<div class="hmc-actions"><button type="button" class="hmc-btn solid" data-restart="1">Start over</button>';
      if (path.length > 1) html += '<button type="button" class="hmc-btn" data-back="'+(path.length-2)+'">Back</button>';
      html += '</div>';
    }
    if (!(HMC_DATA && HMC_DATA.hasVars)) html += '<div class="hmc-hint">Tip: drop the exact variables you want to plot into the box on the left and this will recommend the analysis that fits them.</div>';
    body.innerHTML = html;
  }

  // ---------- data route ----------
  // The detected-variables box labels THEIR variables, so it leads with
  // jamovi's own measure-type words (matching the icons in the data
  // editor) and glosses each with the plain umbrella term the
  // recommendation notes are written in (numeric / categorical).
  function typeWord(t){ return ({nominal:'nominal (categorical)', ordinal:'ordinal (ordered categories)', continuous:'continuous (numeric)', manylevel:'categorical with many levels', other:'other type'})[t] || t; }
  // How many variables of each kind each analysis can actually plot at once
  // (its variable roles): cat = categorical role slots, num = numeric slots.
  // Used to add an honest "this chart cannot show all of them" caveat.
  var CAP = {
    L_dist:      { cat:2, num:1,        roles:'one numeric variable, plus up to two categorical (one for grouping, one for panels)' },
    L_scatter:   { cat:2, num:2,        roles:'exactly two numeric variables, plus up to two categorical (one for grouping, one for panels)' },
    L_freq:      { cat:3, num:0,        roles:'up to three categorical variables (one for the bars, one for the grouping, one for the panels)' },
    L_corr:      { cat:0, num:Infinity, roles:'numeric variables only' },
    // Likert items may be typed ordinal, nominal, OR continuous (numeric
    // codings and continuous scores both plot since Jul 2026), so neither
    // kind can overflow it - only the no-grouping-slot cap applies.
    L_likert:    { cat:Infinity, num:Infinity, roles:'a set of rating-scale items' },
    L_rm:        { cat:2, num:Infinity, roles:'your numeric columns as the occasions, plus up to two categorical (a between-subjects group and panels)' },
    L_cg_summary:{ cat:3, num:1,        roles:'one numeric outcome plus up to three categorical variables (the X axis, the grouping, and the panels)' },
    L_cg_dist:   { cat:3, num:1,        roles:'one numeric outcome plus up to three categorical variables (the X axis, the grouping, and the panels)' },
    L_cg_all:    { cat:3, num:1,        roles:'one numeric outcome plus up to three categorical variables (the X axis, the grouping, and the panels)' }
  };
  // Returns an honest caveat when the dropped-in set exceeds what the chosen
  // analysis can plot at once (more categoricals than it has slots, or more
  // numerics than it takes), else null. Names the actual variables so the
  // student knows exactly which ones to set aside for THIS route. A 0-slot
  // module dropping a whole kind (correlation takes no categoricals) is
  // by-design, not an overflow, but it ALWAYS gets its own note (Jul 2026
  // per Torry: a parenthetical aside undersold it - the student cannot even
  // ADD a categorical to Correlation Matrix, there is no slot for one).
  function capNote(leaf, cat, num, s){
    var cp = CAP[leaf]; if (!cp) return null;
    var overCat = (cp.cat > 0 && cp.cat !== Infinity && cat > cp.cat);
    var overNum = (cp.num !== Infinity && num > cp.num);
    var mod = (LEAVES[leaf] && LEAVES[leaf].module) ? LEAVES[leaf].module : 'This analysis';
    var catNames = [], numNames = [], vs = (s && s.vars) || [], i, v;
    for (i=0; i<vs.length; i++){ v = vs[i]; if (!v) continue;
      if (v.type==='nominal' || v.type==='ordinal') catNames.push(v.name);
      else if (v.type==='continuous') numNames.push(v.name); }
    if (!overCat && !overNum) {
      if (cp.cat === 0 && cat > 0 && catNames.length)
        return mod + ' uses numeric variables only and has no slot where a categorical variable can go, so it would plot ' + numNames.join(', ') + ' and leave out ' + catNames.join(', ') + ' (which is fine if ' + (catNames.length===1 ? (catNames[0] + ' is') : 'those are') + ' not part of this question).';
      if (cp.num === 0 && num > 0 && numNames.length)
        return mod + ' uses categorical variables only and has no slot where a numeric variable can go, so it would leave out ' + numNames.join(', ') + '.';
      return null;
    }
    var W = ['zero','one','two','three','four','five','six'];
    function word(n){ return (n>=0 && n<W.length) ? W[n] : String(n); }
    var msg = mod + ' can only use ' + cp.roles + ', so it cannot show all ' + (cat + num) + ' of your variables at once.';
    if (overCat) {
      msg += ' To go this route, pick the ' + (cp.cat===1 ? 'one categorical variable' : (word(cp.cat)+' categorical variables')) + ' that matter' + (cp.cat===1?'s':'') + ' most'
          + (catNames.length ? ' (yours: ' + catNames.join(', ') + ')' : '')
          + ' and leave the other' + ((cat - cp.cat)===1?'':'s') + ' out of the box.';
    }
    if (overNum) {
      msg += ' To go this route, keep just ' + (cp.num===1 ? 'one' : word(cp.num)) + ' of your numeric variables'
          + (numNames.length ? ' (' + numNames.join(', ') + ')' : '')
          + ' and leave the other' + ((num - cp.num)===1?'':'s') + ' out of the box.';
    }
    msg += ' Or make a separate chart for the ones you set aside.';
    return msg;
  }
  // True when this analysis can show the WHOLE dropped-in set at once: no
  // role-slot overflow and no whole-kind drop (a 0-slot cap fails cat > cp.cat
  // too). Keeps the too-many banner honest - it must never claim "no single
  // chart can show all N" while a displayed option actually can.
  function fitsAll(leaf, cat, num){
    var cp = CAP[leaf]; if (!cp) return false;
    if (cp.cat !== Infinity && cat > cp.cat) return false;
    if (cp.num !== Infinity && num > cp.num) return false;
    return true;
  }
  // Recommend the analysis whose variable ROLES actually fit the exact set the
  // student dropped in (not a mix-and-match of every chart possible). Key arity
  // rules: Compare Groups takes ONE numeric outcome; Scatter takes EXACTLY two
  // numerics; several numeric columns are Repeated Measures (the occasions) or a
  // Correlation Matrix (different measures), never Compare Groups/Scatter.
  function recommendFromData(s){
    var c = s.counts || {};
    var cat = (c.nominal||0) + (c.ordinal||0), num = (c.continuous||0), many = (c.manyLevel||0);
    var rep = !!s.repeatedLikely, lik = !!s.likertLikely;
    var warn = many>0 ? 'One or more of the variables has many distinct categories, so it looks like an ID (jamovi\'s ID measure type) or free text rather than something to plot. The suggestions below ignore those.' : null;
    function out(p, a, cp){ return { primary:p||null, alt:a||null, warn:warn, note:null, cap:cp||null }; }
    var catWord = (cat===1 ? 'your categorical variable' : (cat + ' categorical variables'));
    // Role phrasing that matches the actual variable slots: RM takes a
    // between-subjects group AND panels, so two categoricals both fit.
    var betweenNote = (cat===1 ? ', with your categorical variable as the between-subjects group'
                     : cat===2 ? ', with your two categorical variables as the between-subjects group and panels'
                     : cat>=3 ? ', with one categorical variable as the between-subjects group'
                     : '');
    var groupNote = (cat===1 ? ' (grouped by your categorical variable)'
                    : cat>=2 ? ' (using your categorical variables for grouping and panels)'
                    : '');
    var rmNote = 'your ' + num + ' numeric columns look like the SAME measure recorded at different times or conditions' + (rep ? ' (their names look sequential, like T1, T2, ...)' : '') + betweenNote;
    var corrNote = 'these ' + num + ' numeric variables are DIFFERENT measures and you want to see how they all relate';
    var bigN = (typeof s.n==='number' && s.n>=500);
    var scatNote = 'you have exactly two numeric variables, so a scatter plot shows how they relate' + groupNote + (bigN ? ('. With ' + s.n + ' rows the dots will pile up, so start with the Heatmap type inside Scatter') : '');
    // Battery membership ships exactly from R (likertNames), so the notes and
    // caveats below can talk about the ITEMS versus the tag-along variables
    // instead of treating every column of a kind as one homogeneous block.
    var bNames = (lik && s.likertNames && s.likertNames.length) ? s.likertNames : [];
    function inBattery(nm){ for (var b=0; b<bNames.length; b++) if (bNames[b]===nm) return true; return false; }
    // Vars OUTSIDE the battery, split by kind. Exact membership replaced the
    // old modal-level-count approximation, so a 5-level demographic beside a
    // 5-level battery is flagged correctly too.
    function lkExtras(){
      var ec=[], en=[], vs=(s.vars||[]), i, v;
      for (i=0;i<vs.length;i++){ v=vs[i]; if (!v || inBattery(v.name)) continue;
        if (v.type==='nominal'||v.type==='ordinal') ec.push(v.name);
        else if (v.type==='continuous') en.push(v.name); }
      return { cats:ec, nums:en };
    }
    function lkGroupCap(cats){
      return cats.length ? ('The Likert chart plots the battery items only; it has no grouping slot, so ' + cats.join(', ') + ' will not appear on it. To compare groups, make one chart per group (filter the data first), or compare a mean score across groups with Compare Groups.') : null;
    }
    function lkNumCap(nums){
      if (!nums.length) return null;
      var one = nums.length===1;
      return nums.join(', ') + (one?' does':' do') + ' not share the items\' response scale, so ' + (one?'it is not one of the battery items':'they are not battery items') + ' and will not appear on the Likert chart. Leave ' + (one?'it':'them') + ' out of the Items box and plot ' + (one?'it':'them') + ' separately if needed.';
    }
    function rmNumCap(nums){
      if (!nums.length) return null;
      var one = nums.length===1;
      return 'Repeated Measures reads every numeric column in its box as one of the occasions, so ' + nums.join(', ') + ' would be treated as ' + (one?'another measurement occasion':'more measurement occasions') + '. Leave ' + (one?'it':'them') + ' out of that box.';
    }
    function orNull(a){
      var f = [], i; for (i=0;i<a.length;i++) if (a[i]) f.push(a[i]);
      return f.length ? f : null;
    }
    if (lik && num===0) {
      // Categorical vars OUTSIDE the battery (a grouping demographic like
      // gender): the Likert chart has no grouping slot, so be honest that
      // they will not appear.
      var ex0 = lkExtras();
      return out(
        { leaf:'L_likert', note:'these look like rating-scale items that share one response scale' },
        null,
        orNull([lkGroupCap(ex0.cats)])
      );
    }
    // Numeric survey battery: survey items are usually TYPED continuous in
    // jamovi (so t-tests on their means run without retyping), but several
    // numeric columns sharing ONE small integer response scale are almost
    // certainly rating items, not measurement occasions. Sequential names
    // (q1, q2, ...) fit BOTH readings, so the repeated-measures reading
    // stays one card away as the alternative.
    if (lik && s.likertNumBattery === true && num >= 2) {
      var ex2 = lkExtras();
      var batN = num - ex2.nums.length;
      var lkK = (typeof s.likertK==='number' && s.likertK>1) ? s.likertK : null;
      // Battery-scoped count: with tag-along numerics (a q1..q5 battery plus
      // age) the note says "5 of your 6 numeric columns", never claiming the
      // stray column shares the scale.
      var colWord = (ex2.nums.length ? (batN + ' of your ' + num) : ('your ' + num)) + ' numeric columns share one small response scale' + (lkK ? (' (' + lkK + ' points)') : '');
      var likCaps = orNull([lkNumCap(ex2.nums), lkGroupCap(ex2.cats)]);
      // TIME-flavored sequential names (t1/t2, week1/week2, session1/...)
      // outweigh the shared scale: one rating recorded at several occasions
      // is repeated measures, so RM leads and the battery reading becomes
      // the alternative (carrying the no-grouping-slot caveat with it).
      // q/item-flavored or generic prefixes keep the battery reading first.
      // (repeatedTimeNames is battery-scoped R-side, so unrelated t1/t2
      // columns beside the battery can no longer trigger this flip.)
      if (rep && s.repeatedTimeNames === true) {
        return out(
          { leaf:'L_rm', note: colWord + ', but their names look like times or sessions, so they are probably ONE rating recorded at different occasions' + betweenNote },
          { leaf:'L_likert', note:'these columns are actually DIFFERENT rating-scale (Likert) items that happen to share the scale, not one measure over time', cap:likCaps },
          orNull([rmNumCap(ex2.nums)])
        );
      }
      return out(
        { leaf:'L_likert', note: colWord + ', so they look like rating-scale (Likert) survey items. The Likert chart reads them the same whether they are typed continuous or ordinal' },
        (rep ? { leaf:'L_rm', note:'these columns are actually ONE measure recorded at different times or conditions - sequential names fit both readings, so choose by what the columns mean', cap:orNull([rmNumCap(ex2.nums)]) }
             : { leaf:'L_corr', note:'these are DIFFERENT measures and you want to see how they all relate' }),
        likCaps
      );
    }
    // A detected battery with tag-along NUMERIC variables (a factor or mixed
    // battery plus e.g. age): the battery is still the strongest reading, so
    // Likert leads with honest caps naming what will not appear, and the
    // numerics' own natural chart is the alternative. Before Jul 2026 this
    // fell through to the plain arity rules, which silently dropped the
    // battery signal (4 factor items + age read as Compare Groups with the
    // items as grouping factors).
    if (lik && num >= 1) {
      var ex3 = lkExtras();
      var lkK3 = (typeof s.likertK==='number' && s.likertK>1) ? s.likertK : null;
      var itemsWord = (bNames.length && bNames.length <= 6) ? ('your variables ' + bNames.join(', ')) : (bNames.length + ' of your variables');
      var alt3;
      if (num===1) alt3 = { leaf:'L_cg_all', note:'you mainly want to compare ' + (ex3.nums.length===1 ? ex3.nums[0] : 'your numeric variable') + ' across the categories, rather than summarize the items' };
      else if (rep) alt3 = { leaf:'L_rm', note:'your numeric columns are one measure recorded at different times or conditions, and the rating items are not what you want to plot' };
      else if (num===2) alt3 = { leaf:'L_scatter', note:'you mainly want to see how ' + (ex3.nums.length===2 ? (ex3.nums[0] + ' and ' + ex3.nums[1]) : 'your two numeric variables') + ' relate, rather than summarize the items' };
      else alt3 = { leaf:'L_corr', note:'you mainly want to see how your numeric variables relate to each other, rather than summarize the items' };
      return out(
        { leaf:'L_likert', note: itemsWord + ' look like rating-scale (Likert) items that share one response scale' + (lkK3 ? (' (' + lkK3 + ' points)') : '') },
        alt3,
        orNull([lkNumCap(ex3.nums), lkGroupCap(ex3.cats)])
      );
    }
    if (num===0 && cat>=1) return out({ leaf:'L_freq', note:(cat===1 ? 'you have a single categorical variable, so a frequencies chart shows the count in each category'
        : 'your variables are all categorical, so a frequencies chart shows the counts' + (cat===2 ? ' (one variable as the bars, one as the grouping)' : ' (one as the bars, one as the grouping, one as the panels)')) });
    if (num===1 && cat===0) return out({ leaf:'L_dist', note:'you have one numeric variable, so a distribution plot shows its shape and spread' });
    if (num===1 && cat>=1) return out({ leaf:'L_cg_all', note:'you have one numeric outcome and ' + catWord + ', so you can compare that outcome across the categories'
        + (cat===2 ? ' (one on the X axis, one as the grouping)' : cat>=3 ? ' (one on the X axis, one as grouping, one as panels)' : '') });
    if (num===2) {
      if (rep) return out({ leaf:'L_rm', note:'your two numeric columns have sequential names, so they are probably one measure at two times or conditions' + betweenNote }, { leaf:'L_scatter', note:'you just want to see how the two numbers relate' + groupNote });
      return out({ leaf:'L_scatter', note:scatNote }, { leaf:'L_rm', note:'those two numbers are actually the same measure at two times or conditions (like before and after)' });
    }
    if (num>=3) {
      if (rep || cat>=1) return out({ leaf:'L_rm', note:rmNote }, { leaf:'L_corr', note:corrNote });
      return out({ leaf:'L_corr', note:'you have ' + num + ' numeric variables and no grouping variable, so a correlation matrix shows how they all relate at once' }, { leaf:'L_rm', note:'these are actually the same measure recorded at different times or conditions' });
    }
    return { primary:null, alt:null, warn:warn, note:'I could not match these variables to a single chart. Try the question route below.' };
  }
  function cap(t){ return t ? (t.charAt(0).toUpperCase() + t.slice(1)) : t; }
  function renderData(){
    var s = HMC_DATA, rec = recommendFromData(s), html = '';
    html += '<div class="hmc-detected"><div class="hmc-dethead"><span class="lbl">Your variables</span><span class="cnt">'+s.vars.length+' variable'+(s.vars.length===1?'':'s')+(s.n?(', '+s.n+' rows'):'')+'</span></div><div class="hmc-detbody">';
    html += '<div class="hmc-detlead">The suggestions below are matched to these:</div>';
    for (var i=0;i<s.vars.length;i++){ var v=s.vars[i]; html += '<div class="hmc-var"><span class="vn">'+esc(v.name)+'</span> <span class="vt">'+typeWord(v.type)+((v.levels&&v.levels>0)?(', '+v.levels+' levels'):'')+'</span></div>'; }
    html += '</div></div>';
    if (rec.warn) html += '<div class="hmc-warn">'+esc(rec.warn)+'</div>';
    var nCat = (s.counts ? ((s.counts.nominal||0) + (s.counts.ordinal||0)) : 0);
    var nNum = (s.counts ? (s.counts.continuous||0) : 0);
    if (rec.primary) {
      var cnP = capNote(rec.primary.leaf, nCat, nNum, s);
      var capsP = [];
      if (cnP) capsP.push(cnP);
      if (rec.cap) capsP = capsP.concat(rec.cap);
      // When even the BEST-fitting analysis cannot show everything, say so
      // up front; each card below then names the variables to set aside.
      // Stay honest, though: if the SECOND option holds the whole set (a
      // numeric battery plus one demographic - Repeated Measures takes all
      // the items as occasions AND the demographic as the group), point at
      // that card instead of claiming that no chart can.
      if (capsP.length) {
        if (rec.alt && !rec.alt.cap && fitsAll(rec.alt.leaf, nCat, nNum)) {
          var pMod = (LEAVES[rec.primary.leaf] && LEAVES[rec.primary.leaf].module) || 'The first option';
          var aMod = (LEAVES[rec.alt.leaf] && LEAVES[rec.alt.leaf].module) || 'the second option';
          html += '<div class="hmc-cap"><b>Heads up:</b> '+esc(pMod)+' cannot show all '+(nCat+nNum)+' of these variables at once, but '+esc(aMod)+' (the second option below) can. Each card tells you which variables fit.</div>';
        } else {
          html += '<div class="hmc-cap"><b>Heads up:</b> no single chart can show all '+(nCat+nNum)+' of these variables at once. Each option below tells you which ones fit and which to leave out.</div>';
        }
      }
      html += leafBlock(LEAVES[rec.primary.leaf], cap(rec.primary.note), { caps:capsP });
      if (rec.alt) {
        // The alt card always states its own context-specific fit -
        // including "has no slot for these by design" (banner or not).
        var cnA = capNote(rec.alt.leaf, nCat, nNum, s);
        var capsA = cnA ? [cnA] : [];
        if (rec.alt.cap) capsA = capsA.concat(rec.alt.cap);
        html += leafBlock(LEAVES[rec.alt.leaf], rec.alt.note, { alt:true, caps:capsA });
      }
      var gpCapP = CAP[rec.primary.leaf];
      if (nCat >= 2 && gpCapP && isFinite(gpCapP.cat) && gpCapP.cat >= 2)
        html += gpBlock('You have ' + (nCat===2 ? 'two' : nCat) + ' categorical variables to place: ');
      html += tipBlock();
    } else {
      html += '<div class="hmc-note">'+esc(rec.note || 'I could not match these variables to a single chart. Try the question route below.')+'</div>';
    }
    html += '<div class="hmc-actions"><button type="button" class="hmc-btn" data-mode="questions">Answer questions instead</button></div>';
    body.innerHTML = html;
  }

  var MODE = (HMC_DATA && HMC_DATA.hasVars) ? 'data' : 'questions';
  function render(){ if (MODE==='data') renderData(); else renderQuestions(); }

  body.addEventListener('click', function(e){
    var t = e.target;
    while (t && t!==body && !t.getAttribute('data-go') && !t.getAttribute('data-back') && !t.getAttribute('data-restart') && !t.getAttribute('data-mode')) t = t.parentNode;
    if (!t || t===body) return;
    var md = t.getAttribute('data-mode'); if (md){ MODE = md; if (md==='questions') path=['root']; render(); return; }
    if (t.getAttribute('data-restart')) { path=['root']; render(); return; }
    var bk = t.getAttribute('data-back'); if (bk!==null){ path = path.slice(0, parseInt(bk,10)+1); render(); return; }
    var go = t.getAttribute('data-go'); if (go){ path.push(go); render(); }
  });

  render();
})();
</script>
)---"
    sub("__HMC_DATA__", dataJson, template, fixed = TRUE)
}
