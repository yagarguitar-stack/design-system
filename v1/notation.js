/* yagarguitar-stack 共通デザイン v1 — 五線譜・TAB譜の描画（notation.js）
   ──────────────────────────────────────────────────────────────
   中身は「五線譜とTAB」の描画モジュール（draw-1.40、ScoreLineRead 由来）そのもの。
   読み込むと window.SLDraw（＝ DS.notation）が使える。呼び方は今までと同じ。

   記号のフォント Bravura は、同じ場所の fonts/Bravura.woff2 を自動で読み込む。
   Bravura は SIL Open Font License 1.1（fonts/OFL.txt）。
   使い方と譜面データの書き方は README の「五線譜・TAB譜」。
   ══════════════════════════════════════════════════════════════ */
(function(){
  if(typeof document==='undefined')return;
  var s=document.currentScript&&document.currentScript.src,base=s?s.replace(/[^\/]*$/,''):'';
  if(!document.getElementById('ds-bravura')){
    var st=document.createElement('style');st.id='ds-bravura';
    st.textContent='@font-face{font-family:"Bravura";src:url("'+base+'fonts/Bravura.woff2") format("woff2");font-weight:normal;font-style:normal;font-display:block;}';
    (document.head||document.documentElement).appendChild(st);
  }
})();

/* ══════════════════════════════════════════════════════════════
   ScoreLine 描画モジュール  draw-1.20
   ──────────────────────────────────────────────────────────────
   ScoreLineRead read-2.00 から、譜面を描く部分だけを抜いたもの。
   出題・採点・記録・画面は含まない。外へ出るのは window.SLDraw だけ。

   使うには Bravura（woff2）の @font-face が要る。
   記号はフォント、直線は自前で引く。SMuFL の約束：1em ＝ 4線間。
   ══════════════════════════════════════════════════════════════ */
(function(){
'use strict';
/* ══════════════════════════════════════════════════════════════
   ScoreLineRead ── 五線譜＋TAB＋指板 エンジン  read-0.71
   ──────────────────────────────────────────────────────────────
   記号は Bravura（SMuFL 参照実装・SIL OFL 1.1）の字形。
   直線（五線・六線・加線・符尾・連桁・小節線・連符の括弧）はこちらで引く。
   SMuFL の約束：**1em ＝ 4線間**。font-size = 4*SP で寸法が一意に決まる。

   これまでに積んだもの
     read-0.20 記号を Bravura（SMuFL）の字形へ。直線だけ自前で引く
     read-0.30 連符・複合拍子・重音の符頭・休符の付点・調号幅の一本化
     read-0.40 連符の明示指定・付点の追従・beatGrouping・renderRow の API
     read-0.50 TAB段（ScoreLineTAB の流儀）・五線譜とTABの縦合わせ・
               指板（ScoreLineLead の寸法）・解析（analyze）の一本化
     read-0.51 連桁の傾きを符頭から取り、最短符尾を保証
     read-0.60 出題と採点（順方向）
     read-0.70 逆方向（五線譜を直に押して書く）
     read-0.71 **外から来る値を黙って受け入れない。**
               beatGrouping と tuplet を検め、不正は errors に積む。
               音価の照合に許容誤差を設ける。連符の組に明示IDを通す

   **外から来る値は、必ず検めてから使う。**
   read-0.30 で「未知の音価を4分音符に化けさせない」と決めたが、
   その戒めを beatGrouping と tuplet の入り口で守れていなかった。
   黙って補正した譜面は、誤りを抱えたまま正しい顔をする——いちばん悪い。

   API の約束
     analyze(spec)            → { prep, groups, tuplets, beamed, errors }
     renderBar(spec, opt)     → 五線譜の小節 { svg, errors, … }
     renderTabBar(spec, opt)  → TABの小節   { svg, errors, … }
     renderSystem(bars, opt)  → 五線譜＋TABを積んだ一枚 { svg, errors, … }
     renderRow(bars, opt)     → SVG の文字列だけ（五線譜のみ）
     renderRowEx(bars, opt)   → { svg, errors }（五線譜のみ）
     fretboardSVG(opt)        → 指板の SVG 文字列

   ScoreLineTAB(tab-6.05) から引き継いだもの：
     TPQ=1680 の刻み・T{} の音価定数・OPEN_MIDI・小節内寸の座標系
     TAB_LS / strY() / T-A-B クレフ / 数字を白板で抜く流儀 / FS_FRET の比
   ScoreLineLead(1.x) から引き継いだもの：
     指板の寸法（sx/sy/padL/padT）・ナットの太さ・ポジションマークの位置
   ══════════════════════════════════════════════════════════════ */

const TPQ = 1680;
const T = { WHOLE:TPQ*4, HALF:TPQ*2, QUARTER:TPQ, EIGHTH:TPQ/2,
            SIXTEENTH:TPQ/4, THIRTY2:TPQ/8,
            TRIP4:TPQ*2/3, TRIP8:TPQ/3, TRIP16:TPQ/6 };

const OPEN_MIDI = [40,45,50,55,59,64];   /* 6弦→1弦。TAB と同じ並び */
const MAX_FRET  = 17;                    /* 同音異弦の探索範囲＝指板の表示範囲 */

const INK  = '#1a1a1a';
const RULE = '#2f2f2f';
const WARN = '#a32020';
const FONT_TAB = '-apple-system,Helvetica Neue,Arial,sans-serif';

/* ══ Bravura の彫刻既定値（線間を単位とする）══ */
const EG = {
  staffLine:0.13, stem:0.12, leger:0.16, legerExt:0.40,
  beam:0.50, beamGap:0.25, barlineThin:0.16, barlineThick:0.50
};
const AW = {
  gClef8vb:2.656, noteheadBlack:1.18, noteheadHalf:1.18, noteheadWhole:1.688,
  accidentalSharp:0.996, accidentalFlat:0.904, accidentalNatural:0.672,
  accidentalDoubleSharp:1.0, accidentalDoubleFlat:1.652,
  restWhole:1.132, restHalf:1.132, restQuarter:1.08, rest8th:1.0,
  rest16th:1.28, rest32nd:1.452, augmentationDot:0.40, timeSig:1.88
};
const STEM_ATTACH = { x:1.18, y:0.168 };
const FLAG_ANCH = { up:-0.04, down:0.132 };

const SM = {
  gClef8vb:'\uE052',
  headWhole:'\uE0A2', headHalf:'\uE0A3', headBlack:'\uE0A4',
  sharp:'\uE262', flat:'\uE260', natural:'\uE261', dsharp:'\uE263', dflat:'\uE264',
  restWhole:'\uE4E3', restHalf:'\uE4E4', restQuarter:'\uE4E5',
  rest8th:'\uE4E6', rest16th:'\uE4E7', rest32nd:'\uE4E8',
  dot:'\uE1E7',
  flagUp:['','\uE240','\uE242','\uE244'], flagDown:['','\uE241','\uE243','\uE245'],
  digit:d=>String.fromCharCode(0xE080+d),
  tupletDigit:d=>String.fromCharCode(0xE880+d)
};

const LET  = ['C','D','E','F','G','A','B'];
const BASE = [0,2,4,5,7,9,11];
const SHARP_ORDER = [3,0,4,1,5,2,6];
const FLAT_ORDER  = [6,2,5,1,4,0,3];

const MID_STEP = 34;
const STAFF_STEPS = [30,32,34,36,38];

function keyAlterTable(ks){
  const t=[0,0,0,0,0,0,0];
  if(ks>0) for(let i=0;i<ks;i++)  t[SHARP_ORDER[i]] = 1;
  if(ks<0) for(let i=0;i<-ks;i++) t[FLAT_ORDER[i]]  = -1;
  return t;
}

function spell(writtenMidi, ks){
  const pc = ((writtenMidi%12)+12)%12;
  const ka = keyAlterTable(ks);
  let best=null;
  for(let L=0;L<7;L++){
    for(let a=-2;a<=2;a++){
      if((((BASE[L]+a)%12)+12)%12 !== pc) continue;
      const oct = (writtenMidi - a - BASE[L])/12 - 1;
      if(!Number.isInteger(oct)) continue;
      let cost = ((a!==ka[L])?100:0) + Math.abs(a)*10;
      if(ks>=0 && a<0) cost += 3;
      if(ks< 0 && a>0) cost += 3;
      if(a===0) cost -= 1;
      if(!best || cost<best.cost) best={L,alter:a,oct,cost};
    }
  }
  best.absStep = best.oct*7 + best.L;
  best.name = LET[best.L] + (best.alter>0?'♯'.repeat(best.alter)
                           : best.alter<0?'♭'.repeat(-best.alter):'');
  return best;
}

/* ══════════════════════════════════════════════════════════════
   音価を読む
   返すもの { base, dots, tuplet, source }
   source … 'plain' / 'auto'（長さから推した）/ 'explicit'（データが告げた）
   **連符は本来データ側が知っていること。** 明示があればそちらを優先する。
   長さから推すのは付点なしに限る。読めない長さには null を返す。
   ══════════════════════════════════════════════════════════════ */
/* ══ 音価の照合の許容誤差（read-0.71）══
   TPQ=1680 では 3:2 も 5:4 も 7:4 も整数に収まるが、外から来る tick は
   割り算を経ていることがあり、完全一致では正しい音価が null に落ちる。
   刻みの最小は 1680/8=210 ゆえ、1e-6 は整数の判別を一切乱さない。 */
const DUR_EPS = 1e-6;
const nearly = (a,b) => Math.abs(a-b) < DUR_EPS;

const DUR_BASE = [T.WHOLE,T.HALF,T.QUARTER,T.EIGHTH,T.SIXTEENTH,T.THIRTY2];
const FLAGS    = { [T.EIGHTH]:1, [T.SIXTEENTH]:2, [T.THIRTY2]:3 };
const TUPLETS  = [{n:3,d:2},{n:5,d:4},{n:7,d:4}];
const DOTF     = [1, 1.5, 1.75];

function durInfoPlain(len){
  if(!(len>0)) return null;
  for(let d=0; d<DOTF.length; d++)
    for(const b of DUR_BASE)
      if(nearly(len, b*DOTF[d])) return {base:b, dots:d, tuplet:null, source:'plain'};
  return null;
}
function durInfoExplicit(len, tup){
  if(!(len>0) || !tup) return null;
  for(let d=0; d<DOTF.length; d++)
    for(const b of DUR_BASE)
      if(nearly(len, b*DOTF[d]*tup.d/tup.n))
        return {base:b, dots:d, tuplet:{n:tup.n, d:tup.d}, source:'explicit'};
  return null;
}
function durInfo(len){
  const p = durInfoPlain(len);
  if(p) return p;
  for(const t of TUPLETS)
    for(const b of DUR_BASE)
      if(nearly(len, b*t.d/t.n))
        return {base:b, dots:0, tuplet:{n:t.n, d:t.d}, source:'auto'};
  return null;
}
/* ══ 連符の比を検める（read-0.71）══
   n個を通常のd個ぶんの長さで、という比。よって
   ・n も d も有限の正の整数
   ・n > d でなければ「詰める」ことにならない（1:1 は連符ではない）
   満たさぬ指定は直さずに拒む。**黙って直せば、誤りが譜面の中に隠れる。** */
function validTupletRatio(t){
  if(!t || typeof t!=='object') return false;
  const n=t.n, d=t.d;
  if(typeof n!=='number' || typeof d!=='number') return false;
  if(!Number.isFinite(n) || !Number.isFinite(d)) return false;
  if(!Number.isInteger(n) || !Number.isInteger(d)) return false;
  if(n<=0 || d<=0) return false;
  if(n<=d) return false;
  return true;
}
/* 返り値
     false     … 連符でないと明示された
     undefined … 指定なし（長さから推す）
     {n,d}     … 正しい比
     {bad:理由} … 指定はあるが不正 */
function noteTupletOf(nt){
  if(nt.tuplet === false || nt.tuplet === null) return false;
  if(nt.tuplet !== undefined){
    if(Array.isArray(nt.tuplet) || typeof nt.tuplet !== 'object')
      return {bad:'tuplet は {n,d} で与えること'};
    if(!validTupletRatio(nt.tuplet))
      return {bad:'連符の比が不正（n>d の有限の正の整数であること）'};
    return {n:nt.tuplet.n, d:nt.tuplet.d};
  }
  if(nt.tupletRatio !== undefined){
    const a = nt.tupletRatio;
    if(!Array.isArray(a) || a.length!==2)
      return {bad:'tupletRatio は [n,d] で与えること'};
    const t = {n:a[0], d:a[1]};
    if(!validTupletRatio(t))
      return {bad:'連符の比が不正（n>d の有限の正の整数であること）'};
    return t;
  }
  return undefined;
}
/* 音価。不正な連符指定は null を返し、理由を lastNoteDurError に残す */
let lastNoteDurError = null;
function noteDur(nt){
  lastNoteDurError = null;
  const tup = noteTupletOf(nt);
  if(tup === false) return durInfoPlain(nt.len);
  if(tup && tup.bad){ lastNoteDurError = tup.bad; return null; }
  if(tup) return durInfoExplicit(nt.len, tup);
  return durInfo(nt.len);
}
const tupletKey = di => di && di.tuplet ? `${di.tuplet.n}:${di.tuplet.d}` : '';
function headWidthOf(base){ return base===T.WHOLE?AW.noteheadWhole:AW.noteheadBlack; }

/* ══════════════════════════════════════════════════════════════
   拍のまとまり
   **分母だけで拍を決めてはならない。** 6/8 は付点4分音符2つで数える。
   ts.beatGrouping=[3,3,3,3] で明示もできる。無ければ自動。
   ══════════════════════════════════════════════════════════════ */
function unitTicks(ts){ return Math.round(4/ts.d*T.QUARTER); }
function isCompound(ts){ return ts.d>=8 && ts.n%3===0; }
function beatTicks(ts){ return isCompound(ts) ? unitTicks(ts)*3 : unitTicks(ts); }
function barTicks(ts){ return unitTicks(ts)*ts.n; }
/* ══ beatGrouping を検める（read-0.71）══
   分母いくつぶんを一つの拍とするかの並び。よって
   ・空でない配列／全要素が有限の正の整数
   ・合計が ts.n と一致する（一致しなければ小節を割り切れていない）
   合わなければ**直さずに拒む。** 足りぬぶんを勝手に足す作りにしていたが、
   それでは指定の誤りが譜面の中に隠れてしまう。
   返り値 {ok:true, groups:[…]|null} ／ {ok:false, why:'…'} */
function validateBeatGrouping(ts){
  const gp = ts && ts.beatGrouping;
  if(gp === undefined || gp === null) return {ok:true, groups:null};   /* 指定なし */
  if(!Array.isArray(gp) || gp.length===0)
    return {ok:false, why:'beatGrouping は空でない配列で与えること'};
  for(const k of gp){
    if(typeof k!=='number' || !Number.isFinite(k) || !Number.isInteger(k) || k<=0)
      return {ok:false, why:'beatGrouping の要素は有限の正の整数であること'};
  }
  const sum = gp.reduce((a,b)=>a+b, 0);
  if(sum !== (ts.n|0))
    return {ok:false, why:'beatGrouping の合計 '+sum+' が拍子の分子 '+ts.n+' と一致しません'};
  return {ok:true, groups:gp.slice()};
}
function beatGroups(ts){
  const u=unitTicks(ts), total=barTicks(ts), out=[];
  const v = validateBeatGrouping(ts);
  if(v.ok && v.groups){
    let x=0;
    v.groups.forEach(k=>{ const e=x+k*u; out.push([x,e]); x=e; });
    return out;
  }
  /* 不正な指定は使わない。拍のまとまりは自動判定へ落とし、
     **誤りそのものは analyze() が errors に積んで表に出す。** */
  const b=beatTicks(ts);
  for(let x=0; x<total; x+=b) out.push([x, Math.min(x+b,total)]);
  return out;
}
function groupIndexAt(ts, tick){
  const g=beatGroups(ts);
  for(let i=0;i<g.length;i++) if(tick>=g[i][0] && tick<g[i][1]) return i;
  return Math.max(0,g.length-1);
}

/* ══ 調号 ── 幅の計算はこの一本だけ ══ */
const SHARP_STEP = [38,35,39,36,33,37,34];
const FLAT_STEP  = [34,37,33,36,32,35,31];
const KS_GAP = 0.08, KS_PAD = 0.55;
function keySig(ks, SP){
  const n = Math.abs(ks|0);
  if(!n) return {items:[], width:0};
  const ch = ks>0?SM.sharp:SM.flat;
  const w  = ks>0?AW.accidentalSharp:AW.accidentalFlat;
  const steps = ks>0?SHARP_STEP:FLAT_STEP;
  const items=[]; let x=0;
  for(let i=0;i<n;i++){ items.push({ch, step:steps[i], x}); x += (w+KS_GAP)*SP; }
  return { items, width: x - KS_GAP*SP + KS_PAD*SP };
}

const ACC_GAP = 0.16;
function accWidth(alter){
  return alter=== 1?AW.accidentalSharp : alter===-1?AW.accidentalFlat
       : alter=== 2?AW.accidentalDoubleSharp : alter===-2?AW.accidentalDoubleFlat
       : AW.accidentalNatural;
}
function accGlyphOf(alter){
  return alter=== 1?SM.sharp : alter===-1?SM.flat
       : alter=== 2?SM.dsharp : alter===-2?SM.dflat : SM.natural;
}

/* ══════════════════════════════════════════════════════════════
   小節の内寸
   **五線譜とTABは、この barLayout() の返り値を必ず共有する。**
   別々に計算すると padL がずれ、音符と数字が縦に揃わなくなる——
   本ツールの主張（五線譜とTABは同一物）が崩れる。
     noteX(u)   … 符頭の左端
     centerX(u,base) … 符頭の中心。**TABの数字はここに揃える**
   ══════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════
   小節の中で、音符ごとに**要る幅**を数える（draw-1.20）
   ──────────────────────────────────────────────────────────────
   時間の比だけで置くと、臨時記号や二桁の数字が入る余地の無い所で
   前の音符へ食い込む。八分音符の間隔は SP=13 で 24px、符頭が 15px
   ——隙間は 9px しか無いのに、♯は離しを入れて 16px 要る。

   ゆえに、まず各音符が左右へどれだけ張り出すかを数え、
   それを最低限の間隔として確保したうえで、余りを時間の比で配る。

     左へ … 臨時記号（重音では列の数だけ積む）、TABの数字の左半分
     右へ … 符頭と付点、TABの数字の右半分と付点

   五線譜だけの段では TAB の幅を数えない（`tab:false`）。
   ══════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════
   弧（タイ・スラー）  draw-1.20
   ──────────────────────────────────────────────────────────────
   形は ScoreLineTAB の `tieArc` を写す（tab-3.62〜3.64）。

     ・端は水平に出て、中央でいちばん膨らむ（三次ベジェを二本、外と内）
     ・膨らみは**深さ**が作る。太さではない
     ・太さは線間の一割から二割。それ以上は線ではなく帯に見える
     ・三次ベジェの頂は制御点の高さの 4/3 にしかならないので、
       深さ dep を出すには制御点へ dep*4/3 を置く

   向こうは px で彫ってある（TAB線間 9.2px）。こちらは五線にもTABにも
   使うので、**線間を単位に**して渡す。数の意味は同じまま、
   五線では SP、TABでは LS で引かれる。
   ══════════════════════════════════════════════════════════════ */
/* ══ 深さと太さは、線間に対する割合で（draw-1.20）══
   ScoreLineTAB は px で彫ってあり、はじめはその数を線間で割り戻して写した。
   ところが**線間が広いほど弧が深くなる**。TABの線間は五線の1.55倍あり、
   そこへ数字の大きさぶんの離しが重なって、**弧が数字を離れて六線の端まで浮いた**。
   掛かっている音から離れた弧は、どの音に掛かっているのか読めない。

   ゆえに深さも太さも、その譜の線間に対する割合で決める。
     深さ … 幅の2割ほど。ただし線間の0.85倍を越えない
     太さ … 線間の1割前後（版に彫られた弧もその見当）
   膨らみは深さが作る。太さではない。 */
function arcShape(x0, y0, x1, y1, up, unit, capDeep, kind){
  const span0 = Math.abs(x1-x0);
  if(span0 < unit*0.35) return '';
  /* 両端を少し詰める。弧どうしが接して一本に見えるのを防ぐ（tab-3.60）。
     縦も一緒に詰めねば、端が音符からずれる */
  const t = Math.min(unit*0.10, span0*0.06)/span0;
  const dx = (x1-x0)*t, dy = (y1-y0)*t;
  x0+=dx; x1-=dx; y0+=dy; y1-=dy;
  const span = Math.abs(x1-x0);
  if(span < unit*0.30) return '';
  /* ══ 形は楽譜の慣例に寄せる（draw-1.30）══
     タイは浅く平たく（長くても深くしすぎない）、スラーはもう少し丸く。
     太さは中央で約0.2間、端は細く（SMuFL の既定値に近い値） */
  const isTie = (kind === 'tie');
  let dep = isTie
    ? Math.max(unit*0.30, Math.min(unit*0.62, 0.055*span + unit*0.22))
    : Math.max(unit*0.40, Math.min(unit*1.10, 0.085*span + unit*0.28));
  if(capDeep != null) dep = Math.min(dep, capDeep);
  const th  = Math.min(unit*(isTie ? 0.17 : 0.20), unit*0.07 + span*0.02);
  const inset = Math.max(unit*0.25, Math.min(span*(isTie ? 0.22 : 0.27), span/2 - unit*0.08));
  /* 三次ベジェの頂は制御点の高さの 4/3 にしかならない（tab-3.74）。
     深さ dep を出すには、制御点へ dep*4/3 を置く */
  const c = dep*4/3, ci = (dep-th)*4/3;
  const kk = up ? -1 : 1;
  const cx0 = x0+inset, cx1 = x1-inset;
  /* 制御点の高さは、その x における両端を結ぶ線の上に取る（傾きを保つ） */
  /* 高さの違う端どうし（スラー）は、傾きを半分ほどに寄せる。
     玉の高さどおりに端を置くと、低い側だけが急に落ちて片寄った形になる。
     楽譜では、弧は外側の玉に合わせてなだらかに掛ける */
  if(!isTie){
    const outer = up ? Math.min(y0, y1) : Math.max(y0, y1);
    y0 = outer + (y0 - outer)*0.4; y1 = outer + (y1 - outer)*0.4;
  }
  const at = x => (x1===x0) ? y0 : y0 + (y1-y0)*(x-x0)/(x1-x0);
  const c0 = at(cx0), c1 = at(cx1);
  /* ══ 端を消さない（draw-1.20）══
     紡錘形は端が尖る。版に彫られた弧はそれでよいが、こちらは
     五線間隔が13px、弧の太さは1.5px——**端は白紙に溶けて見えなくなる。**
     中央の膨らみだけが残り、どの音から出てどの音へ入るのかが読めない。
     輪郭にも細い線を入れ、端まで必ず残るようにする。丸い端で音符へ着ける。 */
  const edge = Math.max(0.35, unit*0.085);
  return `<path d="M ${x0.toFixed(2)} ${y0.toFixed(2)}`
    + ` C ${cx0.toFixed(2)} ${(c0+c*kk).toFixed(2)} ${cx1.toFixed(2)} ${(c1+c*kk).toFixed(2)} ${x1.toFixed(2)} ${y1.toFixed(2)}`
    + ` C ${cx1.toFixed(2)} ${(c1+ci*kk).toFixed(2)} ${cx0.toFixed(2)} ${(c0+ci*kk).toFixed(2)} ${x0.toFixed(2)} ${y0.toFixed(2)} Z"`
    + ` fill="${INK}" stroke="${INK}" stroke-width="${edge.toFixed(2)}" stroke-linejoin="round"/>`;
}
/* ══ 弧の相手を探す ══
   `tie:true`  … 次の音符へ。同じ高さでなければタイではない
   `slur:n`    … n個先の音符まで一本の弧（省くと1）
   休符は数えない。相手がいなければ errors に残し、描かない。 */
function arcPairs(prep, errors){
  const notes = prep.filter(p=>!p.rest);
  const out = [];
  notes.forEach((p,i)=>{
    const nt = p.nt;
    if(nt.tie){
      const nx = notes[i+1];
      if(!nx){ errors.push({at:nt.start, why:'タイの相手がいない'}); return; }
      out.push({kind:'tie', a:p, b:nx});
    }
    if(nt.slur){
      const step = (nt.slur===true) ? 1 : (nt.slur|0);
      const nx = notes[i+step];
      if(step<1 || !nx){ errors.push({at:nt.start, why:'スラーの相手がいない'}); return; }
      /* ══ 弦をまたぐスラーは描かない（draw-1.31）══
         ギターの楽譜のスラーは同じ弦の上でつなぐ印。押さえが分かっていて、
         掛かる音のどれかが別の弦なら、ギターでは弾けないので引かない */
      const span = notes.slice(i, i+step+1);
      const strs = span.map(q=> (q.nt.stops && q.nt.stops.length) ? q.nt.stops[0].s : null);
      if(strs.every(v=>v !== null) && strs.some(v=> v !== strs[0])) return;
      out.push({kind:'slur', a:p, b:nx});
    }
    /* ══ 奏法（draw-1.20）══
       スライド・ハンマリング・プリングは、いずれも**次の音へ渡る**技ゆえ
       相手が要る。相手のいない技は描かず、errors に残す。
       チョーキングはその音だけで完結するので、ここでは扱わない。 */
    if(nt.tech){
      const nx = notes[i+1];
      const name = {slide:'スライド', hammer:'ハンマリング', pull:'プリング', gliss:'グリッサンド'}[nt.tech];
      if(!name){ errors.push({at:nt.start, why:'知らない奏法'}); return; }
      if(!nx){ errors.push({at:nt.start, why:name+'の相手がいない'}); return; }
      out.push({kind:nt.tech, a:p, b:nx});
    }
  });
  return out;
}
/* ══ 奏法の字は ScoreLineTAB の〈標準〉の流儀（draw-1.40）══
   ハンマリング h・プリング p・スライド s・グリッサンド g（いずれも小文字） */
const TECH_LETTER = {hammer:'h', pull:'p', slide:'s', gliss:'g'};
/* チョーキングの字（標準の流儀）。1音上げは bend、半音は h.bend */
const BEND_TXT = {0.25:'q.bend', 0.5:'h.bend', 1:'bend', 1.5:'1h.bend', 2:'2bend'};
const bendText = v => BEND_TXT[(v===true || v==null) ? 1 : v] || 'bend';
/* ══ 上げて届く高さ（draw-1.41）══ `bendSound:true` の音は、五線譜に**届いた高さ**を書く。
   TAB は押さえたフレットと bend。印の無いチョーキング（練習問題の飾り）は高さを変えない */
const bendSoundSemi = nt => (nt && nt.bend && nt.bendSound) ? Math.round((nt.bend === true ? 1 : nt.bend)*2) : 0;
/* ビブラートの波線（x0 から w だけ） */
function vibPath(x0, y, w, unit){
  const step = unit*0.62, amp = unit*0.30;
  const n = Math.max(2, Math.floor(w/step));
  let d = `M ${x0.toFixed(2)} ${y.toFixed(2)}`;
  for(let i=0; i<n; i++) d += ` q ${(step/2).toFixed(2)} ${(i%2 ? amp : -amp).toFixed(2)} ${step.toFixed(2)} 0`;
  return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${(unit*0.12).toFixed(2)}" stroke-linecap="round"/>`;
}
/* 字（奏法の頭文字・チョーキング）の書き方をそろえる */
function techText(x, y, txt, size){
  return `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="middle" `
    + `font-family="-apple-system,Helvetica,sans-serif" font-style="italic" font-weight="700" `
    + `font-size="${size.toFixed(2)}" fill="${INK}">${txt}</text>`;
}
/* チョーキングの幅の書き方。1音上げなら「1」、半音なら「½」 */
const bendLabel = v => (v===0.5 || v==='half') ? '½'
  : (v===1 || v===true) ? '1' : (v===1.5 ? '1½' : (v===2 ? '2' : String(v)));

function barDemands(spec, SP, opt){
  opt = opt || {};
  const A  = opt.analysis || analyze(spec);
  const ks = spec.ks|0, capo = spec.capo|0;
  const withTab = opt.tab !== false;
  const KA = keyAlterTable(ks), inForce = {};
  const effAlter = st => (st in inForce) ? inForce[st] : KA[((st%7)+7)%7];
  const LS = TAB_LS_SP*SP, FS = FS_FRET_LS*LS;
  const cols = [];
  A.prep.forEach(p=>{
    const base = p.di.base;
    const headW = (p.rest ? restSpec(base).w : headWidthOf(base))*SP;
    const dotsW = p.di.dots ? (0.30 + 0.55*p.di.dots)*SP : 0;
    let accW = 0, tabW = 0, tabDotR = 0;
    if(p.rest){
      if(withTab) tabW = restSpec(base).w*SP*0.86;
    }else{
      /* 臨時記号：renderBar とまったく同じ物差しで数える。
         別々に数えれば、空けた幅と描く位置がまた食い違う */
      const heads = (p.pitches
        ? p.pitches.map(pt=>{ const st=pt.absStep|0, li=((st%7)+7)%7;
            return {absStep:st, alter:(pt.alter==null)?KA[li]:pt.alter}; })
        : (p.stops||[]).map(st=>{ const sp=spell(OPEN_MIDI[st.s]+capo+st.f+12+bendSoundSemi(p.nt), ks);
            return {absStep:sp.absStep, alter:sp.alter}; }));
      let n=0;
      heads.forEach(h=>{
        if(h.alter !== effAlter(h.absStep)){
          inForce[h.absStep] = h.alter;
          accW += (accWidth(h.alter)+ACC_GAP)*SP; n++;
        }
      });
      if(n) accW += 0.22*SP;
      if(withTab){
        (p.stops||[]).forEach(st=>{
          const w = (String(st.f).length*0.60+0.24)*FS;   /* 二桁は一気に広がる */
          if(w>tabW) tabW = w;
        });
        if(p.di.dots) tabDotR = (0.30 + (p.di.dots-1)*0.42 + 0.35)*LS;
      }
    }
    /* 符頭の左端を基準に、左右への張り出しへ直す（TABの数字は符頭の中心に揃う） */
    const leftExt  = Math.max(accW, tabW/2 - headW/2);
    let   rightExt = Math.max(headW + dotsW, headW/2 + tabW/2 + tabDotR);
    /* 弧の要る幅（draw-1.20）。二桁の数字が並ぶと、字の縁どうしが触れ合って
       弧を引く隙間が残らない。結ぶ音符には、あらかじめ隙間を持たせる */
    if(p.nt && (p.nt.tie || p.nt.slur || p.nt.tech)) rightExt += LS*0.55;
    /* チョーキングは矢印と数が右上に立つ。そのぶんも空けておく */
    if(p.nt && p.nt.bend && withTab) rightExt += LS*0.9;
    /* 装飾音符は本体の左に小さく立つ（draw-1.40） */
    let leftExt2 = leftExt;
    if(p.nt && p.nt.grace) leftExt2 = Math.max(leftExt, accW + SP*2.3);
    cols.push({u:p.nt.start, headW, leftExt:leftExt2, rightExt});
  });
  /* ══ 積んだTAB段も勘定に入れる（draw-1.20）══
     別のポジションで取り直した段は、同じ音でも二桁になりうる。
     五線譜の段だけで幅を決めると、下の段で数字がぶつかる。 */
  (opt.tabs||[]).forEach(notes=>{
    if(!notes || !notes.length) return;
    const TA = analyze({ks, ts:spec.ts, notes});
    TA.prep.forEach(p=>{
      if(p.rest || !p.stops) return;
      const col = cols.find(c=> c.u === p.nt.start);
      if(!col) return;
      let w = 0;
      p.stops.forEach(st=>{
        const x = (String(st.f).length*0.60+0.24)*FS;
        if(x>w) w = x;
      });
      const dotR = p.di.dots ? (0.30 + (p.di.dots-1)*0.42 + 0.35)*LS : 0;
      col.leftExt  = Math.max(col.leftExt,  w/2 - col.headW/2);
      col.rightExt = Math.max(col.rightExt, col.headW/2 + w/2 + dotR);
    });
  });
  cols.sort((a,b)=>a.u-b.u);
  return cols;
}

function barLayout(W, o){
  const SP=o.SP, ks=o.ks|0, ts=o.ts||{n:4,d:4};
  /* 音部記号の幅。五線譜のト音記号とTABの T/A/B、広いほうに合わせる */
  const clefW = o.showClef
    ? Math.max((AW.gClef8vb+0.9)*SP, TAB_CLEF_LS*TAB_LS_SP*SP*0.85) : 0;
  const tsDigits = o.showTS ? Math.max(String(ts.n).length, String(ts.d).length) : 0;
  const tsW   = o.showTS   ? (AW.timeSig*tsDigits+0.7)*SP : 0;
  const ksW   = o.showKS   ? keySig(ks,SP).width  : 0;
  const mgn   = Math.min(1.2*SP, W*0.05);
  const padL  = mgn + clefW + ksW + tsW;
  const padR  = Math.min(1.4*SP, W*0.06);
  const HEAD_OFF = 1.35*SP;
  const innerW= Math.max(3*SP, W-padL-padR-AW.noteheadBlack*SP-HEAD_OFF);
  const total = barTicks(ts);
  const timeX = u => padL + (u/total)*innerW;
  let noteX = u => timeX(u) + HEAD_OFF;

  /* ══ 要る幅を確保してから、余りを時間の比で配る（draw-1.20）══
     `o.bar` が渡された時だけ働く。渡されなければ今までどおり時間の比だけ——
     古い呼び出しを壊さないため。 */
  const cols = o.bar ? barDemands(o.bar, SP,
                 {analysis:o.analysis, tab:o.tab, tabs:o.tabs}) : null;
  let xs = null, minW = null;
  if(cols && cols.length){
    const GAP = 0.25*SP;
    const ideal = cols.map(c=> padL + HEAD_OFF + (c.u/total)*innerW);
    const first = Math.max(padL + HEAD_OFF, padL + cols[0].leftExt + 0.20*SP);
    const room  = (W - padR - cols[cols.length-1].rightExt) - first;
    const want  = [], least = [];
    for(let i=1;i<cols.length;i++){
      want.push(Math.max(0, ideal[i]-ideal[i-1]));
      least.push(cols[i-1].rightExt + cols[i].leftExt + GAP);
    }
    const sumAt = k => least.reduce((t,m,i)=> t + Math.max(m, k*want[i]), 0);
    /* この中身が重ならずに収まる最小の小節幅。呼ぶ側が幅を決める助けになる */
    minW = first + sumAt(0) + cols[cols.length-1].rightExt + padR;
    let gaps;
    if(sumAt(0) > room && room > 0){
      /* 要る幅の合計すら入らない小節。皆で均等に痩せる（小節線は越えさせない） */
      const k = room / sumAt(0);
      gaps = least.map(m=> m*k);
    }else{
      let lo=0, hi=1;
      if(sumAt(1) > room){
        for(let i=0;i<30;i++){ const mid=(lo+hi)/2; if(sumAt(mid)<=room) lo=mid; else hi=mid; }
      }else lo = 1;
      gaps = least.map((m,i)=> Math.max(m, lo*want[i]));
    }
    xs = [first];
    gaps.forEach(gp=> xs.push(xs[xs.length-1] + gp));
    /* 与えられた刻みの間は直線で結ぶ（外側は端の傾きを延ばす） */
    const us = cols.map(c=>c.u);
    noteX = u => {
      if(u <= us[0]) return xs[0] + (u-us[0])*((xs[1]!=null&&us[1]!=us[0])
        ? (xs[1]-xs[0])/(us[1]-us[0]) : innerW/total);
      for(let i=1;i<us.length;i++){
        if(u <= us[i]) return xs[i-1] + (u-us[i-1])*(xs[i]-xs[i-1])/(us[i]-us[i-1]);
      }
      const n=us.length;
      const slope = n>1 ? (xs[n-1]-xs[n-2])/(us[n-1]-us[n-2]) : innerW/total;
      return xs[n-1] + (u-us[n-1])*slope;
    };
  }

  return { padL, padR, innerW, total, mgn, clefW, ksW, tsW,
           nAcc:Math.abs(ks), HEAD_OFF, SP, cols, xs, minW,
           timeX, noteX,
           centerX:(u,base)=> noteX(u) + headWidthOf(base||T.QUARTER)/2*SP };
}

function glyph(ch, x, y, SP, opt){
  const o=opt||{};
  return `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" `
       + `font-family="Bravura" font-size="${((o.scale||1)*4*SP).toFixed(2)}" `
       + `fill="${o.fill||INK}"${o.op?` opacity="${o.op}"`:''} `
       + `xml:space="preserve">${ch}</text>`;
}

/* ══ 休符 ══ */
const REST_SPEC = {
  [T.WHOLE]:     {ch:SM.restWhole,   originStep:36, dotStep:37, w:AW.restWhole},
  [T.HALF]:      {ch:SM.restHalf,    originStep:34, dotStep:35, w:AW.restHalf},
  [T.QUARTER]:   {ch:SM.restQuarter, originStep:34, dotStep:35, w:AW.restQuarter},
  [T.EIGHTH]:    {ch:SM.rest8th,     originStep:34, dotStep:35, w:AW.rest8th},
  [T.SIXTEENTH]: {ch:SM.rest16th,    originStep:34, dotStep:35, w:AW.rest16th},
  [T.THIRTY2]:   {ch:SM.rest32nd,    originStep:34, dotStep:35, w:AW.rest32nd}
};
function restSpec(base){ return REST_SPEC[base] || REST_SPEC[T.QUARTER]; }

/* ══ 重音の符頭配置 ══ */
function placeHeads(heads, up, headW){
  const order = up ? heads.slice() : heads.slice().reverse();
  let prev=null, prevDisp=false;
  order.forEach(h=>{
    const adjacent = (prev!==null) && Math.abs(h.absStep-prev)<=1;
    h.disp = adjacent && !prevDisp;
    prevDisp = h.disp;
    prev = h.absStep;
  });
  heads.forEach(h=>{ h.dx = h.disp ? (up ? headW : -headW) : 0; });
  return heads;
}

/* ══ 付点の置き場所 ══
   横：いちばん右へ出た符頭の外側に揃える（潜り込みを避ける）
   縦：線上の音は上の間へ。塞がっていれば下の間へ逃がす */
function placeDots(heads, headW, dots){
  const maxDx = Math.max(0, ...heads.map(h=>h.dx));
  const baseX = maxDx + headW + 0.35;
  const used = new Set();
  heads.slice().sort((a,b)=>b.absStep-a.absStep).forEach(h=>{
    let st = (h.absStep%2===0) ? h.absStep+1 : h.absStep;
    if(used.has(st)) st = h.absStep-1;
    used.add(st);
    h.dotStep = st;
    h.dotXs = [];
    for(let d=0; d<dots; d++) h.dotXs.push(baseX + d*0.55);
  });
  return heads;
}

/* ══ 連桁の位置（決定）と形（描画）を分ける ══ */
/* ══ 連桁の上下限（read-0.51）══
   maxSlopeSP … 傾きの上限。組の端から端まででこれ以上は倒さない
   minSlopeSP … これ未満の傾きは水平に丸める（微傾は読みを乱すだけ）
   minStemSP  … **どの音符の符尾も、これより短くしない。**
                これを保証しないと、連桁が中ほどの符頭を突き抜ける */
const BEAM_LIMITS = { maxSlopeSP:1.0, minSlopeSP:0.25, minStemSP:2.5 };

/* ══ 連桁の位置（read-0.51）══
   位置の決定はここだけ。描画（beamShape）とは分けてある。

   水平（既定）… 組の中でいちばん外へ出た符尾の高さに揃える。
   傾ける（opt.beamSlope）…
     1 端から端の**符頭**の高さで傾きを取る（符尾の先ではない。
       先は第3線まで伸ばす決まりで丸めてあり、傾きの根拠にならない）
     2 上限・下限で丸める
     3 **すべての符尾が minStemSP を満たすまで、線ごと外へずらす。**
       ここを省くと、中ほどの音が高い（低い）組で連桁が符頭を貫く。 */
function beamLine(gr, SP, opt){
  const up = gr.up;
  const items = gr.items;
  const xa = items[0].stemX, xb = items[items.length-1].stemX;
  if(!(opt && opt.beamSlope)){
    const stems = items.map(p=>p.stemY1);
    const flat = up ? Math.min(...stems) : Math.max(...stems);
    return {xa, xb, ya:flat, yb:flat, slope:0};
  }
  /* 符尾の向こう側にある符頭（上向きならいちばん高い音） */
  const anchor = p => up ? p.headTop : p.headBot;
  const step   = p => up ? p.anchorStepTop : p.anchorStepBot;
  const span = (xb-xa) || 1;
  const st = items.map(step);
  /* ══ 上下に折れる組は水平（read-0.51）══
     五線譜の作法。上がって下がる並びに傾きを与えると、
     **どちらへ動いているのかが却って読めなくなる。** */
  let mono = true, dir = 0;
  for(let i=1;i<st.length;i++){
    const d = Math.sign(st[i]-st[i-1]);
    if(d===0) continue;
    if(dir===0) dir=d; else if(d!==dir){ mono=false; break; }
  }
  /* ══ 傾きは音程差の段で決める（read-0.51）══
     端から端の隔たりが二度なら 1/4 線間、三度なら 1/2、四度なら 3/4、
     五度以上で 1 線間。**差をそのまま倒して上限で切ると、
     どの組もいちばん急な傾きに張り付いて機械の顔になる。** */
  const dStep = st[st.length-1] - st[0];
  const table = [0, 0.25, 0.5, 0.75, 1.0];
  const mag = mono ? table[Math.min(Math.abs(dStep), 4)] : 0;
  const capped = Math.min(mag, BEAM_LIMITS.maxSlopeSP);
  let dy = -Math.sign(dStep) * capped * SP;
  if(Math.abs(dy) < BEAM_LIMITS.minSlopeSP*SP) dy = 0;
  const y0 = anchor(items[0]);
  const at = x => y0 + dy*(x-xa)/span;
  const MIN = BEAM_LIMITS.minStemSP*SP;
  let shift = null;
  items.forEach(p=>{
    const want = up ? anchor(p)-MIN : anchor(p)+MIN;
    const d = want - at(p.stemX);
    shift = (shift===null) ? d : (up ? Math.min(shift,d) : Math.max(shift,d));
  });
  if(shift===null) shift = up ? -MIN : MIN;
  return {xa, xb, ya:y0+shift, yb:y0+dy+shift, slope:dy/span};
}
function beamYAt(bl, x){
  if(bl.ya===bl.yb) return bl.ya;
  return bl.ya + (bl.yb-bl.ya)*(x-bl.xa)/((bl.xb-bl.xa)||1);
}
function beamShape(x0,x1,yTop0,yTop1,h,fill){
  const c = fill||INK;
  if(yTop0===yTop1)
    return `<rect x="${x0.toFixed(2)}" y="${yTop0.toFixed(2)}" width="${(x1-x0).toFixed(2)}" `
         + `height="${h.toFixed(2)}" fill="${c}"/>`;
  return `<polygon points="${x0.toFixed(2)},${yTop0.toFixed(2)} ${x1.toFixed(2)},${yTop1.toFixed(2)} `
       + `${x1.toFixed(2)},${(yTop1+h).toFixed(2)} ${x0.toFixed(2)},${(yTop0+h).toFixed(2)}" fill="${c}"/>`;
}

const TUP_CLEAR = { staff:0.55, head:1.60, num:0.85, bracket:0.35, hook:0.55 };

/* ══════════════════════════════════════════════════════════════
   音符の解析（read-0.50）
   ──────────────────────────────────────────────────────────────
   **連桁のまとまりを数えるのはここ一箇所だけ。**
   五線譜とTABが別々に数えれば、いつか必ず食い違う。
   ここでは音高も座標も見ない——音価と拍だけで決まることを決める。
   ══════════════════════════════════════════════════════════════ */
function analyze(spec){
  const ts = spec.ts || {n:4,d:4};
  const errors=[], prep=[];
  /* ══ 拍子の指定を先に検める（read-0.71）══
     不正な beatGrouping は使わず、**黙って補正もしない。**
     誤りは表に出し、拍のまとまりは自動判定へ落とす。 */
  const bgv = validateBeatGrouping(ts);
  if(!bgv.ok) errors.push({start:null, len:null, why:bgv.why, kind:'beatGrouping'});
  (spec.notes||[]).slice().sort((a,b)=>a.start-b.start).forEach(nt=>{
    if(!Number.isFinite(nt.start) || nt.start<0){
      errors.push({start:nt.start, len:nt.len, why:'位置が不正'}); return;
    }
    const di = noteDur(nt);
    if(!di){
      errors.push({start:nt.start, len:nt.len,
        why: lastNoteDurError || '未対応の音価',
        kind: lastNoteDurError ? 'tuplet' : 'duration'});
      return;
    }
    if(!nt.rest){
      /* ══ 音高を直に与える道（read-0.70）══
         逆方向では、生徒は押さえではなく**五線譜の段**で答える。
         段と変化記号だけで音符は決まるので、押さえを経由しない。 */
      if(Array.isArray(nt.pitches) && nt.pitches.length){
        prep.push({nt, di, rest:false, stops:null, pitches:nt.pitches}); return;
      }
      const stops = (nt.stops||[]).filter(s=>s.f!=='x' && s.f!=null);
      if(!stops.length){ errors.push({start:nt.start,len:nt.len,why:'押さえが空'}); return; }
      prep.push({nt, di, rest:false, stops});
    } else prep.push({nt, di, rest:true, stops:null});
  });

  /* 連桁のまとまり：拍のまとまり／連符の比／時間的な連続の三つで切る */
  const groups=[]; let cur=null;
  prep.forEach(p=>{
    const beamable = !p.rest && p.di.base<=T.EIGHTH && p.di.base>=T.THIRTY2;
    if(!beamable){ cur=null; return; }
    const gi = groupIndexAt(ts, p.nt.start);
    const tk = tupletKey(p.di);
    const last = cur && cur.items[cur.items.length-1];
    const joins = cur && cur.gi===gi && cur.tk===tk
               && (last.nt.start + last.nt.len === p.nt.start);
    if(joins) cur.items.push(p);
    else { cur={gi, tk, items:[p]}; groups.push(cur); }
  });
  const beamed = new Set();
  groups.forEach(gr=>{ if(gr.items.length>=2) gr.items.forEach(p=>beamed.add(p)); });

  /* 連符のまとまり：n個そろったら閉じる */
  /* ══ 連符のまとまり（read-0.71）══
     「同じ比で時間的に隣」だけでは同じ連符とは限らない。次の四つで切る。
       1 音符データに tupletGroup があれば **それを最優先**
       2 同じ比（3:2 と 5:4 は別物）
       3 時間的に隙間なく続く
       4 同じ拍のまとまりの中（拍をまたぐ連符は別の組）
     さらに n 個そろえば閉じる（隣り合う三連符が繋がらぬよう）。 */
  const tuplets=[]; let tcur=null;
  const beatLen = beatTicks(ts);
  prep.forEach(p=>{
    if(p.rest || !p.di.tuplet){ tcur=null; return; }
    const tk=tupletKey(p.di);
    const gid = (p.nt.tupletGroup==null) ? null : String(p.nt.tupletGroup);
    const gi  = groupIndexAt(ts, p.nt.start);
    const last = tcur && tcur.items[tcur.items.length-1];
    let joins;
    if(gid!==null || (tcur && tcur.gid!=null)){
      /* 明示IDがあるなら、IDの一致だけで決める（隣接も拍も問わない） */
      joins = !!(tcur && tcur.gid===gid);
    } else {
      /* 連符ひと組が本来占める長さ＝もとの音価 × d。
         これが一拍に収まるなら「同じ拍の中」を課す（隣り合う三連符を切るため）。
         **拍より長い連符（4/4 を跨ぐ五連4分など）にまで課してはならない。**
         課せば、正当な連符が拍の数だけ切り刻まれる。 */
      const span = p.di.base * p.di.tuplet.d;
      const sameBeatNeeded = (span <= beatLen);
      joins = !!(tcur && tcur.tk===tk
              && (!sameBeatNeeded || tcur.gi===gi)
              && tcur.items.length < tcur.n
              && (last.nt.start + last.nt.len === p.nt.start));
    }
    if(joins) tcur.items.push(p);
    else { tcur={tk, gid, gi, n:p.di.tuplet.n, items:[p]}; tuplets.push(tcur); }
  });

  return {prep, groups, beamed, tuplets, errors, ts};
}

/* 読めない音符の印（五線譜・TAB 共通） */
function badMark(x, yTop, yBot, SP){
  return `<line x1="${x.toFixed(2)}" y1="${yTop.toFixed(2)}" x2="${x.toFixed(2)}" `
    +`y2="${yBot.toFixed(2)}" stroke="${WARN}" stroke-width="${(0.14*SP).toFixed(2)}" `
    +`stroke-dasharray="${(0.5*SP).toFixed(2)} ${(0.35*SP).toFixed(2)}"/>`
    +`<text x="${(x+0.25*SP).toFixed(2)}" y="${(yTop-0.3*SP).toFixed(2)}" `
    +`font-size="${(1.5*SP).toFixed(2)}" font-weight="700" fill="${WARN}" `
    +`font-family="${FONT_TAB}">?</text>`;
}

/* ══════════════════════════════════════════════════════════════
   五線譜の小節
   ══════════════════════════════════════════════════════════════ */
function renderBar(spec, opt){
  const SP = opt.SP || 10;
  const W  = opt.W  || 240;
  const ks = spec.ks|0, ts = spec.ts||{n:4,d:4}, capo = spec.capo|0;
  const showClef=!!opt.showClef, showTS=!!opt.showTS, showKS=!!opt.showKS;
  const A0 = opt.analysis || analyze(spec);
  const L = opt.layout || barLayout(W,{SP,ks,ts,showClef,showTS,showKS,
              bar:spec, analysis:A0, tab:opt.tab!==false});
  const {padL,padR,innerW,total,timeX,noteX,HEAD_OFF,mgn,clefW}=L;
  const nAcc = Math.abs(ks);

  const midY = opt.midY || (SP*8.6);
  const yOf  = st => midY - (st-MID_STEP)*(SP/2);
  const g=[];
  const A = A0;
  const errors = A.errors.slice();

  /* ── 五線 ── */
  STAFF_STEPS.forEach(st=>{
    g.push(`<line x1="0" y1="${yOf(st).toFixed(2)}" x2="${W}" y2="${yOf(st).toFixed(2)}" `
      +`stroke="${RULE}" stroke-width="${(EG.staffLine*SP).toFixed(2)}"/>`);
  });
  const bl=(x,w)=>`<line x1="${x.toFixed(2)}" y1="${yOf(38).toFixed(2)}" x2="${x.toFixed(2)}" `
    +`y2="${yOf(30).toFixed(2)}" stroke="${RULE}" stroke-width="${w.toFixed(2)}"/>`;
  g.push(bl(W-EG.barlineThin*SP/2, EG.barlineThin*SP));
  if(showClef) g.push(bl(EG.barlineThin*SP/2, EG.barlineThin*SP));

  if(showClef) g.push(glyph(SM.gClef8vb, mgn+0.45*SP, yOf(32), SP));

  if(showKS){
    const x0 = mgn + clefW + 0.10*SP;
    keySig(ks,SP).items.forEach(it=> g.push(glyph(it.ch, x0+it.x, yOf(it.step), SP)));
  }

  if(showTS){
    const dn=String(ts.n).split(''), dd=String(ts.d).split('');
    const wide = Math.max(dn.length, dd.length);
    const cx = padL - 0.6*SP - wide*AW.timeSig*SP/2;
    const put=(arr,st)=>{
      let x = cx - arr.length*AW.timeSig*SP/2;
      arr.forEach(c=>{ g.push(glyph(SM.digit(+c), x, yOf(st), SP)); x+=AW.timeSig*SP; });
    };
    put(dn,36); put(dd,32);
  }

  /* 読めなかった音符の印 */
  A.errors.forEach(e=>{
    if(!Number.isFinite(e.start)) return;
    g.push(badMark(noteX(e.start), yOf(39), yOf(29), SP));
  });

  const KA = keyAlterTable(ks);
  const inForce = {};
  const effAlter = st => (st in inForce) ? inForce[st] : KA[((st%7)+7)%7];

  /* 音高を与える（座標はここで初めて決まる） */
  A.prep.forEach(p=>{
    p.x = noteX(p.nt.start);
    if(p.rest) return;
    p.heads = (p.pitches
      ? p.pitches.map(pt=>{
          const absStep = pt.absStep|0;
          const L = ((absStep%7)+7)%7;
          const alter = (pt.alter==null) ? KA[L] : pt.alter;
          const sp = {L, alter, oct:(absStep-L)/7, absStep,
                      name: LET[L] + (alter>0?'♯'.repeat(alter):alter<0?'♭'.repeat(-alter):'')};
          return {st:null, sp, absStep, y:yOf(absStep)};
        })
      : p.stops.map(st=>{
          const sp = spell(OPEN_MIDI[st.s]+capo+st.f+12+bendSoundSemi(p.nt), ks);   /* 8vb 記譜（上げて届く高さ） */
          return {st, sp, absStep:sp.absStep, y:yOf(sp.absStep)};
        })
      ).sort((a,b)=>a.absStep-b.absStep);
    const far = p.heads.reduce((m,h)=>
      Math.abs(h.absStep-MID_STEP)>Math.abs(m.absStep-MID_STEP)?h:m, p.heads[0]);
    p.up = p.nt.stem ? (p.nt.stem==='up') : (far.absStep <= MID_STEP);
    /* 連桁の傾きは符頭から取る。上端＝いちばん高い音の y（小さいほう） */
    p.headTop = Math.min(...p.heads.map(h=>h.y));
    p.headBot = Math.max(...p.heads.map(h=>h.y));
    p.anchorStepTop = Math.max(...p.heads.map(h=>h.absStep));
    p.anchorStepBot = Math.min(...p.heads.map(h=>h.absStep));
  });
  /* 連桁の組は向きを揃える */
  A.groups.forEach(gr=>{
    if(gr.items.length<2) return;
    let far=null;
    gr.items.forEach(p=>p.heads.forEach(h=>{
      if(!far||Math.abs(h.absStep-MID_STEP)>Math.abs(far.absStep-MID_STEP)) far=h; }));
    gr.up = far.absStep<=MID_STEP;
    gr.items.forEach(p=>p.up=gr.up);
  });

  const STEM_LEN = 3.5*SP;

  A.prep.forEach(p=>{
    if(p.rest){
      const rs = restSpec(p.di.base);
      g.push(glyph(rs.ch, p.x, yOf(rs.originStep), SP));
      for(let d=0; d<p.di.dots; d++)
        g.push(glyph(SM.dot, p.x+(rs.w+0.35+d*0.55)*SP, yOf(rs.dotStep), SP));
      return;
    }
    const headCh = p.di.base===T.WHOLE?SM.headWhole : p.di.base===T.HALF?SM.headHalf : SM.headBlack;
    const headW  = headWidthOf(p.di.base);
    placeHeads(p.heads, p.up, headW);
    if(p.di.dots) placeDots(p.heads, headW, p.di.dots);

    const accs=[];
    p.heads.forEach(h=>{
      if(h.sp.alter !== effAlter(h.absStep)){
        inForce[h.absStep]=h.sp.alter;
        h.acc  = accGlyphOf(h.sp.alter);
        h.accW = accWidth(h.sp.alter);
        accs.push(h);
      } else h.acc=null;
    });
    accs.sort((a,b)=>b.absStep-a.absStep);
    accs.forEach((h,i)=>h.accCol=i);
    const leftMost = p.x + Math.min(0, ...p.heads.map(h=>h.dx*SP), 0);

    p.heads.forEach(h=>{
      const x0 = p.x + h.dx*SP;
      const a = x0 - EG.legerExt*SP, b = x0 + (headW+EG.legerExt)*SP;
      const line=y=>`<line x1="${a.toFixed(2)}" y1="${y.toFixed(2)}" x2="${b.toFixed(2)}" y2="${y.toFixed(2)}" `
        +`stroke="${RULE}" stroke-width="${(EG.leger*SP).toFixed(2)}"/>`;
      for(let st=40; st<=h.absStep; st+=2) g.push(line(yOf(st)));
      for(let st=28; st>=h.absStep; st-=2) g.push(line(yOf(st)));
    });

    accs.forEach(h=>{
      const x = leftMost - 0.22*SP - (h.accCol+1)*(h.accW+ACC_GAP)*SP + ACC_GAP*SP;
      g.push(glyph(h.acc, x, h.y, SP));
    });

    /* 音ごとの色（draw-1.20）。TAB側と同じ口。符頭と付点だけを染める——
       符尾や連桁まで染めると、隣の音とどちらの色か分からなくなる */
    const tint = (opt.tint && opt.tint[p.nt.start]) || null;
    p.heads.forEach(h=>{
      g.push(glyph(headCh, p.x + h.dx*SP, h.y, SP, tint?{fill:tint}:null));
      if(h.dotXs) h.dotXs.forEach(dx=>
        g.push(glyph(SM.dot, p.x + dx*SP, yOf(h.dotStep), SP)));
    });

    if(p.di.base < T.WHOLE){
      const lo=p.heads[0], hi=p.heads[p.heads.length-1];
      const sx = p.up ? p.x + (STEM_ATTACH.x-EG.stem/2)*SP : p.x + (EG.stem/2)*SP;
      const y0 = p.up ? lo.y - STEM_ATTACH.y*SP : hi.y + STEM_ATTACH.y*SP;
      let y1 = p.up ? hi.y - STEM_LEN : lo.y + STEM_LEN;
      if(p.up  && y1>midY) y1=midY;
      if(!p.up && y1<midY) y1=midY;
      p.stemX=sx; p.stemY1=y1; p.stemY0=y0;
      g.push(`<line x1="${sx.toFixed(2)}" y1="${y0.toFixed(2)}" x2="${sx.toFixed(2)}" y2="${y1.toFixed(2)}" `
        +`stroke="${INK}" stroke-width="${(EG.stem*SP).toFixed(2)}"/>`);
      const nf = FLAGS[p.di.base]||0;
      if(nf && !A.beamed.has(p)){
        const fx = sx - EG.stem*SP/2;
        const fy = p.up ? y1 + FLAG_ANCH.up*SP : y1 - FLAG_ANCH.down*SP;
        g.push(glyph(p.up?SM.flagUp[nf]:SM.flagDown[nf], fx, fy, SP));
      }
    }
  });

  /* ══ 弧（タイ・スラー）══
     五線譜の慣例どおり、**符尾の反対側**へ引く。符尾が上なら符頭の下、
     下なら上。符頭の縁から縁へ渡し、玉には触れさせない。
     タイは同じ高さの玉どうしを結ぶので、その玉の高さから引く。
     スラーは高さが変わるので、外側の玉（上向きなら下端、下向きなら上端）を使う。 */
  arcPairs(A.prep, errors).forEach(ar=>{
    const a = ar.a, b = ar.b;
    const hw = headWidthOf(a.di.base)*SP;
    const up = !a.up;                       /* 符尾が上なら弧は下（up=false） */
    const k  = up ? -1 : 1;
    /* ══ スライドは弧ではなく直線（draw-1.20）══
       指が板の上を滑る技ゆえ、玉から玉へ**まっすぐ**渡す。
       弧で描けば、ハンマリングと見分けが付かない。 */
    if(ar.kind === 'slide' || ar.kind === 'gliss'){
      const ya2 = a.heads[0].y, yb2 = b.heads[0].y;
      const x0 = a.x + hw + SP*0.18, x1 = b.x - SP*0.18;
      if(x1 > x0){
        /* 高さが同じ時は傾ける。水平線は五線に紛れる */
        const flat = (Math.abs(yb2-ya2) < SP*0.2);
        const h = flat ? SP*0.30 : 0;
        g.push(`<line x1="${x0.toFixed(2)}" y1="${(ya2+h).toFixed(2)}" `
          +`x2="${x1.toFixed(2)}" y2="${(yb2-h).toFixed(2)}" stroke="${INK}" `
          +`stroke-width="${(SP*0.13).toFixed(2)}" stroke-linecap="round"/>`);
        /* 字（s／g）は線の中ほど、符尾と反対の側へ（draw-1.40） */
        const my = Math.min(ya2, yb2) - SP*1.05;
        g.push(techText((x0+x1)/2, my, TECH_LETTER[ar.kind], SP*1.05));
      }
      return;
    }
    let ya, yb;
    if(ar.kind === 'tie'){
      const ha = a.heads[0], hb = b.heads.find(h=>h.absStep===ha.absStep);
      if(!hb){ errors.push({at:a.nt.start, why:'タイの相手が同じ高さでない'}); return; }
      ya = ha.y; yb = hb.y;
    }else{
      ya = up ? a.headTop : a.headBot;
      yb = up ? b.headTop : b.headBot;
    }
    const letter = TECH_LETTER[ar.kind] || '';
    /* ══ 端の置き所は、タイとスラーで違う（draw-1.20）══
       タイは**玉と玉の間**を結ぶので、縁から縁へ。
       スラーは**玉の真下（真上）**から出て、次の玉の真下へ入る。
       脇から出していたため、三つ目まで掛かっている弧が
       二つ目で終わっているように見えていた。 */
    /* タイは玉の中心から少し外、スラーは玉の縁から間の半分ほど離す（draw-1.30）。headTop は玉の中心 */
    const off = k * (ar.kind==='tie' ? SP*0.45 : SP*0.88);
    const isTech = !!letter;
    let y0 = ya + off, y1 = yb + off;
    const x0 = (ar.kind==='tie') ? a.x + hw + SP*0.10 : a.x + hw/2;
    const x1 = (ar.kind==='tie') ? b.x - SP*0.10      : b.x + headWidthOf(b.di.base)*SP/2;
    /* ══ 途中の音符を跨ぐ（draw-1.20）══
       スラーの下をくぐる音符があると、弧がその玉を突き抜ける。
       間の音符を見て、足りない分だけ両端を外へ押し上げる。 */
    if(ar.kind === 'slur' && x1 > x0){
      const mid = A.prep.filter(p=>!p.rest
        && p.nt.start > a.nt.start && p.nt.start < b.nt.start);
      let push = 0;
      mid.forEach(p=>{
        const cx = p.x + headWidthOf(p.di.base)*SP/2;
        const t  = (cx-x0)/(x1-x0);
        const line = y0 + (y1-y0)*t;
        const need = (up ? p.headTop : p.headBot) + off;
        const gap  = up ? (line - need) : (need - line);
        if(gap > 0) push = Math.max(push, gap);
      });
      y0 += k*push; y1 += k*push;
    }
    const d = arcShape(x0, y0, x1, y1, up, SP, null, ar.kind === 'tie' ? 'tie' : 'slur');
    if(d) g.push(d);
    /* 頭文字は弧の外側。弧だけではスラーと区別が付かない */
    if(isTech && d){
      const dep = SP*0.55;
      const cx = (x0+x1)/2, cy = (y0+y1)/2 + k*(dep + SP*0.72);
      g.push(`<text x="${cx.toFixed(2)}" y="${cy.toFixed(2)}" text-anchor="middle" `
        +`font-family="-apple-system,Helvetica,sans-serif" font-style="italic" `
        +`font-weight="700" font-size="${(SP*1.05).toFixed(2)}" fill="${INK}">${letter}</text>`);
    }
  });

  /* ══ 装飾音符・ビブラート（draw-1.40）══
     装飾音符は本体の左に小さく（符尾は上、旗と斜線）。本体へは h／p の弧か、s の線で入る。
     ビブラートは五線の上に波線。音の長さのあいだ続ける。 */
  const nonRest = A.prep.filter(p=>!p.rest);
  nonRest.forEach((p, i)=>{
    const nt = p.nt;
    if(nt.grace && p.heads && p.heads.length){
      const main = (nt.stops && nt.stops[0]) || null;
      const gsp = main ? spell(OPEN_MIDI[main.s] + capo + nt.grace.f + 12, ks) : null;
      if(gsp){
        const sc = 0.62, hwS = headWidthOf(T.QUARTER)*SP*sc;
        const leftMost = p.x + Math.min(0, ...p.heads.map(h=>h.dx*SP));
        const gx = leftMost - SP*1.75 - hwS;
        const gy = yOf(gsp.absStep);
        /* 小さな加線 */
        const lg = y => `<line x1="${(gx - SP*0.22).toFixed(2)}" y1="${y.toFixed(2)}" x2="${(gx + hwS + SP*0.22).toFixed(2)}" y2="${y.toFixed(2)}" stroke="${RULE}" stroke-width="${(EG.leger*SP).toFixed(2)}"/>`;
        for(let st=40; st<=gsp.absStep; st+=2) g.push(lg(yOf(st)));
        for(let st=28; st>=gsp.absStep; st-=2) g.push(lg(yOf(st)));
        g.push(glyph(SM.headBlack, gx, gy, SP, {scale:sc}));
        const sx = gx + hwS - EG.stem*SP*0.5, top = gy - SP*2.5;
        g.push(`<line x1="${sx.toFixed(2)}" y1="${(gy - SP*0.15).toFixed(2)}" x2="${sx.toFixed(2)}" y2="${top.toFixed(2)}" stroke="${INK}" stroke-width="${(EG.stem*SP*0.8).toFixed(2)}"/>`);
        g.push(glyph(SM.flagUp[1], sx - EG.stem*SP*0.4, top, SP, {scale:sc}));
        const my = top + SP*1.05;
        g.push(`<line x1="${(sx - SP*0.55).toFixed(2)}" y1="${(my + SP*0.40).toFixed(2)}" x2="${(sx + SP*0.60).toFixed(2)}" y2="${(my - SP*0.40).toFixed(2)}" stroke="${INK}" stroke-width="${(SP*0.10).toFixed(2)}"/>`);
        const hy = p.heads[0].y, lk = nt.grace.link || 'h';
        const x0 = gx + hwS*0.5, x1 = leftMost + headWidthOf(p.di.base)*SP*0.5;
        if(lk === 's'){
          const up2 = gsp.absStep < p.heads[0].absStep ? -1 : 1;
          g.push(`<line x1="${(gx + hwS + SP*0.15).toFixed(2)}" y1="${(gy - up2*SP*0.10).toFixed(2)}" x2="${(leftMost - SP*0.15).toFixed(2)}" y2="${(hy + up2*SP*0.10).toFixed(2)}" stroke="${INK}" stroke-width="${(SP*0.12).toFixed(2)}" stroke-linecap="round"/>`);
          g.push(techText((gx + leftMost)/2, Math.max(gy, hy) + SP*1.9, 's', SP*0.95));
        }else{
          /* 符尾が上の装飾音符なので、弧は下へ */
          const yb = Math.max(gy, hy) + SP*0.75;
          const d = arcShape(x0, gy + SP*0.55, x1, hy + SP*0.55, false, SP*0.8, SP*0.45, 'slur');
          if(d) g.push(d);
          g.push(techText((x0 + x1)/2, yb + SP*1.15, lk === 'p' ? 'p' : 'h', SP*0.95));
        }
      }
    }
    if(nt.vib){
      const nx = nonRest[i+1];
      const x0 = p.x - SP*0.1;
      const xEnd = nx ? nx.x - SP*0.6 : W - (L.padR != null ? L.padR : SP) - SP*0.4;
      const w = Math.max(SP*1.6, xEnd - x0);
      const hiY = p.up ? Math.min(p.headTop - STEM_LEN, p.stemY1 != null ? p.stemY1 : p.headTop) : p.headTop;
      /* タイ（小節をまたぐものも）が玉の上に掛かる時は、その弧より上へ */
      const arcUp = (p.nt.tie || p.nt.crossTie) && !p.up;
      const y = Math.min(yOf(38) - SP*1.1, hiY - SP*(arcUp ? 2.2 : 1.0));
      g.push(vibPath(x0, y, w, SP));
    }
  });

  /* ── 連桁 ── */
  const BH=EG.beam*SP, BG=EG.beamGap*SP;
  A.groups.forEach(gr=>{
    if(gr.items.length<2) return;
    const up=gr.up;
    const line = beamLine(gr, SP, opt);
    gr.beamLine = line;
    gr.levels = Math.max(...gr.items.map(p=>FLAGS[p.di.base]||1));
    /* いちばん短い符尾。**傾けたとき、これが最短を割っていれば連桁が符頭を貫く** */
    gr.minStem = Math.min(...gr.items.map(p=>
      Math.abs(beamYAt(line,p.stemX) - (up?p.headTop:p.headBot))));
    gr.items.forEach(p=>{
      const y = beamYAt(line, p.stemX);
      g.push(`<line x1="${p.stemX.toFixed(2)}" y1="${p.stemY0.toFixed(2)}" x2="${p.stemX.toFixed(2)}" `
        +`y2="${y.toFixed(2)}" stroke="${INK}" stroke-width="${(EG.stem*SP).toFixed(2)}"/>`);
    });
    const half=EG.stem*SP/2;
    const xA=gr.items[0].stemX-half, xB=gr.items[gr.items.length-1].stemX+half;
    const off = lv => up ? lv*(BH+BG) : -(lv*(BH+BG)+BH);
    for(let lv=0; lv<gr.levels; lv++){
      const shape=(a,b)=>beamShape(a,b, beamYAt(line,a)+off(lv), beamYAt(line,b)+off(lv), BH);
      if(lv===0){ g.push(shape(xA,xB)); continue; }
      let run=[];
      const flush=()=>{
        if(run.length>=2) g.push(shape(run[0].stemX-half, run[run.length-1].stemX+half));
        else if(run.length===1){
          const a=run[0].stemX, first=(run[0]===gr.items[0]);
          g.push(first? shape(a-half, a+0.85*SP) : shape(a-0.85*SP, a+half));
        }
        run=[];
      };
      gr.items.forEach(p=>{ if((FLAGS[p.di.base]||1)>lv) run.push(p); else flush(); });
      flush();
    }
  });

  /* ── 連符の数字と括弧 ── */
  const tupletMarks=[];
  A.tuplets.forEach(tp=>{
    const inBeam = tp.items.every(p=>A.beamed.has(p));
    const up = tp.items[0].up;
    const xs = tp.items.map(p=>p.stemX!=null?p.stemX:p.x);
    const xa = Math.min(...xs), xb = Math.max(...xs);
    const headYs = [].concat(...tp.items.map(p=>p.heads.map(h=>h.y)));
    const gr = inBeam ? A.groups.find(x=>x.items.length>=2 && x.items.indexOf(tp.items[0])>=0) : null;
    let edge;
    if(gr && gr.beamLine){
      const b2 = gr.beamLine;
      edge = up ? Math.min(beamYAt(b2,xa), beamYAt(b2,xb))
                : Math.max(beamYAt(b2,xa), beamYAt(b2,xb))
                  + (gr.levels-1)*(EG.beam+EG.beamGap)*SP + EG.beam*SP;
    } else {
      const ends = tp.items.map(p=>p.stemY1!=null?p.stemY1
        :(up?p.heads[0].y-STEM_LEN:p.heads[0].y+STEM_LEN));
      edge = up ? Math.min(...ends) : Math.max(...ends);
    }
    if(up) edge = Math.min(edge, yOf(38)-TUP_CLEAR.staff*SP, Math.min(...headYs)-TUP_CLEAR.head*SP);
    else   edge = Math.max(edge, yOf(30)+TUP_CLEAR.staff*SP, Math.max(...headYs)+TUP_CLEAR.head*SP);
    const y  = up ? edge - TUP_CLEAR.num*SP : edge + (TUP_CLEAR.num+0.65)*SP;
    const cx = (xa+xb)/2;
    const digits = String(tp.n).split('').map(d=>SM.tupletDigit(+d)).join('');
    const dw = 0.85*SP*digits.length;
    if(!inBeam){
      const hookY = up ? y+TUP_CLEAR.bracket*SP : y-TUP_CLEAR.bracket*SP;
      const hook  = up ? TUP_CLEAR.hook*SP : -TUP_CLEAR.hook*SP;
      const ln=(x1,y1,x2,y2)=>`<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" `
        +`y2="${y2.toFixed(2)}" stroke="${INK}" stroke-width="${(0.11*SP).toFixed(2)}"/>`;
      g.push(ln(xa, hookY, cx-dw/2-0.25*SP, hookY));
      g.push(ln(cx+dw/2+0.25*SP, hookY, xb, hookY));
      g.push(ln(xa, hookY, xa, hookY+hook));
      g.push(ln(xb, hookY, xb, hookY+hook));
      tupletMarks.push({n:tp.n, up, bracket:true, x:cx, y, hookY, xa, xb});
    } else tupletMarks.push({n:tp.n, up, bracket:false, x:cx, y, xa, xb});
    g.push(glyph(digits, cx-dw/2, y, SP, {scale:0.7}));
  });

  return {
    svg:g.join(''), errors, layout:L, analysis:A,
    padL, padR, innerW, total, timeX, noteX, midY, yOf, W, SP,
    staffTopY: yOf(38), staffBotY: yOf(30),
    beamGroups: A.groups.filter(gr=>gr.items.length>=2).map(gr=>({
      tuplet:gr.tk, starts:gr.items.map(p=>p.nt.start),
      up:gr.up, levels:gr.levels,
      ya:gr.beamLine?gr.beamLine.ya:null, yb:gr.beamLine?gr.beamLine.yb:null,
      minStem:gr.minStem==null?null:gr.minStem})),
    tupletMarks,
    heads: A.prep.filter(p=>!p.rest).map(p=>({
      start:p.nt.start, up:p.up, source:p.di.source, tuplet:p.di.tuplet, dots:p.di.dots,
      steps:p.heads.map(h=>h.absStep),
      dx:p.heads.map(h=>h.dx),
      centerX:p.x + headWidthOf(p.di.base)/2*SP,
      headRight:Math.max(...p.heads.map(h=>h.dx)) + headWidthOf(p.di.base),
      dotXs:p.heads.map(h=>h.dotXs||[]),
      dotSteps:p.heads.map(h=>h.dotStep===undefined?null:h.dotStep)}))
  };
}

/* ══════════════════════════════════════════════════════════════
   TAB段（read-0.50）── ScoreLineTAB(tab-6.05) の流儀を移植
   ──────────────────────────────────────────────────────────────
   ・六線。いちばん外の二本（6弦・1弦）だけ気持ち太く
   ・弦の番号 si は 0=6弦(低音) … 5=1弦(高音)。譜面では1弦が上なので
     y は si が大きいほど上へ来る。**ここを取り違えると全部裏返る**
   ・数字は線の上に置き、**白い板で線を抜く**（線が数字を貫かぬよう）
   ・段の頭に T／A／B を縦に積んだクレフ
   ・符尾は数字の際から生え、先端は六線の内側で揃う（ScoreLineTAB tab-1.89〜1.95）
   ・向きは弦で決まる。まとまりは analyze() と共有

   ScoreLineTAB は TAB_LS=9.2 / FS_FRET=11.5 ——比にすると FS = 1.25*LS。
   本ツールは線間 SP に追従させるため TAB_LS = 1.30*SP とし、比は保つ。
   ══════════════════════════════════════════════════════════════ */
/* ══ TAB段の寸法（read-1.90）══
   市販のギター譜では、TABの線間は五線の線間より広く取り、
   数字は線間をほぼ埋める大きさで組まれる。
   1.30 では細く、五線譜の音符に対して数字が痩せて見えていた。
     TAB_LS   … 五線の線間の 1.55 倍
     数字      … TAB線間の 1.20 倍（字面の高さで約1.34線間ぶん）
   tab-6.05 は TAB 単独の譜面なので 1.25 で足りたが、
   五線譜と並べる本ツールでは、こちらの比でなければ釣り合わない。 */
const TAB_LS_SP = 1.55;      /* 六線の間隔（五線の線間 SP を単位に） */
/* 市販の譜面を測ると、数字の**字面の高さは線間とほぼ同じ**（1.0〜1.1倍）。
   字面は font-size の約0.72倍ゆえ、font-size は線間の 1.50 倍。
   1.20 では字面が 0.86 線間しかなく、痩せて見えていた。 */
const FS_FRET_LS = 1.50;     /* 数字の大きさ（TAB線間を単位に） */
/* ══ T・A・B クレフの大きさ（read-2.00）══
   市販のギター譜では、この三文字は**六線の高さいっぱい**に組まれる。
   六線の高さは 5線間ゆえ、三文字それぞれの字面は 5/3 ≒ 1.67線間。
   字面は font-size の約 0.72 倍なので、font-size は線間の 2.3 倍。
   1.05 では六線の半分しか埋めず、TABの頭に見えなかった。 */
const TAB_CLEF_LS = 2.15;   /* 文字の大きさ（TAB線間を単位に） */
const TAB_CLEF_GAP = 1.70;  /* 三文字の送り（同上）。字面より僅かに広く取り、触れさせない */

function tabGeom(SP, topY){
  const LS = TAB_LS_SP*SP;
  const bot = topY + 5*LS;
  return { LS, top:topY, bot, height:5*LS,
           strY: si => bot - si*LS,          /* si=0 が6弦（下） */
           fs: FS_FRET_LS*LS };
}

function renderTabBar(spec, opt){
  const SP = opt.SP || 10;
  const W  = opt.W  || 240;
  const ts = spec.ts||{n:4,d:4}, capo = spec.capo|0, ks = spec.ks|0;
  const showClef=!!opt.showClef;
  const A0 = opt.analysis || analyze(spec);
  const L = opt.layout || barLayout(W,{SP,ks,ts,showClef,
              showTS:!!opt.showTS, showKS:!!opt.showKS, bar:spec, analysis:A0});
  const {padL,noteX,mgn,clefW}=L;
  const G = tabGeom(SP, opt.topY!=null?opt.topY:SP*1.5);
  const g=[];
  const A = A0;
  const errors = A.errors.slice();

  /* ── 六線 ── */
  for(let si=0; si<6; si++){
    const y=G.strY(si);
    g.push(`<line x1="0" y1="${y.toFixed(2)}" x2="${W}" y2="${y.toFixed(2)}" `
      +`stroke="${RULE}" stroke-width="${((si===0||si===5?1.05:0.8)*EG.staffLine*SP/0.13*0.13).toFixed(2)}"/>`);
  }
  const bl=(x,w)=>`<line x1="${x.toFixed(2)}" y1="${G.top.toFixed(2)}" x2="${x.toFixed(2)}" `
    +`y2="${G.bot.toFixed(2)}" stroke="${RULE}" stroke-width="${w.toFixed(2)}"/>`;
  g.push(bl(W-EG.barlineThin*SP/2, EG.barlineThin*SP));
  if(showClef) g.push(bl(EG.barlineThin*SP/2, EG.barlineThin*SP));

  /* ── T A B クレフ ── **六線の高さいっぱいに、三文字で埋める** ── */
  if(showClef){
    const cx = mgn + clefW/2;
    const fs  = TAB_CLEF_LS*G.LS;
    const gap = TAB_CLEF_GAP*G.LS;
    /* 三文字ぶんの高さを六線の中央に合わせる。
       text の y は字の下端（ベースライン）なので、字面の分だけ下げる */
    const cap  = fs*0.72;
    const span = gap*2 + cap;
    const top  = (G.top + G.bot)/2 - span/2;
    ['T','A','B'].forEach((ch,k)=>{
      g.push(`<text x="${cx.toFixed(2)}" y="${(top + cap + k*gap).toFixed(2)}" `
        +`text-anchor="middle" font-size="${fs.toFixed(2)}" font-weight="800" `
        +`font-family="${FONT_TAB}" fill="${INK}">${ch}</text>`);
    });
  }

  A.errors.forEach(e=>{
    if(!Number.isFinite(e.start)) return;
    g.push(badMark(noteX(e.start), G.top-0.4*SP, G.bot+0.4*SP, SP));
  });

  /* ── 数字。**中心を符頭の中心に合わせる**（縦を揃える要） ── */
  const masks=[], txts=[];
  A.prep.forEach(p=>{
    p.tabCX = L.centerX(p.nt.start, p.di.base);
    if(p.rest) return;
    if(!p.stops){ p.tabRows=[]; return; }   /* 音高だけ与えられた音符はTABに出せない */
    p.tabRows = p.stops.map(st=>{
      const f = st.f, txt = String(f);
      const y = G.strY(st.s);
      const w = (txt.length*0.60+0.24)*G.fs;
      /* ══ 白板は**自分の線を抜くぶんだけ**（read-2.00）══
         数字を大きくすると、字面の高さぶん抜いては隣の線まで消えてしまう。
         市販の譜面でも、数字は隣の線に迫るが、線そのものは残っている。 */
      const mh = Math.min(G.fs*1.16, G.LS*1.02);
      masks.push(`<rect x="${(p.tabCX-w/2).toFixed(2)}" y="${(y-mh/2).toFixed(2)}" `
        +`width="${w.toFixed(2)}" height="${mh.toFixed(2)}" fill="#ffffff"/>`);
      /* ══ 音ごとの色（draw-1.20）══
         `tint` を渡すと、その刻みの数字だけ色が変わる。
         正誤を印だけで示すと、どの音のことか目で追わねばならない。
         **書いたものそのものが色を変える**方が早い。 */
      const ink = (opt.tint && opt.tint[p.nt.start]) || INK;
      txts.push(`<text x="${p.tabCX.toFixed(2)}" y="${(y+G.fs*0.36).toFixed(2)}" `
        +`text-anchor="middle" font-size="${G.fs.toFixed(2)}" font-weight="700" `
        +`font-family="${FONT_TAB}" fill="${ink}">${txt}</text>`);
      return {s:st.s, f, y, w};
    });
    /* ══ 付点は数字のすぐ右（draw-1.20・tab-6.05 と同じ置き方）══
       符尾の脇に置いていたが、TAB では数字が符頭そのものである。
       付点は符頭の右に付くものゆえ、数字の右へ。縁から 0.30線間ぶん空ける
       （ScoreLineTAB は LS=9.2px に対し 2.8px・半径1.6px）。
       重音では**いちばん後ろの弦の数字**に付ける——一つの音符に一つでよい */
    if(p.di.dots && p.tabRows.length){
      const r = p.tabRows[p.tabRows.length-1];
      for(let d=0; d<p.di.dots; d++)
        txts.push(`<circle cx="${(p.tabCX + r.w/2 + (0.30+d*0.42)*G.LS).toFixed(2)}" `
          +`cy="${r.y.toFixed(2)}" r="${(0.175*G.LS).toFixed(2)}" fill="${INK}"/>`);
    }
  });
  /* 板 → 数字 の順（tab-6.05 と同じ。記号を先に置くと隣の板が削る） */
  /* ══ 記号の段の席取り（draw-1.40）══
     h・p・s・g・bend の字は六線の上の段に並べる。隣と重なれば一段上へ（ScoreLineTAB の席取りと同じ考え） */
  const symRows = [];
  /* 1弦の音に弧が掛かると、弧は六線の上へ出る。その時は字の段を一段上げ、弧と重ねない */
  const onTop = p => p.stops && p.stops.some(st=> st.s === 5);
  const topArc = A.prep.some((p, i)=> !p.rest && onTop(p) && (p.nt.tie || p.nt.crossTie || p.nt.slur || p.nt.tech || p.nt.grace
    || (i > 0 && A.prep[i-1].nt && (A.prep[i-1].nt.tie || A.prep[i-1].nt.slur || A.prep[i-1].nt.tech))));
  const rowBase = G.top - G.LS*(topArc ? 1.55 : 0.45);
  const rowText = (cx, txt, size)=>{
    const w = txt.length*size*0.56 + size*0.3, a = cx - w/2, b = cx + w/2;
    let r = 0;
    while((symRows[r]||[]).some(q=> !(b <= q[0] || a >= q[1]))) r++;
    (symRows[r] = symRows[r] || []).push([a, b]);
    return techText(cx, rowBase - r*size*1.15, txt, size);
  };
  /* ══ 装飾音符の小さな数字（draw-1.40）══ 本体と同じ弦に、左へ小さく */
  A.prep.forEach(p=>{
    if(p.rest || !p.nt.grace || !p.tabRows || !p.tabRows.length) return;
    const r0 = p.tabRows[0], fs2 = G.fs*0.64, txt = String(p.nt.grace.f);
    const w2 = (txt.length*0.60+0.24)*fs2;
    const gx = p.tabCX - r0.w/2 - G.LS*0.95 - w2/2;
    masks.push(`<rect x="${(gx-w2/2).toFixed(2)}" y="${(r0.y-fs2*0.55).toFixed(2)}" width="${w2.toFixed(2)}" height="${(fs2*1.1).toFixed(2)}" fill="#ffffff"/>`);
    txts.push(`<text x="${gx.toFixed(2)}" y="${(r0.y+fs2*0.36).toFixed(2)}" text-anchor="middle" font-size="${fs2.toFixed(2)}" font-weight="700" font-family="${FONT_TAB}" fill="${INK}">${txt}</text>`);
    p.tabGrace = {x:gx, y:r0.y, w:w2, fs:fs2};
  });
  g.push(masks.join(''), txts.join(''));

  /* ── 休符 ── 六線の中ほどに、五線譜と同じ字形で ── */
  A.prep.forEach(p=>{
    if(!p.rest) return;
    const rs = restSpec(p.di.base);
    const yMid = (G.top+G.bot)/2;
    const rSP = SP*0.86;   /* TAB の休符は少し小ぶりに */
    const y = yMid + (p.di.base===T.WHOLE? -rSP/2 : 0);
    g.push(glyph(rs.ch, p.tabCX-0.5*rSP, y, rSP));
    for(let d=0; d<p.di.dots; d++)
      g.push(glyph(SM.dot, p.tabCX-0.5*rSP+(rs.w+0.35+d*0.55)*rSP, y-rSP/2, rSP));
  });

  /* ══ 符尾と連桁（draw-1.20）── ScoreLineTAB tab-1.87〜1.95 を写す ══
     **TABの数字が符頭そのものである。** 符尾は数字の際から直に生え、
     先端は六線の内側（縁から線一本半ぶん）で揃う。六線は渡り切らない。
     以前は根元を六線の下端へ落としていた——記譜の判断ではなく実装の都合で、
     数字と棒が離れて見えていた。

     向きは弦で決まる（tab-1.90）。3弦と4弦のあいだ（2.5）からの隔たりを
     低音側と高音側で比べ、低音側が勝てば上向き。同じだけ隔たっていれば
     低音側を採る——まとまりごと上へ逃がした方が旋律の頭上が空く。

     寸法は px ではなく線間で持つ（ScoreLineTAB は LS=9.2px・pad=7px ゆえ 0.76）。
     **まとまりは analyze() のものを使う** */
  const STEM_MID  = 2.5;                 /* 3弦と4弦のあいだ（si=2 と 3 の境） */
  const STEM_PAD  = 0.76*G.LS;           /* 数字の縁から離す（tab-1.95 の 7px） */
  const STEM_MIN  = 1.00*G.LS;           /* 符尾の最短（線一本ぶん。tab-1.93） */
  const TIP_DOWN  = G.bot - 1.5*G.LS;    /* 共通の先端＝連桁の線（tab-1.92） */
  const TIP_UP    = G.top + 1.5*G.LS;
  /* 弦の並びから向きを決める。si は 0=6弦 … 5=1弦 */
  const stemUpOf = ss => {
    let lo=null, hi=null;
    ss.forEach(v=>{ if(lo==null||v<lo) lo=v; if(hi==null||v>hi) hi=v; });
    if(lo==null) return false;
    const dLo = Math.max(0, STEM_MID-lo);   /* 低音側へどれだけ出ているか */
    const dHi = Math.max(0, hi-STEM_MID);   /* 高音側へどれだけ出ているか */
    return dLo>=dHi && dLo>0;
  };
  /* 根元は外側の数字の際。上向きなら最高音側の上、下向きなら最低音側の下 */
  const tabFootOf = (ss,up) => up ? G.strY(Math.max.apply(null,ss)) - STEM_PAD
                                  : G.strY(Math.min.apply(null,ss)) + STEM_PAD;
  /* 先端は共通の高さ。ただし**必ず根元の向こう側**へ線一本ぶんは出す（tab-1.93）。
     これが無いと、端の弦で先端が根元の手前に来て向きが裏返って見える */
  const tabTipOf = (ss,up) => {
    const f = tabFootOf(ss,up);
    return up ? Math.min(TIP_UP, f-STEM_MIN) : Math.max(TIP_DOWN, f+STEM_MIN);
  };
  const noteStems=[];
  A.prep.forEach(p=>{
    if(p.rest || !p.stops || !(p.di.base < T.WHOLE)) return;
    const ss = p.stops.map(s=>s.s);
    const forced = p.nt && p.nt.stem;                  /* データが向きを告げていれば従う */
    p.tabSS   = ss;
    p.tabUp   = (forced==='up') ? true : (forced==='down') ? false : stemUpOf(ss);
    p.tabFoot = tabFootOf(ss, p.tabUp);
    p.tabTip  = tabTipOf(ss, p.tabUp);
    p.tabX    = p.tabCX;
    noteStems.push(p);
  });
  /* ══ 組は向きを揃え、いちばん外側の音が先端を決める（tab-1.90／1.93）══
     5弦・3弦・5弦・3弦と上下に割れれば、連桁が組ごとに切れてしまう。
     手で向きを告げた音符が混ざっていれば、そちらが多数決を上書きする。 */
  const BH=EG.beam*SP, BG=EG.beamGap*SP;
  A.groups.forEach(gr=>{
    const its = gr.items.filter(p=>!p.rest && p.tabSS);
    if(its.length<2) return;
    const forced = its.filter(p=>p.nt && (p.nt.stem==='up'||p.nt.stem==='down'));
    let dir;
    if(forced.length){
      const u = forced.filter(p=>p.nt.stem==='up').length;
      dir = (u*2===forced.length) ? (forced[0].nt.stem==='up') : (u*2>forced.length);
    }else{
      const all=[]; its.forEach(p=>{ p.tabSS.forEach(v=>all.push(v)); });
      dir = stemUpOf(all);
    }
    let tip = dir ? Infinity : -Infinity;
    its.forEach(p=>{ const t2 = tabTipOf(p.tabSS, dir);
                     tip = dir ? Math.min(tip,t2) : Math.max(tip,t2); });
    its.forEach(p=>{ p.tabUp=dir; p.tabFoot=tabFootOf(p.tabSS,dir); p.tabTip=tip; });
    gr.tabTip = tip; gr.tabUp = dir;
  });
  noteStems.forEach(p=>{
    g.push(`<line x1="${p.tabX.toFixed(2)}" y1="${p.tabFoot.toFixed(2)}" `
      +`x2="${p.tabX.toFixed(2)}" y2="${p.tabTip.toFixed(2)}" stroke="${INK}" `
      +`stroke-width="${(EG.stem*SP).toFixed(2)}"/>`);
    const nf = FLAGS[p.di.base]||0;
    if(nf && !A.beamed.has(p)){
      /* 字形は Bravura のまま、向きだけ選ぶ（取り付け方は五線譜側と同じ） */
      const fy = p.tabUp ? p.tabTip + FLAG_ANCH.up*SP : p.tabTip - FLAG_ANCH.down*SP;
      g.push(glyph(p.tabUp?SM.flagUp[nf]:SM.flagDown[nf], p.tabX-EG.stem*SP/2, fy, SP));
    }
  });
  const tabBeams=[];
  A.groups.forEach(gr=>{
    if(gr.items.length<2 || gr.tabTip==null) return;
    const half=EG.stem*SP/2;
    const y0 = gr.tabTip, up = !!gr.tabUp;
    const levels = Math.max(...gr.items.map(p=>FLAGS[p.di.base]||1));
    const xA=gr.items[0].tabX-half, xB=gr.items[gr.items.length-1].tabX+half;
    /* 一本目の外の縁を先端に合わせ、二本目からは数字の側へ積む。
       向きで符号が変わるだけで、考え方は五線譜と同じ */
    const topOf = lv => up ? (y0 + lv*(BH+BG)) : (y0 - BH - lv*(BH+BG));
    for(let lv=0; lv<levels; lv++){
      const y = topOf(lv);
      const rect=(a,b)=>beamShape(a,b,y,y,BH);
      if(lv===0){ g.push(rect(xA,xB)); tabBeams.push({y,xA,xB,up}); continue; }
      let run=[];
      const flush=()=>{
        if(run.length>=2) g.push(rect(run[0].tabX-half, run[run.length-1].tabX+half));
        else if(run.length===1){
          const a=run[0].tabX, first=(run[0]===gr.items[0]);
          g.push(first? rect(a-half,a+0.85*SP) : rect(a-0.85*SP,a+half));
        }
        run=[];
      };
      gr.items.forEach(p=>{ if((FLAGS[p.di.base]||1)>lv) run.push(p); else flush(); });
      flush();
    }
  });
  /* ══ 弧（タイ・スラー）══
     五線譜と同じ形で、数字どうしを結ぶ。単位は六線の線間。
     符尾の反対側へ——TABでも符尾は数字から生えているので、理屈は同じ。 */
  arcPairs(A.prep, errors).forEach(ar=>{
    const a = ar.a, b = ar.b;
    if(!a.tabRows || !a.tabRows.length || !b.tabRows || !b.tabRows.length) return;
    const up = !a.tabUp;                    /* 符尾が上なら弧は下 */
    const k  = up ? -1 : 1;
    /* スライドは数字から数字へ直線。上がるか下がるかが、線の傾きで分かる */
    if(ar.kind === 'slide' || ar.kind === 'gliss'){
      /* ══ スライドの線は必ず傾ける（draw-1.20）══
         数字の高さで水平に引くと、**六線の線とまるで見分けが付かない**。
         上がるスライドは右上がり、下がるスライドは右下がり。
         同じ弦の同じ高さでも傾け、線であることを示す。 */
      const ra2 = a.tabRows[0], rb2 = b.tabRows[0];
      const x0 = a.tabCX + ra2.w/2 + G.LS*0.16, x1 = b.tabCX - rb2.w/2 - G.LS*0.16;
      if(x1 > x0){
        const fa = a.stops[0].f, fb = b.stops[0].f;
        const rise = (fb < fa) ? -1 : 1;      /* 数字が減る＝低い方へ滑る */
        const h = G.LS*0.34;
        g.push(`<line x1="${x0.toFixed(2)}" y1="${(ra2.y + h*rise).toFixed(2)}" `
          +`x2="${x1.toFixed(2)}" y2="${(rb2.y - h*rise).toFixed(2)}" `
          +`stroke="${INK}" stroke-width="${(G.LS*0.13).toFixed(2)}" stroke-linecap="round"/>`);
        /* 字は六線の上の段へ（ScoreLineTAB の記号の段・draw-1.40） */
        g.push(rowText((x0+x1)/2, TECH_LETTER[ar.kind], G.LS*0.78));
      }
      return;
    }
    const letter = TECH_LETTER[ar.kind] || '';
    /* 数字は大きい（線間の1.5倍）。中心から測って離すと字に潜るので、
       **字の縁**から離す（draw-1.20） */
    const half = G.fs*0.36;
    const rowOf = p => {
      const rows = p.tabRows.slice().sort((x,y2)=>x.y-y2.y);
      return up ? rows[0] : rows[rows.length-1];
    };
    const ra = rowOf(a), rb = rowOf(b);
    const off = k * (half + G.LS*(ar.kind==='tie' ? 0.16 : 0.30));
    const y0 = ra.y + off, y1 = rb.y + off;
    /* タイは数字と数字の間、スラーは数字の真下（真上）から */
    const x0 = (ar.kind==='tie') ? a.tabCX + ra.w/2 + G.LS*0.10 : a.tabCX;
    const x1 = (ar.kind==='tie') ? b.tabCX - rb.w/2 - G.LS*0.10 : b.tabCX;
    /* 六線の線間は五線より広い。そのまま測ると弧が太く重くなるので、五線譜と同じ見た目に寄せる */
    const d  = arcShape(x0, y0, x1, y1, up, G.LS*0.8, null, ar.kind === 'tie' ? 'tie' : 'slur');
    if(d) g.push(d);
    if(letter && d){
      /* 字は六線の上の段へそろえる（draw-1.40）。弧の脇に置くと、数字や符尾に紛れる */
      g.push(rowText((x0+x1)/2, letter, G.LS*0.78));
    }
  });

  /* ══ チョーキング（draw-1.40）══
     ScoreLineTAB の〈標準〉の流儀に合わせ、**字だけ**で示す（bend／h.bend）。
     五線譜には何も足さない（鳴る高さを書かないと決めた）。 */
  A.prep.forEach(p=>{
    if(p.rest || !p.nt.bend || !p.tabRows || !p.tabRows.length) return;
    const r0 = p.tabRows.slice().sort((a,b)=>a.y-b.y)[0];
    const y = Math.min(G.top - G.LS*0.45, r0.y - G.fs*0.36 - G.LS*0.55);
    g.push(rowText(p.tabCX, bendText(p.nt.bend), G.LS*0.78));
  });
  /* ══ 装飾音符からの入り方・ビブラート（draw-1.40）══ */
  const tabNotes = A.prep.filter(p=>!p.rest && p.tabRows && p.tabRows.length);
  tabNotes.forEach((p, i)=>{
    const tg = p.tabGrace;
    if(tg){
      const r0 = p.tabRows[0], lk = p.nt.grace.link || 'h';
      const x0 = tg.x + tg.w/2 + G.LS*0.05, x1 = p.tabCX - r0.w/2 - G.LS*0.05;
      if(lk === 's'){
        const rise = (p.nt.grace.f < r0.f) ? -1 : 1;
        g.push(`<line x1="${x0.toFixed(2)}" y1="${(r0.y + G.LS*0.22*rise).toFixed(2)}" x2="${x1.toFixed(2)}" y2="${(r0.y - G.LS*0.22*rise).toFixed(2)}" stroke="${INK}" stroke-width="${(G.LS*0.11).toFixed(2)}" stroke-linecap="round"/>`);
      }else{
        const y0 = r0.y - G.fs*0.30 - G.LS*0.12;
        const d = arcShape(tg.x, y0, p.tabCX, y0, true, G.LS*0.7, G.LS*0.35, 'slur');
        if(d) g.push(d);
      }
      g.push(rowText((tg.x + p.tabCX)/2, lk === 's' ? 's' : (lk === 'p' ? 'p' : 'h'), G.LS*0.72));
    }
    if(p.nt.vib){
      const nx = tabNotes[i+1];
      const x0 = p.tabCX - G.LS*0.2;
      const xEnd = nx ? nx.tabCX - G.LS*0.8 : W - G.LS*0.6;
      const w = Math.max(G.LS*1.4, xEnd - x0);
      /* 字の段（h・p・bend など）の上へ。重ならないように */
      const rowsUsed = Math.max(1, symRows.length);
      g.push(vibPath(x0, rowBase - rowsUsed*G.LS*0.78*1.15 - G.LS*0.05, w, G.LS*0.8));
    }
  });

  /* 連符の数字（TAB側は数字だけ。括弧は五線譜側が持つ） */
  A.tuplets.forEach(tp=>{
    const xs = tp.items.map(p=>p.tabX!=null?p.tabX:p.tabCX);
    const cx = (Math.min(...xs)+Math.max(...xs))/2;
    /* 先端が六線の内側に来たので、数字は六線の下端から数える */
    const bottom = Math.max(G.bot, ...tp.items.map(p=>p.tabTip||G.bot));
    const digits = String(tp.n).split('').map(d=>SM.tupletDigit(+d)).join('');
    g.push(glyph(digits, cx-0.42*SP*digits.length, bottom+1.15*SP, SP, {scale:0.62}));
  });

  return {
    svg:g.join(''), errors, layout:L, analysis:A, W, SP,
    geom:G, top:G.top, bot:G.bot,
    numbers: A.prep.filter(p=>!p.rest).map(p=>({
      start:p.nt.start, cx:p.tabCX,
      rows:(p.tabRows||[]).map(r=>({s:r.s, f:r.f, y:r.y}))})),
    /* 符尾の居場所も外へ出す（draw-1.20）。検算と、後の弧・奏法が要る */
    stems: noteStems.map(p=>({start:p.nt.start, x:p.tabX, foot:p.tabFoot,
                              tip:p.tabTip, up:!!p.tabUp})),
    beams: tabBeams
  };
}

/* ══════════════════════════════════════════════════════════════
   五線譜とTABを積む（read-0.50）
   ──────────────────────────────────────────────────────────────
   **同じ barLayout() を渡し、同じ analyze() を渡す。**
   これで音符と数字は縦に揃い、連桁のまとまりも必ず一致する。
   ここを二重に持たせた瞬間、本ツールの主張は崩れる。
   ══════════════════════════════════════════════════════════════ */
function renderSystem(bars, opt){
  const SP = opt.SP || 11;
  const staffMid = opt.staffMid != null ? opt.staffMid : SP*8.6;
  const tabTop   = opt.tabTop   != null ? opt.tabTop   : staffMid + SP*7.2;
  const H = opt.H || (tabTop + tabGeom(SP,tabTop).height + SP*5.0);
  let x=0; const out=[], errors=[], meta=[];
  bars.forEach((b,i)=>{
    const W=b.W||opt.W||260;
    const first = (i===0);
    const showClef=first, showTS=(first||!!b.showTS), showKS=(first||!!b.showKS);
    const A = analyze(b);
    const L = barLayout(W,{SP, ks:b.ks|0, ts:b.ts||{n:4,d:4}, showClef, showTS, showKS,
                           bar:b, analysis:A});
    const st = renderBar(b, {W,SP,midY:staffMid,showClef,showTS,showKS,
                             layout:L, analysis:A, beamSlope:opt.beamSlope});
    const tb = renderTabBar(b, {W,SP,topY:tabTop,showClef,showTS,showKS,
                                layout:L, analysis:A});
    /* 解析の誤りだけでなく、**描いてみて初めて分かる誤り**も拾う
       （draw-1.20）。相手のいないタイなどは、描く段になって露見する。
       同じ誤りが五線譜とTABの両方から出るので、重ねずに一つにする */
    const seen = {};
    [A.errors, st.errors, tb.errors].forEach(list=>{
      (list||[]).forEach(e=>{
        const k = `${e.at}|${e.why}`;
        if(seen[k]) return;
        seen[k] = true;
        errors.push(Object.assign({bar:i}, e));
      });
    });
    /* 五線譜とTABを繋ぐ左の縦線（体をひとつに見せる） */
    const join = first
      ? `<line x1="${(EG.barlineThin*SP/2).toFixed(2)}" y1="${st.staffTopY.toFixed(2)}" `
        +`x2="${(EG.barlineThin*SP/2).toFixed(2)}" y2="${tb.bot.toFixed(2)}" `
        +`stroke="${RULE}" stroke-width="${(EG.barlineThick*SP).toFixed(2)}"/>` : '';
    const tie = `<line x1="${(W-EG.barlineThin*SP/2).toFixed(2)}" y1="${st.staffBotY.toFixed(2)}" `
      +`x2="${(W-EG.barlineThin*SP/2).toFixed(2)}" y2="${tb.top.toFixed(2)}" `
      +`stroke="${RULE}" stroke-width="${(EG.barlineThin*SP).toFixed(2)}"/>`;
    out.push(`<g transform="translate(${x},0)">${join}${tie}${st.svg}${tb.svg}</g>`);
    meta.push({x, W, layout:L, staff:st, tab:tb});
    x+=W;
  });
  return { errors, meta, width:x, height:H,
    svg:`<svg viewBox="0 0 ${x} ${H}" width="${x}" height="${H}" xmlns="http://www.w3.org/2000/svg">`
      + `<rect width="${x}" height="${H}" fill="#ffffff"/>${out.join('')}</svg>` };
}

/* ══ 一段（五線譜のみ）══
     renderRow()   → **SVG の文字列だけ**（文字列に errors は生やせない）
     renderRowEx() → { svg, errors } */
function renderRowEx(bars, opt){
  const SP=opt.SP||10, H=opt.H||(SP*17), midY=opt.midY||(SP*8.6);
  let x=0; const out=[], errors=[];
  bars.forEach((b,i)=>{
    const W=b.W||opt.W||240;
    const r=renderBar(b, {W,SP,midY,beamSlope:opt.beamSlope,
      showClef:i===0, showTS:(i===0||!!b.showTS), showKS:(i===0||!!b.showKS)});
    r.errors.forEach(e=>errors.push(Object.assign({bar:i},e)));
    out.push(`<g transform="translate(${x},0)">${r.svg}</g>`); x+=W;
  });
  return { errors,
    svg:`<svg viewBox="0 0 ${x} ${H}" width="${x}" height="${H}" xmlns="http://www.w3.org/2000/svg">`
      + `<rect width="${x}" height="${H}" fill="#ffffff"/>${out.join('')}</svg>` };
}
function renderRow(bars, opt){ return renderRowEx(bars, opt).svg; }

/* ══════════════════════════════════════════════════════════════
   指板（read-0.50）── ScoreLineLead 1.x の fretboardSVG の寸法を移植
   ──────────────────────────────────────────────────────────────
   横向き・**1弦が上**・ナットは太く・ポジションマークは 3,5,7,9,15,17 と
   12は二つ・フレット番号は下・弦の番号は左。開放弦の丸はナットの左。
   ScoreLineLead の寸法：sx=40 sy=30 padL=40 padR=16 padT=18 padB=24
   （大きく出すときは sx=46 sy=48 padL=46 padT=20 padB=28）

   ScoreLineLead は「スケールの音を光らせる」盤だったが、本ツールでは
   **押さえと、その同音異弦**を光らせる。盤の作りはそのまま、意味だけ移す。
   ══════════════════════════════════════════════════════════════ */
const FB_COL = {
  ink:'#1f2937', grid:'#c2c6cf', mark:'#dfe2e8', num:'#8a909c', str:'#9aa0ab',
  press:'#2b3a67', same:'#c2410c', ghost:'#e8ebf3', bg:'#ffffff', board:null
};
/* ══ 指板の装い（read-0.90）══
   検証盤は淡色の格子でよいが、生徒に渡す盤は**楽器そのものに見えるべき**。
   紫檀の指板・ニッケルのフレット・貝のポジションマーク——目の前の楽器と
   同じ姿をしていれば、盤と実物の間で目が迷わない。 */
/* 基準音の輪と、鳴っている音の光。明暗どちらの板でも見えるように */
const FB_EXTRA = {
  light:{root:'#8a6d1f', glow:'rgba(232,181,58,.30)', glowRing:'#c9932a'},
  dark: {root:'#E8B53A', glow:'rgba(232,181,58,.26)', glowRing:'#E8B53A'}
};
const FB_THEME = {
  light: FB_COL,
  dark: {
    ink:'#ded2c2', grid:'#7d6a5e', mark:'#d9e2ea', num:'#9c8778', str:'#b8a596',
    press:'#e8b53a', same:'#7fd1a4', ghost:'#3a2a22',
    bg:'#3a2a22', board:'#3a2a22'
  }
};
function fretboardSVG(o){
  o=o||{};
  const C = Object.assign({},
    (o.theme==='dark') ? FB_THEME.dark : FB_THEME.light,
    (o.theme==='dark') ? FB_EXTRA.dark : FB_EXTRA.light);
  const nF = Math.max(12, Math.min(MAX_FRET, o.frets||MAX_FRET));
  const big = !!o.big;
  const sx=big?46:40, sy=big?48:30, padL=big?46:40, padR=16,
        padT=big?20:18,
        /* ScoreLineLead は padB=24 だったが、6弦の丸（r=11）と
           フレット番号の行が重なっていた。番号の行ぶんだけ空ける */
        padB=big?38:34;
  const W=padL+nF*sx+padR, H=padT+5*sy+padB;
  const capo = o.capo|0;
  const SNM=['1','2','3','4','5','6'];          /* 上が1弦 */
  const rowOf = si => 5-si;                     /* 弦番号(0=6弦) → 行(0=1弦) */
  const xOf = f => (f===0)?(padL-11):(padL+(f-0.5)*sx);
  const yOf = si => padT + rowOf(si)*sy;

  let g=`<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" `
       +`xmlns="http://www.w3.org/2000/svg">`;
  if(C.board){
    /* 指板の板。ナットの左（開放弦の丸が載る側）は板の外なので塗らない */
    g += `<rect x="${padL}" y="${padT-sy*0.55}" width="${nF*sx}" `
       + `height="${5*sy+sy*1.1}" rx="3" fill="${C.board}"/>`;
  } else {
    g += `<rect width="${W}" height="${H}" fill="${C.bg}"/>`;
  }
  /* 弦（下の弦ほど太い）と弦の番号 */
  for(let r=0;r<6;r++){
    const y=padT+r*sy;
    g+=`<line x1="${padL}" y1="${y}" x2="${padL+nF*sx}" y2="${y}" `
      +`stroke="${C.grid}" stroke-width="${(1+r*0.3).toFixed(2)}"/>`;
    g+=`<text x="${padL-26}" y="${y+4}" text-anchor="middle" font-size="10.5" `
      +`font-weight="700" fill="${C.str}" font-family="${FONT_TAB}">${SNM[r]}</text>`;
  }
  /* フレット。ナットは太く */
  for(let f=0;f<=nF;f++){
    const x=padL+f*sx;
    g+=`<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT+5*sy}" `
      +`stroke="${f===0?C.ink:C.grid}" stroke-width="${f===0?3:1}"/>`;
  }
  /* ポジションマーク */
  [3,5,7,9,15,17].forEach(f=>{ if(f>nF) return;
    g+=`<circle cx="${padL+(f-0.5)*sx}" cy="${padT+2.5*sy}" r="4" fill="${C.mark}"/>`; });
  if(nF>=12){
    const x=padL+11.5*sx;
    g+=`<circle cx="${x}" cy="${padT+1.5*sy}" r="4" fill="${C.mark}"/>`;
    g+=`<circle cx="${x}" cy="${padT+3.5*sy}" r="4" fill="${C.mark}"/>`;
  }
  /* フレット番号 */
  [3,5,7,9,12,15,17].forEach(f=>{ if(f>nF) return;
    g+=`<text x="${padL+(f-0.5)*sx}" y="${H-7}" text-anchor="middle" font-size="12" `
      +`font-weight="700" fill="${C.num}" font-family="${FONT_TAB}">${f}</text>`; });
  /* カポ */
  if(capo>0&&capo<=nF){
    const x=padL+(capo-0.5)*sx;
    g+=`<rect x="${x-5}" y="${padT-4}" width="10" height="${5*sy+8}" rx="4" fill="rgba(31,41,55,.16)"/>`;
    g+=`<text x="${x}" y="${padT-7}" text-anchor="middle" font-size="9.5" font-weight="800" `
      +`fill="#4b5563" font-family="${FONT_TAB}">capo</text>`;
  }
  /* ══ 使える範囲だけを明るく残す（draw-1.20）══
     `range:{lo,hi}` を渡すと、その外側を暗い幕で覆う。
     「ここから出るな」を文字で言うより、目で示した方が早い。
     開放弦は板の外にあるので、lo が 0 の時は左の幕を張らない。 */
  if(o.range){
    const lo = Math.max(0, o.range.lo|0), hi = Math.min(nF, o.range.hi|0);
    const veil = (o.theme==='dark') ? 'rgba(10,7,5,.62)' : 'rgba(255,255,255,.66)';
    const top = padT - sy*0.55, hgt = 5*sy + sy*1.1;
    if(lo > 0){
      /* 開放弦の丸は板の左、ナットの外にある。lo が 1 以上なら
         開放も使えないのだから、そこまで覆う */
      const x2 = padL + Math.max(0,(lo-1))*sx;
      g+=`<rect x="0" y="${top}" width="${x2}" height="${hgt}" fill="${veil}"/>`;
    }
    if(hi < nF){
      const x1 = padL + hi*sx;
      g+=`<rect x="${x1}" y="${top}" width="${padL+nF*sx-x1}" height="${hgt}" fill="${veil}"/>`;
    }
  }
  const r0 = big?15:11;
  /* ══ 基準の音に印（draw-1.20）══
     `roots:[{s,f}]` を渡すと、小さな輪を置く。
     ドの在り処を板の上に散らして見せるための口。 */
  (o.roots||[]).forEach(p=>{
    g+=`<circle cx="${xOf(p.f)}" cy="${yOf(p.s)}" r="${r0-3}" fill="none" `
      +`stroke="${C.root||C.same}" stroke-width="2"/>`;
    if(p.label!=null)
      g+=`<text x="${xOf(p.f)}" y="${yOf(p.s)+(big?4:3.5)}" text-anchor="middle" `
        +`font-size="${big?11:8.5}" font-weight="800" fill="${C.root||C.same}" `
        +`font-family="${FONT_TAB}">${p.label}</text>`;
  });
  /* ══ いま鳴っている押さえ（draw-1.20）══
     `glow:[{s,f}]` は押さえより前へ出る。音・譜面・板を一本に繋ぐための印。 */
  (o.glow||[]).forEach(p=>{
    const x=xOf(p.f), y=yOf(p.s);
    g+=`<circle cx="${x}" cy="${y}" r="${r0+5}" fill="${C.glow||'rgba(232,181,58,.28)'}"/>`;
    g+=`<circle cx="${x}" cy="${y}" r="${r0+1}" fill="none" stroke="${C.glowRing||'#E8B53A'}" `
      +`stroke-width="2.4"/>`;
  });
  /* ══ 同音異弦を、輪郭だけで置く ══
     **塗りは面で目に入り、輪郭は線でしか入らない**（ScoreLineLead 1.219 の理屈）。
     押さえた音より前へは出てこないので、目立ちの順が壊れない。 */
  (o.same||[]).forEach(p=>{
    g+=`<circle cx="${xOf(p.f)}" cy="${yOf(p.s)}" r="${r0-2}" fill="none" `
      +`stroke="${C.same}" stroke-width="2" stroke-dasharray="2.4 2"/>`;
  });
  /* 押さえ */
  (o.press||[]).forEach(p=>{
    const x=xOf(p.f), y=yOf(p.s);
    g+=`<circle cx="${x}" cy="${y}" r="${r0}" fill="${C.press}"/>`;
    const t = (p.label!=null)?String(p.label):String(p.f);
    g+=`<text x="${x}" y="${y+(big?5:4)}" text-anchor="middle" font-size="${big?14:10.5}" `
      +`font-weight="800" fill="${C.board||'#ffffff'}" font-family="${FONT_TAB}">${t}</text>`;
  });
  /* ══ 触れる的（o.hit）══
     **見えている物の大きさで的を取る**（tab-4.90 の戒め）。
     的は透明な丸で、位置は光る丸と同じ。ずれれば「押したのに入らない」が起きる。 */
  if(o.hit){
    for(let si=0; si<6; si++) for(let f=0; f<=nF; f++){
      g+=`<circle class="fbhit" data-s="${si}" data-f="${f}" `
        +`cx="${xOf(f)}" cy="${yOf(si)}" r="${r0+1}" fill="transparent"/>`;
    }
  }
  g+=`</svg>`;
  return g;
}
/* 同じ高さの押さえを探す。**探索範囲は MAX_FRET まで（仕様）** */
function samePitchStops(s, f, capo){
  const cap=capo|0, m=OPEN_MIDI[s]+cap+f, out=[];
  for(let s2=0;s2<6;s2++) for(let f2=0;f2<=MAX_FRET;f2++){
    if(s2===s&&f2===f) continue;
    if(OPEN_MIDI[s2]+cap+f2===m) out.push({s:s2,f:f2});
  }
  return out;
}
/* ══ 五線譜の上の当たり判定（判断34＝3）══
   加線4本ぶんまで＝段 22〜46。6弦0F（記譜E3＝段23）から
   1弦17F（記譜A6＝段47）まで、ギターの全域がほぼ収まる。
   **段は半線間おき。**押した y をいちばん近い段へ丸める。 */
const TAP_STEP_MIN = 22, TAP_STEP_MAX = 46;
function stepAtY(y, midY, SP){
  const raw = MID_STEP + (midY - y)/(SP/2);
  const st  = Math.round(raw);
  return Math.max(TAP_STEP_MIN, Math.min(TAP_STEP_MAX, st));
}
function yAtStep(st, midY, SP){ return midY - (st-MID_STEP)*(SP/2); }

/* 段と変化記号から、記譜の音高（MIDI）を出す。
   **段は音名の高さ（C D E…）であって半音ではない。**
   段だけでは音は決まらず、調号と臨時記号が要る。 */
function midiFromStep(absStep, alter, ks){
  const L = ((absStep%7)+7)%7;
  const oct = (absStep - L)/7;
  const a = (alter==null) ? keyAlterTable(ks)[L] : alter;
  return 12*(oct+1) + BASE[L] + a;
}
/* ══════════════════════════════════════════════════════════════
   五線譜一段＋TAB複数段（read-0.80）
   ──────────────────────────────────────────────────────────────
   **五線譜は一段のまま。TABだけが下へ積まれる。**
   すべての段が同じ barLayout() を使うので、縦は必ず揃う。
   ここを段ごとに計算すれば、いちばん見せたい「音符は動かない」が崩れる。

   bars … [{ks,ts,notes,W, tabs:[{notes,label}…]}]
   ══════════════════════════════════════════════════════════════ */
function renderStack(bars, opt){
  const SP = opt.SP || 12;
  const staffMid = opt.staffMid != null ? opt.staffMid : SP*8.6;
  const gap      = opt.tabGap  != null ? opt.tabGap  : SP*3.0;  /* 符尾と連桁が下へ出るぶん */
  const first    = opt.firstTabTop != null ? opt.firstTabTop : staffMid + SP*7.2;
  const labelW   = opt.labelW != null ? opt.labelW : 0;
  const nTabs = Math.max(1, ...bars.map(b=>(b.tabs||[]).length));
  const tabH  = tabGeom(SP,0).height;
  const tops  = [];
  for(let k=0;k<nTabs;k++) tops.push(first + k*(tabH+gap));
  const H = opt.H || (tops[tops.length-1] + tabH + SP*4.2);

  let x=labelW; const out=[], errors=[], meta=[];
  bars.forEach((b,i)=>{
    const W=b.W||opt.W||300;
    const showClef=(i===0), showTS=(i===0||!!b.showTS), showKS=(i===0||!!b.showKS);
    const A = analyze(b);
    const L = barLayout(W,{SP, ks:b.ks|0, ts:b.ts||{n:4,d:4}, showClef, showTS, showKS,
                           bar:b, analysis:A,
                           tabs:(b.tabs||[]).map(t=>t.notes||[])});
    const st = renderBar(b, {W,SP,midY:staffMid,showClef,showTS,showKS,
                            layout:L, analysis:A, beamSlope:opt.beamSlope});
    A.errors.forEach(e=>errors.push(Object.assign({bar:i, stave:'staff'},e)));
    let g = st.svg;
    const tabs=[];
    (b.tabs||[]).forEach((tb,k)=>{
      const tA = analyze({ks:b.ks, ts:b.ts, notes:tb.notes||[]});
      const tr = renderTabBar({ks:b.ks, ts:b.ts, notes:tb.notes||[]},
        {W,SP,topY:tops[k],showClef,showTS,showKS, layout:L, analysis:tA});
      tA.errors.forEach(e=>errors.push(Object.assign({bar:i, stave:'tab'+(k+1)},e)));
      /* 五線譜と各TAB段を縦線でつなぎ、ひとつの体に見せる */
      const prevBot = (k===0) ? st.staffBotY : (tops[k-1]+tabH);
      g += `<line x1="${(W-EG.barlineThin*SP/2).toFixed(2)}" y1="${prevBot.toFixed(2)}" `
         + `x2="${(W-EG.barlineThin*SP/2).toFixed(2)}" y2="${tops[k].toFixed(2)}" `
         + `stroke="${RULE}" stroke-width="${(EG.barlineThin*SP).toFixed(2)}"/>`;
      g += tr.svg;
      tabs.push(tr);
    });
    if(i===0){
      g = `<line x1="${(EG.barlineThin*SP/2).toFixed(2)}" y1="${st.staffTopY.toFixed(2)}" `
        + `x2="${(EG.barlineThin*SP/2).toFixed(2)}" `
        + `y2="${(tops[Math.max(0,(b.tabs||[]).length-1)]+tabH).toFixed(2)}" `
        + `stroke="${RULE}" stroke-width="${(EG.barlineThick*SP).toFixed(2)}"/>` + g;
    }
    out.push(`<g transform="translate(${x},0)">${g}</g>`);
    meta.push({x, W, layout:L, staff:st, tabs, tops});
    x+=W;
  });

  /* 段の名（左の余白に置く） */
  let labels='';
  if(labelW>0){
    (bars[0] && bars[0].tabs || []).forEach((tb,k)=>{
      if(!tb.label) return;
      labels += `<text x="${(labelW-8).toFixed(2)}" y="${(tops[k]+tabH/2+SP*0.35).toFixed(2)}" `
        + `text-anchor="end" font-size="${(SP*0.95).toFixed(2)}" font-weight="700" `
        + `fill="#7c8290" font-family="${FONT_TAB}">${tb.label}</text>`;
    });
  }
  return { errors, meta, tops, width:x, height:H,
    svg:`<svg viewBox="0 0 ${x} ${H}" width="${x}" height="${H}" xmlns="http://www.w3.org/2000/svg">`
      + `<rect width="${x}" height="${H}" fill="#ffffff"/>${labels}${out.join('')}</svg>` };
}



/* ══ 外への口（draw-0.10）══
   内で使う名は外へ漏らさない。譜面を描く道具だけを差し出す。 */
const API = {
  T, TPQ, OPEN_MIDI, MAX_FRET, MID_STEP, STAFF_STEPS,
  TAP_STEP_MIN, TAP_STEP_MAX,
  spell, keyAlterTable, durInfo, keySig, barLayout, analyze,
  renderBar, renderTabBar, renderSystem, renderRow, renderRowEx, renderStack,
  fretboardSVG, tabGeom, arcShape, arcPairs, bendText, TECH_LETTER,
  stepAtY, yAtStep, midiFromStep, samePitchStops,
  version: 'draw-1.40'
};
if(typeof window !== 'undefined') window.SLDraw = API;
if(typeof globalThis !== 'undefined') globalThis.SLDraw = API;

})();


/* 共通の呼び名と、フォントの読み込みを待つ口 */
(function(){
  if(typeof window==='undefined'||!window.SLDraw)return;
  window.DS=window.DS||{};
  window.DS.notation=window.SLDraw;
  window.SLDraw.ready=function(){
    try{return (document.fonts&&document.fonts.load)?document.fonts.load('20px Bravura').then(function(){return true;}):Promise.resolve(true);}
    catch(e){return Promise.resolve(false);}
  };
})();
