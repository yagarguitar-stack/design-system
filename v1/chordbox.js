/* yagarguitar-stack 共通デザイン v1 — コードの押さえ方の図（chordbox.js）
   ──────────────────────────────────────────────────────────────
   読み込むと DS.chordbox が使える。SVG の文字列を返すので、要素の innerHTML に入れるだけ。
   コード名から押さえ方を出す働き（find）には theory.js が要る。描くだけなら無くても動く。

     el.innerHTML = DS.chordbox.svg('C');                        // コード名から（いちばん上の候補を描く）
     el.innerHTML = DS.chordbox.svg('x32010', {chord:'C'});      // 押さえ方を直接
     el.innerHTML = DS.chordbox.svg('133211', {fingers:'134211', orient:'h'});
     DS.chordbox.find('Am7');        // 押さえ方の候補の一覧（表の形 → 探した形）
     DS.chordbox.mount(el, 'G7');    // 描いて、叩くと鳴る（sound.js がある時）

   ══ 弦の数え方 ══
   配列の 0＝6弦 … 5＝1弦（theory.js・fretboard.js・notation.js と同じ並び）。
   文字で書く時も左から 6弦→1弦：'x32010'。10フレット以上がある時は区切る：'10-12-12-11-10-10'
   x＝鳴らさない、0＝開放。指番号は 1＝人差し指 … 4＝小指、0 か x＝押さえない。

   ══ 標準の見た目 ══
   縦向き・教本風（白い紙に黒）・丸の中は音名。
     orient : 'v'（縦）／'h'（横。1弦が上＝TAB譜・指板の図と同じ）
     look   : 'book'（教本風）／'paper'（白い紙＋度数の色）／'ebony'（指板そのまま）
     label  : 'note'（音名）／'finger'（指番号）／'deg'（度数）／'none'
     title  : true でコード名を上に書く（コードが分かる時は標準で書く）。文字を渡せばその文字
     names  : 各弦の音名を図の外に書く（標準 true）
     rows   : 描くフレットの数（標準 5。押さえがはみ出す時は自動で広げる）
     base   : 一番上（横なら左）のフレット。省くと自動（5フレットまでに収まれば 1＝ナットを描く）
     hit    : true で、叩ける透明な的（class="cbhit" data-s data-f）を置く

   ══ 押さえ方の探し方（find）══
   1. 内蔵の表：開放弦を使う定番の形と、6弦・5弦・4弦ルートの動かせる形
   2. 表に無い分は自動で探す。決まり：
      届く幅は4フレット以内（開放弦は数えない）／押さえる指は4本まで（セーハは1本と数える）／
      一番低い音はルート（分数コードは指定の低音）／3度と7度は必ず入れ、完全5度は省いてよい／
      テンションは必ず入れる（どうしても入らない時だけ 11・13 のコードで 9 や 11 を省き、omit に書く）／
      鳴らす弦は4本以上（パワーコードは2本以上）／ミュートは弦の端から、途中のミュートは1本まで／
      指番号も自動で振る
   並べ順は「表の形 → 低いポジション → 押さえやすさ」。
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  var G = (typeof window !== 'undefined') ? window : globalThis;
  var DS = G.DS = G.DS || {};
  var STD = [40,45,50,55,59,64];
  var FONT = "'Zen Kaku Gothic New',-apple-system,'Helvetica Neue',Arial,sans-serif";
  var SHARP = ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];     /* theory.js が無い時の綴り（ギター譜の慣用） */
  var DEG = ['R','♭2','2','♭3','3','4','♭5','5','♭6','6','♭7','7'];
  /* 度数ごとの色（fretboard.js と同じ）：ルート・3度・5度。そのほかは灰 */
  function degColor(iv){ return {0:'#d9493a',3:'#d9a51c',4:'#d9a51c',7:'#4a8fcf'}[iv] || '#8a8680'; }

  var LOOK = {
    book: {bg:'#ffffff', ink:'#1a1a1a', sub:'#5a5a5a', grid:'#1a1a1a', nut:'#1a1a1a', board:null, fretW:1.2, strW:function(){return 1.2;}, strCol:function(){return '#1a1a1a';},
           dot:function(){return '#1a1a1a';}, dotText:'#ffffff', bar:'#1a1a1a', barOp:1, mark:'#333333'},
    paper:{bg:'#faf6ee', ink:'#2a2320', sub:'#6b5d50', grid:'#3a332c', nut:'#2a2320', board:null, fretW:1.2, strW:function(){return 1.2;}, strCol:function(){return '#3a332c';},
           dot:function(iv){return degColor(iv);}, dotText:'#ffffff', bar:'#7a6a58', barOp:.55, mark:'#5a4d40'},
    ebony:{bg:'#1d1815', ink:'#e8dccb', sub:'#b8a596', grid:'#cfc6b4', nut:'#efe6d2', board:'#2a2320', fretW:2.4,
           strW:function(k){return [3.2,2.7,2.2,1.8,1.4,1.1][k];}, strCol:function(k){return k<4?'#c9a24b':'#d4d6d8';},
           dot:function(iv){return degColor(iv);}, dotText:'#ffffff', bar:'#e8b53a', barOp:.55, mark:'#b8a596'}
  };

  function T(){ return DS.theory || null; }
  function mod(n,m){ return ((n%m)+m)%m; }
  function f2(n){ return (+n).toFixed(1).replace(/\.0$/,''); }
  function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function tuningOf(t){
    if(!t) return STD.slice();
    if(Array.isArray(t)) return t.map(function(x){ return typeof x==='number' ? x : (T() ? T().midi(x) : null); });
    if(T()){ var o = T().tuning(t); if(o) return o.midi.slice(); }
    return STD.slice();
  }

  /* ───────── 押さえ方を読む ───────── */
  function splitCells(s){
    s = String(s).trim();
    if(/[-,\s\/]/.test(s)) return s.split(/[-,\s\/]+/).filter(function(x){return x!=='';});
    return s.split('');
  }
  function readFrets(s){
    if(Array.isArray(s)) return s.map(function(v){ return (v==null||v==='x'||v==='X'||v<0) ? -1 : +v; });
    var a = splitCells(s).map(function(c){ return /^[xX×]$/.test(c) ? -1 : (/^\d+$/.test(c) ? +c : NaN); });
    return a.some(isNaN) ? null : a;
  }
  function readFingers(s, n){
    if(s==null) return null;
    var a = Array.isArray(s) ? s.slice() : splitCells(s);
    a = a.map(function(c){ return (c==null||/^[xX×\-]$/.test(String(c))) ? 0 : (+c||0); });
    return a.length===n ? a : null;
  }
  /* どの形で渡されても {frets, fingers, base} にそろえる。読めない時は null */
  function parse(x, opts){
    opts = opts || {};
    if(x==null) return null;
    var fr, fi = null, base = null, extra = {};
    if(typeof x==='object' && !Array.isArray(x)){
      fr = readFrets(x.frets); if(!fr) return null;
      fi = readFingers(x.fingers, fr.length); base = x.base || null;
      ['chord','from','label','omit'].forEach(function(k){ if(x[k]!=null) extra[k]=x[k]; });
    } else {
      fr = readFrets(x); if(!fr) return null;
    }
    if(opts.fingers!=null) fi = readFingers(opts.fingers, fr.length);
    var n = tuningOf(opts.tuning).length;
    if(fr.length!==n) return null;
    var o = {frets:fr, fingers:fi || fingerOf(fr) || fr.map(function(){return 0;}), base:base};
    for(var k in extra) o[k]=extra[k];
    return o;
  }

  /* ───────── 指番号を自動で振る ─────────
     1〜4 の指を押さえる音に割り当て、決まりを守る中で一番楽な振り方を選ぶ。
     決まり：低いフレットほど若い指／違うフレットを同じ指で押さえない／
     同じ指で複数の弦＝セーハ（人差し指は間の弦がそれ以上のフレットなら可、ほかの指は間の弦も同じフレット）。
     振れない（＝指が足りない・届かない）時は null */
  function fingerOf(frets){
    var idx = [], i;
    for(i=0;i<frets.length;i++) if(frets[i]>0) idx.push(i);
    var out = frets.map(function(){return 0;});
    if(!idx.length) return out;
    if(idx.length > 12) return null;
    var minF = Math.min.apply(null, idx.map(function(i){return frets[i];}));
    /* 開放弦を鳴らすローポジションでは、人差し指を1フレットに置いた構えを基準にする */
    var hasOpen = frets.some(function(v){return v===0;});
    var anchor = (hasOpen && minF<=2) ? 1 : minF;
    var best = null, bestCost = 1e9, as = new Array(idx.length);

    function check(){
      var fing = {}, j, k, cost = 0;
      for(j=0;j<idx.length;j++){ var f = as[j]; (fing[f] = fing[f] || []).push(idx[j]); }
      var used = Object.keys(fing).map(Number).sort(function(a,b){return a-b;});
      var fretOf = {};
      for(j=0;j<used.length;j++){
        var fn = used[j], ss = fing[fn], fv = frets[ss[0]];
        for(k=1;k<ss.length;k++) if(frets[ss[k]]!==fv) return;         /* 同じ指で違うフレット */
        fretOf[fn] = fv;
        if(ss.length>1){
          var lo = Math.min.apply(null,ss), hi = Math.max.apply(null,ss);
          for(k=lo;k<=hi;k++){
            var v = frets[k];
            if(fn===1){ if(v < fv) return; }                              /* 人差し指のセーハ：間は同じか高いフレット */
            else if(v !== fv) return;                                    /* ほかの指：間も同じフレット */
          }
          cost += (fn===1 ? (hasOpen ? 2.2 : 1.2) : 1.8) + (hi-lo)*0.05;
        }
      }
      /* 低いフレットほど若い指、届く幅 */
      for(j=0;j<used.length;j++) for(k=j+1;k<used.length;k++){
        var a = used[j], b = used[k], fa = fretOf[a], fb = fretOf[b];
        if(fa > fb) return;
        var reach = fb - fa, span = b - a;
        if(reach > span + 1) return;                                     /* 指の開きの限界 */
        if(reach > span) cost += 2.5;                                    /* ストレッチ */
      }
      /* 1フレットに1本の指が基本 */
      for(j=0;j<idx.length;j++){ var d = as[j] - Math.min(4, frets[idx[j]]-anchor+1); cost += d>=0 ? d*0.6 : -d*1.0; }
      /* 同じフレットで指が違う時は、低い弦ほど若い指 */
      for(j=0;j<idx.length;j++) for(k=j+1;k<idx.length;k++){
        if(frets[idx[j]]===frets[idx[k]] && as[j]!==as[k] && as[j]>as[k]) cost += 0.8;
      }
      if(cost < bestCost){ bestCost = cost; best = as.slice(); }
    }
    (function rec(p){
      if(p===idx.length){ check(); return; }
      for(var f=1; f<=4; f++){ as[p]=f; rec(p+1); }
    })(0);
    if(!best) return null;
    for(i=0;i<idx.length;i++) out[idx[i]] = best[i];
    out._cost = bestCost;
    return out;
  }

  /* 指番号からセーハを割り出す [{finger, fret, from, to}]（from/to は弦の番号 0〜5） */
  function barresOf(frets, fingers){
    var by = {}, res = [];
    for(var i=0;i<frets.length;i++){ var f = fingers[i]; if(f>0 && frets[i]>0){ (by[f]=by[f]||[]).push(i); } }
    Object.keys(by).forEach(function(k){
      var ss = by[k]; if(ss.length<2) return;
      var fv = frets[ss[0]]; if(ss.some(function(s){return frets[s]!==fv;})) return;
      var lo = Math.min.apply(null,ss), hi = Math.max.apply(null,ss);
      for(var s=lo;s<=hi;s++){ if(frets[s] < fv) return; }
      res.push({finger:+k, fret:fv, from:lo, to:hi});
    });
    return res;
  }

  /* 鳴る音の番号（弦ごと。鳴らさない弦は null） */
  function notesOf(shape, opts){
    opts = opts || {};
    var s = parse(shape, opts); if(!s) return null;
    var tu = tuningOf(opts.tuning), capo = opts.capo|0;
    return s.frets.map(function(f,i){ return f<0 ? null : tu[i]+capo+f; });
  }

  /* ───────── 内蔵の表 ───────── */
  /* 開放弦を使う定番の形：[コード名, 押さえ, 指番号] */
  var OPEN_SHAPES = [
    ['C','x32010','x32010'],['C7','x32310','x32410'],['CM7','x32000','x32000'],['Cadd9','x32033','x21034'],
    ['D','xx0232','xx0132'],['Dm','xx0231','xx0231'],['D7','xx0212','xx0213'],['DM7','xx0222','xx0111'],['Dm7','xx0211','xx0211'],
    ['Dsus4','xx0233','xx0134'],['Dsus2','xx0230','xx0130'],
    ['E','022100','023100'],['Em','022000','023000'],['E7','020100','020100'],['EM7','021100','031200'],['Em7','020000','020000'],
    ['Esus4','022200','023400'],['E7sus4','020200','020300'],
    ['FM7','xx3210','xx3210'],
    ['G','320003','210003'],['G7','320001','320001'],['GM7','320002','320001'],['G6','320000','210000'],
    ['A','x02220','x01230'],['Am','x02210','x02310'],['A7','x02020','x02030'],['AM7','x02120','x02130'],['Am7','x02010','x02010'],
    ['Asus4','x02230','x01240'],['Asus2','x02200','x01200'],['A7sus4','x02030','x02030'],
    ['B7','x21202','x21304']
  ];
  /* 動かせる形：ルートの弦ごとに、ルートのフレットからのずれ（x＝鳴らさない）と指番号 */
  var MOVE = {
    0: { /* 6弦ルート（E型） */
      maj:[[0,2,2,1,0,0],[1,3,4,2,1,1]], min:[[0,2,2,0,0,0],[1,3,4,1,1,1]], dom7:[[0,2,0,1,0,0],[1,3,1,2,1,1]],
      maj7:[[0,'x',1,1,0,'x'],[1,0,3,4,2,0]], min7:[[0,2,0,0,0,0],[1,3,1,1,1,1]], m7b5:[[0,'x',0,0,-1,'x'],[2,0,3,4,1,0]],
      dim7:[[0,'x',-1,0,-1,'x'],[2,0,1,3,1,0]], aug:[[0,'x',2,1,1,'x'],[1,0,4,2,3,0]], sus4:[[0,2,2,2,0,0],[1,2,3,4,1,1]],
      dom7sus4:[[0,2,0,2,0,0],[1,3,1,4,1,1]], dom6:[[0,'x',-1,1,0,'x'],[2,0,1,4,3,0]], min6:[[0,'x',-1,0,0,'x'],[2,0,1,3,4,0]],
      pow:[[0,2,2,'x','x','x'],[1,3,4,0,0,0]]
    },
    1: { /* 5弦ルート（A型） */
      maj:[['x',0,2,2,2,0],[0,1,2,3,4,1]], min:[['x',0,2,2,1,0],[0,1,3,4,2,1]], dom7:[['x',0,2,0,2,0],[0,1,3,1,4,1]],
      maj7:[['x',0,2,1,2,0],[0,1,3,2,4,1]], min7:[['x',0,2,0,1,0],[0,1,3,1,2,1]], m7b5:[['x',0,1,0,1,'x'],[0,1,3,2,4,0]],
      dim7:[['x',0,1,-1,1,'x'],[0,2,3,1,4,0]], aug:[['x',0,-1,-2,-2,'x'],[0,4,3,1,2,0]], sus4:[['x',0,2,2,3,0],[0,1,2,3,4,1]],
      dom7sus4:[['x',0,2,0,3,0],[0,1,3,1,4,1]], dom6:[['x',0,2,2,2,2],[0,1,3,3,3,3]], dom9:[['x',0,-1,0,0,0],[0,2,1,3,3,3]],
      pow:[['x',0,2,2,'x','x'],[0,1,3,4,0,0]]
    },
    2: { /* 4弦ルート（D型） */
      maj:[['x','x',0,2,3,2],[0,0,1,2,4,3]], min:[['x','x',0,2,3,1],[0,0,1,3,4,2]], dom7:[['x','x',0,2,1,2],[0,0,1,3,2,4]],
      maj7:[['x','x',0,2,2,2],[0,0,1,3,3,3]], min7:[['x','x',0,2,1,1],[0,0,1,3,2,2]], m7b5:[['x','x',0,1,1,1],[0,0,1,2,2,2]],
      dim7:[['x','x',0,1,0,1],[0,0,1,3,2,4]], sus4:[['x','x',0,2,3,3],[0,0,1,2,3,4]], dom7sus4:[['x','x',0,2,1,3],[0,0,1,3,2,4]],
      dom6:[['x','x',0,2,0,2],[0,0,1,3,1,4]], min6:[['x','x',0,2,0,1],[0,0,1,3,1,2]],
      pow:[['x','x',0,2,3,'x'],[0,0,1,3,4,0]]
    }
  };
  var ROOT_LABEL = {0:'6弦ルート',1:'5弦ルート',2:'4弦ルート'};
  var openIndex = null;
  function buildOpenIndex(){
    if(openIndex || !T()) return openIndex;
    openIndex = {};
    OPEN_SHAPES.forEach(function(r){
      var c = T().chord(r[0]); if(!c) return;
      var key = c.rootPc+':'+c.type;
      (openIndex[key] = openIndex[key] || []).push({frets:readFrets(r[1]), fingers:readFingers(r[2],6), from:'table', label:'開放弦'});
    });
    return openIndex;
  }
  function tableShapes(c, maxFret){
    var out = [];
    if(!c || c.bass!=null || (c.tensions && c.tensions.length)) return out;   /* 分数コード・足したテンションは探す方で */
    var oi = buildOpenIndex() || {};
    (oi[c.rootPc+':'+c.type] || []).forEach(function(s){ out.push({frets:s.frets.slice(), fingers:s.fingers.slice(), from:'table', label:s.label}); });
    [0,1,2].forEach(function(rs){
      var m = MOVE[rs][c.type]; if(!m) return;
      var offs = m[0], fing = m[1];
      var nums = offs.filter(function(v){return v!=='x';}), lo = Math.min.apply(null,nums), hi = Math.max.apply(null,nums);
      var r0 = mod(c.rootPc - STD[rs], 12);
      [r0, r0+12].forEach(function(r){
        if(r===0 || r+lo < 1 || r+hi > maxFret) return;
        out.push({frets:offs.map(function(v){return v==='x'?-1:r+v;}), fingers:fing.slice(), from:'table', label:ROOT_LABEL[rs]});
      });
    });
    return out;
  }

  /* ───────── 自動で探す ───────── */
  function need(c, relax){
    /* 必ず入れる音と、省いてよい音（半音の数 0〜11） */
    var req = {}, opt = {}, omitted = [];
    var has11 = c.labels.some(function(l){return /11$/.test(l);}), has13 = c.labels.some(function(l){return /13$/.test(l);});
    c.labels.forEach(function(l,i){
      var pc = c.pcs[i];
      if(l==='5' && c.type!=='pow') opt[pc]=1;
      else if(relax && /9$/.test(l) && (has11||has13)){ opt[pc]=1; omitted.push(l); }
      else if(relax && l==='11' && has13){ opt[pc]=1; omitted.push(l); }
      else req[pc]=1;
    });
    Object.keys(req).forEach(function(p){ delete opt[p]; });
    return {req:req, opt:opt, omitted:omitted};
  }
  function search(c, opts){
    var tu = tuningOf(opts.tuning), n = tu.length, maxF = opts.maxFret || 15;
    var bassPc = c.bassPc!=null ? c.bassPc : c.rootPc;
    var isPow = c.type==='pow', minStr = isPow ? 2 : 4, maxStr = isPow ? 3 : n;
    function run(relax){
      var nd = need(c, relax), allowed = {};
      Object.keys(nd.req).concat(Object.keys(nd.opt)).forEach(function(p){ allowed[p]=1; });
      allowed[bassPc] = 1;
      var found = {}, list = [];
      for(var w=1; w<=maxF-3; w++){
        var choice = [];
        for(var s=0;s<n;s++){
          var ch = [-1];
          if(allowed[mod(tu[s],12)]) ch.push(0);
          for(var f=w; f<=w+3; f++) if(allowed[mod(tu[s]+f,12)]) ch.push(f);
          choice.push(ch);
        }
        var cur = new Array(n);
        (function rec(s){
          if(s===n){ test(cur.slice()); return; }
          for(var i=0;i<choice[s].length;i++){ cur[s]=choice[s][i]; rec(s+1); }
        })(0);
      }
      function test(fr){
        var snd = [], k, lo=-1, hi=-1;
        for(k=0;k<n;k++) if(fr[k]>=0){ snd.push(k); if(lo<0) lo=k; hi=k; }
        if(snd.length<minStr || snd.length>maxStr) return;
        var inner = 0; for(k=lo;k<=hi;k++) if(fr[k]<0) inner++;
        if(inner>1) return;
        var low = null, pcs = {};
        snd.forEach(function(k){ var m = tu[k]+fr[k]; pcs[mod(m,12)]=1; if(low==null||m<low) low=m; });
        if(mod(low,12)!==bassPc) return;
        for(var p in nd.req) if(!pcs[p]) return;
        var fretted = snd.filter(function(k){return fr[k]>0;}).map(function(k){return fr[k];});
        if(fretted.length && Math.max.apply(null,fretted)-Math.min.apply(null,fretted) > 3) return;
        var key = fr.join(','); if(found[key]) return;
        var fi = fingerOf(fr); if(!fi) return;
        found[key]=1;
        var pos = fretted.length ? Math.min.apply(null,fretted) : 0;
        var opens = snd.filter(function(k){return fr[k]===0;}).length;
        var cost = (fi._cost||0) + inner*2 + (n-snd.length)*0.9 + (opens ? (pos>4 ? 3 : -0.3*opens) : 0);
        list.push({frets:fr, fingers:fi.slice(), from:'search', pos:pos, cost:cost, snd:snd.length, omit:nd.omitted.slice()});
      }
      return list;
    }
    var list = run(false);
    if(!list.length) list = run(true);
    /* 同じ押さえで弦を減らしただけの形は、弦の多い方に含める */
    var keep = list.filter(function(a){
      return !list.some(function(b){
        if(b===a || b.snd<=a.snd) return false;
        for(var k=0;k<a.frets.length;k++){ if(a.frets[k]>=0 && a.frets[k]!==b.frets[k]) return false; }
        return true;
      });
    });
    keep.sort(function(a,b){ return (a.pos-b.pos) || (a.cost-b.cost); });
    return keep;
  }
  function posOf(fr){ var f = fr.filter(function(v){return v>0;}); return f.length ? Math.min.apply(null,f) : 0; }

  /* コード名（または theory.js のコード）から押さえ方の候補を返す。
     opts：max（最大の数、標準 12）／maxFret（標準 15）／table:false（表を使わない）／search:false（探さない）／tuning */
  var memo = {};
  function find(name, opts){
    opts = opts || {};
    if(!T()) return [];
    var c = (name && name.semis) ? name : T().chord(String(name||''));
    if(!c || c.nc) return [];
    var mk = c.rootPc+'|'+c.type+'|'+c.bassPc+'|'+c.tensions.join()+'|'+JSON.stringify([opts.max,opts.maxFret,opts.table,opts.search,opts.tuning]);
    if(memo[mk]) return memo[mk].map(function(s){ return JSON.parse(JSON.stringify(s)); });
    var r = find0(c, opts); memo[mk] = r;
    return r.map(function(s){ return JSON.parse(JSON.stringify(s)); });
  }
  function find0(c, opts){
    var max = opts.max || 12, maxF = opts.maxFret || 15, std = !opts.tuning || tuningOf(opts.tuning).join()===STD.join();
    var tab = (opts.table===false || !std) ? [] : tableShapes(c, maxF);
    tab.sort(function(a,b){ return posOf(a.frets)-posOf(b.frets); });
    var seen = {}; tab = tab.filter(function(s){ var k=s.frets.join(); if(seen[k]) return false; seen[k]=1; return true; });
    var res = tab.slice();
    if(opts.search!==false){
      search(c, opts).forEach(function(s){ if(!seen[s.frets.join()]){ seen[s.frets.join()]=1; res.push(s); } });
    }
    return res.slice(0, max).map(function(s){
      var o = {frets:s.frets, fingers:s.fingers, from:s.from, chord:c.name};
      if(s.label) o.label = s.label;
      if(s.omit && s.omit.length) o.omit = s.omit;
      return o;
    });
  }

  /* ───────── 描く ───────── */
  function context(shape, opts){
    /* 音名と度数の書き方を決める。コードが分かればその綴り、分からなければ音から当てる */
    var th = T(), c = null;
    var ch = opts.chord || shape.chord;
    if(th && ch) c = ch.semis ? ch : th.chord(String(ch));
    var mids = notesOf(shape, opts).filter(function(m){return m!=null;});
    if(th && !c && opts.guess!==false && mids.length>=2){ var id = th.identify(mids); if(id.length) c = th.chord(id[0].name); }
    var spell = {}, deg = {}, root = null;
    if(c && !c.nc){
      root = c.rootPc;
      c.pcs.forEach(function(p,i){ spell[p] = c.notes[i]; deg[p] = c.labels[i]; });
      if(c.bassPc!=null && spell[c.bassPc]==null){ spell[c.bassPc] = c.bass; deg[c.bassPc] = DEG[mod(c.bassPc-root,12)]; }
    }
    return {c:c, root:root,
      name:function(m){ var p = mod(m,12); return spell[p] || (th ? th.name(m,{octave:false}) : SHARP[p]); },
      deg:function(m){ var p = mod(m,12); return deg[p] || (root!=null ? DEG[mod(p-root,12)] : ''); },
      iv:function(m){ return root!=null ? mod(m-root,12) : -1; }};
  }

  function svg(x, opts){
    opts = opts || {};
    var shape = (typeof x==='string' && !/^[\dxX×\-,\s\/]+$/.test(x)) ? (find(x,{max:1})[0] || null) : parse(x, opts);
    if(typeof x==='string' && shape && shape.chord && !opts.chord) opts = merge(opts,{chord:shape.chord});
    if(!shape) return '';
    shape = parse(shape, opts);
    var L = LOOK[opts.look] || LOOK.book, hor = opts.orient==='h';
    var label = opts.label || 'note', n = shape.frets.length;
    var cx = context(shape, opts), mids = notesOf(shape, opts);
    var fr = shape.frets, fi = shape.fingers;
    var pressed = fr.filter(function(v){return v>0;});
    var maxF = pressed.length ? Math.max.apply(null,pressed) : 0, minF = pressed.length ? Math.min.apply(null,pressed) : 0;
    var rows0 = opts.rows || 5;
    var base = opts.base || shape.base || (maxF <= rows0 ? 1 : minF);
    var rows = Math.max(rows0, maxF - base + 1);
    var title = opts.title===false ? '' : (typeof opts.title==='string' ? opts.title : (cx.c ? cx.c.name : ''));
    var names = opts.names!==false, R = 10.5;
    var titleH = title ? 30 : 6;
    var W, H, gx, gy, pt, g = '';

    if(!hor){
      var sx = 26, fy = 30, padL = 24, padR = 34;
      gx = padL; gy = titleH + 26;
      W = padL + (n-1)*sx + padR; H = gy + rows*fy + (names ? 28 : 10);
      pt = function(s,f){ return [gx + s*sx, gy + (f-base+0.5)*fy]; };
      var mk = function(s){ return [gx + s*sx, gy - 14]; };
      if(L.board) g += '<rect x="'+(gx-7)+'" y="'+gy+'" width="'+((n-1)*sx+14)+'" height="'+(rows*fy)+'" rx="3" fill="'+L.board+'"/>';
      for(var i=1;i<=rows;i++) g += '<rect x="'+(gx-(L.board?7:0))+'" y="'+f2(gy+i*fy-L.fretW/2)+'" width="'+((n-1)*sx+(L.board?14:0))+'" height="'+L.fretW+'" fill="'+L.grid+'"/>';
      if(base===1) g += '<rect x="'+(gx-(L.board?7:1))+'" y="'+(gy-5)+'" width="'+((n-1)*sx+(L.board?14:2))+'" height="6" rx="1" fill="'+L.nut+'"/>';
      else { g += '<rect x="'+gx+'" y="'+f2(gy-0.6)+'" width="'+((n-1)*sx)+'" height="1.2" fill="'+L.grid+'"/>';
             g += '<text x="'+(gx+(n-1)*sx+10)+'" y="'+f2(gy+fy/2+4)+'" font-size="12" fill="'+L.ink+'" font-family="'+FONT+'">'+base+'fr</text>'; }
      for(var s=0;s<n;s++) g += '<line x1="'+(gx+s*sx)+'" y1="'+gy+'" x2="'+(gx+s*sx)+'" y2="'+(gy+rows*fy)+'" stroke="'+L.strCol(s)+'" stroke-width="'+L.strW(s)+'"/>';
      if(names) for(s=0;s<n;s++) if(mids[s]!=null)
        g += '<text x="'+(gx+s*sx)+'" y="'+(gy+rows*fy+19)+'" text-anchor="middle" font-size="11" fill="'+L.sub+'" font-family="'+FONT+'">'+esc(cx.name(mids[s]))+'</text>';
    } else {
      var fx = 36, sy = 22, padL2 = 42;
      gx = padL2; gy = titleH + 12;
      W = gx + rows*fx + (names ? 38 : 14); H = gy + (n-1)*sy + 26;
      pt = function(s,f){ return [gx + (f-base+0.5)*fx, gy + (n-1-s)*sy]; };
      mk = function(s){ return [gx - 14, gy + (n-1-s)*sy]; };
      if(L.board) g += '<rect x="'+gx+'" y="'+(gy-7)+'" width="'+(rows*fx)+'" height="'+((n-1)*sy+14)+'" rx="3" fill="'+L.board+'"/>';
      for(i=1;i<=rows;i++) g += '<rect x="'+f2(gx+i*fx-L.fretW/2)+'" y="'+(gy-(L.board?7:0))+'" width="'+L.fretW+'" height="'+((n-1)*sy+(L.board?14:0))+'" fill="'+L.grid+'"/>';
      if(base===1) g += '<rect x="'+(gx-5)+'" y="'+(gy-(L.board?7:1))+'" width="6" height="'+((n-1)*sy+(L.board?14:2))+'" rx="1" fill="'+L.nut+'"/>';
      else { g += '<rect x="'+f2(gx-0.6)+'" y="'+gy+'" width="1.2" height="'+((n-1)*sy)+'" fill="'+L.grid+'"/>';
             g += '<text x="'+(gx+fx/2)+'" y="'+(gy+(n-1)*sy+20)+'" text-anchor="middle" font-size="12" fill="'+L.ink+'" font-family="'+FONT+'">'+base+'fr</text>'; }
      for(s=0;s<n;s++){
        var yy = gy+(n-1-s)*sy;
        g += '<line x1="'+gx+'" y1="'+yy+'" x2="'+(gx+rows*fx)+'" y2="'+yy+'" stroke="'+L.strCol(s)+'" stroke-width="'+L.strW(s)+'"/>';
        g += '<text x="10" y="'+(yy+4)+'" text-anchor="middle" font-size="11" fill="'+L.sub+'" font-family="'+FONT+'">'+(n-s)+'</text>';
        if(names && mids[s]!=null) g += '<text x="'+(gx+rows*fx+8)+'" y="'+(yy+4)+'" font-size="11" fill="'+L.sub+'" font-family="'+FONT+'">'+esc(cx.name(mids[s]))+'</text>';
      }
    }
    if(title) g = '<text x="'+f2(W/2)+'" y="21" text-anchor="middle" font-size="18" font-weight="700" fill="'+L.ink+'" font-family="'+FONT+'">'+esc(title)+'</text>' + g;

    /* 鳴らさない弦・開放弦 */
    for(s=0;s<n;s++){
      var q = mk(s);
      if(fr[s]<0) g += '<text x="'+q[0]+'" y="'+(q[1]+5)+'" text-anchor="middle" font-size="14" fill="'+L.mark+'" font-family="'+FONT+'">×</text>';
      else if(fr[s]===0){
        var ocol = (L===LOOK.book) ? L.mark : (cx.iv(mids[s])>=0 ? degColor(cx.iv(mids[s])) : L.mark);
        g += '<circle cx="'+q[0]+'" cy="'+q[1]+'" r="5.5" fill="none" stroke="'+ocol+'" stroke-width="1.7"/>';
      }
    }
    /* セーハ */
    barresOf(fr, fi).forEach(function(b){
      var p1 = pt(b.from,b.fret), p2 = pt(b.to,b.fret);
      var x0 = Math.min(p1[0],p2[0])-R, y0 = Math.min(p1[1],p2[1])-R;
      g += '<rect x="'+f2(x0)+'" y="'+f2(y0)+'" width="'+f2(Math.abs(p2[0]-p1[0])+2*R)+'" height="'+f2(Math.abs(p2[1]-p1[1])+2*R)+'" rx="'+R+'" fill="'+L.bar+'" opacity="'+L.barOp+'"/>';
    });
    /* 押さえ */
    for(s=0;s<n;s++){
      if(fr[s]<=0) continue;
      var p = pt(s,fr[s]), m = mids[s];
      var t = label==='finger' ? (fi[s]||'') : label==='note' ? cx.name(m) : label==='deg' ? cx.deg(m) : '';
      g += '<circle cx="'+f2(p[0])+'" cy="'+f2(p[1])+'" r="'+R+'" fill="'+L.dot(cx.iv(m))+'"/>';
      t = String(t);
      if(t!=='') g += '<text x="'+f2(p[0])+'" y="'+f2(p[1]+3.9)+'" text-anchor="middle" font-size="'+(t.length>1?10:11.5)+'" font-weight="700" fill="'+L.dotText+'" font-family="'+FONT+'">'+esc(t)+'</text>';
    }
    /* 叩ける的 */
    if(opts.hit) for(s=0;s<n;s++){
      if(fr[s]<0) continue;
      var h = fr[s]>0 ? pt(s,fr[s]) : mk(s);
      g += '<circle class="cbhit" data-s="'+s+'" data-f="'+fr[s]+'" cx="'+f2(h[0])+'" cy="'+f2(h[1])+'" r="'+(R+3)+'" fill="transparent" style="cursor:pointer"/>';
    }
    var bg = opts.bg===false ? '' : '<rect x="0" y="0" width="'+W+'" height="'+H+'" rx="8" fill="'+L.bg+'"/>';
    var mw = opts.maxWidth || (hor ? 300 : 190);
    return '<svg class="ds-chordbox" viewBox="0 0 '+W+' '+H+'" width="100%" style="max-width:'+mw+'px" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="'+esc(title||'コードの押さえ方')+'">'+bg+g+'</svg>';
  }
  function merge(a,b){ var o={},k; for(k in a) o[k]=a[k]; for(k in b) o[k]=b[k]; return o; }

  /* ───────── 鳴らす（sound.js がある時） ───────── */
  function play(x, opts){
    opts = opts || {};
    if(!DS.sound) return null;
    var shape = (typeof x==='string' && !/^[\dxX×\-,\s\/]+$/.test(x)) ? (find(x,{max:1})[0] || null) : parse(x, opts);
    if(!shape) return null;
    var ms = notesOf(shape, opts).filter(function(m){return m!=null;});
    return DS.sound.chord(opts.instrument || 'acoustic', ms, opts);
  }
  /* 要素に描いて、叩くと鳴るようにする。丸や開放弦を叩くとその弦だけ、ほかを叩くと全部。描き直しは戻り値の update(新しい押さえ方) */
  function mount(el, x, opts){
    opts = opts || {};
    var cur = x;
    function draw(){ el.innerHTML = svg(cur, merge(opts,{hit:true})); }
    draw();
    el.addEventListener('pointerdown', function(e){
      if(!DS.sound) return;
      var shape = (typeof cur==='string' && !/^[\dxX×\-,\s\/]+$/.test(cur)) ? (find(cur,{max:1})[0] || null) : parse(cur, opts);
      if(!shape) return;
      var t = e.target && e.target.getAttribute && e.target.getAttribute('data-s');
      if(t!=null){
        var m = notesOf(shape, opts)[+t];
        if(m!=null) DS.sound.play(opts.instrument || 'acoustic', m, {});
      } else if(e.target && e.target.closest && e.target.closest('svg')) play(shape, opts);
    });
    return {update:function(y){ cur = y; draw(); }, el:el};
  }

  DS.chordbox = {
    version:'chordbox-1.0',
    svg:svg, find:find, parse:parse, fingers:fingerOf, barres:barresOf, notes:notesOf, play:play, mount:mount,
    OPEN_SHAPES:OPEN_SHAPES, MOVABLE:MOVE
  };
})();
