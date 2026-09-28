/* yagarguitar-stack 共通デザイン v1 — 指板の図（fretboard.js）
   ──────────────────────────────────────────────────────────────
   読み込むと DS.fret が使える。SVG の文字列を返すので、要素の innerHTML に入れるだけ。

     el.innerHTML = DS.fret.svg({ frets:12, notes:[{s:5,f:0},{s:4,f:1}] });

   標準の見た目：エボニーの指板・均等なフレット間隔・丸のポジションマーク・音名ごとに12色。
   すべて指定で変えられる（wood／spacing／colorMode）。

   ══ 弦の数え方 ══
   s は 0＝6弦 … 5＝1弦（五線譜の notation.js と同じ並び）。f はフレット（0＝開放）。

   ══ 寸法 ══
   spacing:'even'（標準）の時は、notation.js の fretboardSVG と全く同じ寸法で描く。
   （普通：1フレット40・弦の間30・左40・上18／big:true：46・48・46・20）
   押された場所を座標から割り出すツールがあるため、この値は変えないこと。
   割り出しは DS.fret.hitAt() を使えば、間隔の種類を問わず正しく出る。

   ══ 描ける役割（重なる順）══
     range   … 使える範囲の外を暗い幕で覆う {lo,hi}
     capo    … カポの位置
     roots   … 基準の音の小さな輪 [{s,f,label}]
     glow    … いま鳴っている押さえの光 [{s,f}]
     same    … 同じ高さの別の押さえ（点線の輪）[{s,f}]
     press   … 押さえ（役割の色で塗る。文字はフレット番号か label）[{s,f,label}]
     notes   … 音を並べて見せる丸（音名ごとの色など）[{s,f,label,color,ring}]
     hit     … true で、押せる透明な的（class="fbhit" data-s data-f）を置く
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  var OPEN = [40,45,50,55,59,64];
  var FONT = "'Zen Kaku Gothic New',-apple-system,'Helvetica Neue',Arial,sans-serif";
  var NAMES = {
    en:{sharp:['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'], flat:['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']},
    it:{sharp:['ド','ド#','レ','レ#','ミ','ファ','ファ#','ソ','ソ#','ラ','ラ#','シ'], flat:['ド','レb','レ','ミb','ミ','ファ','ソb','ソ','ラb','ラ','シb','シ']}
  };
  /* 音名ごとの12色（フレットボードトレーナーの色分けに合わせた） */
  var PC = ['#d9493a','#e07a2b','#d9a51c','#38b36a','#22a58c','#4a8fcf','#9b59b6','#e0406a','#1fb3c4','#86ad3c','#ec8f1a','#7a5440'];
  /* 度数ごと：ルート・3度（短長）・5度。そのほかは灰 */
  function degColor(iv){ return {0:'#d9493a',3:'#d9a51c',4:'#d9a51c',7:'#4a8fcf'}[iv] || '#8a8680'; }
  var WOOD = {
    ebony:{board:'#2a2320', grain:'#221c1a', edge:'#5c4b40', fret:'#cfc6b4', nut:'#efe6d2', mark:'#e8e2d6'},
    rose: {board:'#7c4a2e', grain:'#6a3d25', edge:'#5a3520', fret:'#d8ccb2', nut:'#efe6d2', mark:'#d9d2c4'},
    maple:{board:'#e2c38c', grain:'#d4b27a', edge:'#b8955e', fret:'#9a8e78', nut:'#f4ecdc', mark:'#2a2320'}
  };
  /* 板の外（弦番号・フレット番号・幕）と、役割の色。明暗どちらの画面にも置けるように */
  var THEME = {
    dark: {num:'#9c8778', str:'#b8a596', press:'#e8b53a', pressText:'#2a1a08', same:'#7fd1a4',
           root:'#E8B53A', glow:'rgba(232,181,58,.26)', glowRing:'#E8B53A', veil:'rgba(10,7,5,.62)', capo:'rgba(239,230,210,.22)', capoText:'#d9cbb8'},
    light:{num:'#8a909c', str:'#9aa0ab', press:'#2b3a67', pressText:'#ffffff', same:'#c2410c',
           root:'#8a6d1f', glow:'rgba(232,181,58,.30)', glowRing:'#c9932a', veil:'rgba(255,255,255,.66)', capo:'rgba(31,41,55,.16)', capoText:'#4b5563'}
  };
  var STR_W = [1.1,1.4,1.9,2.4,2.9,3.4];       /* 1弦→6弦の太さ */
  var STR_PLAIN = '#d4d6d8', STR_WOUND = '#c9a24b';

  function f2(n){ return (+n).toFixed(2); }
  function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  /* 寸法と座標の割り出し */
  function geom(o){
    o = o || {};
    var nF = Math.max(1, Math.min(24, o.frets || 12));
    var big = !!o.big;
    var sx = big?46:40, sy = big?48:30, padL = big?46:40, padR = 16, padT = big?20:18, padB = big?38:34;
    var total = nF*sx, W = padL+total+padR, H = padT+5*sy+padB;
    var real = o.spacing === 'real';
    var norm = 1 - Math.pow(2, -nF/12);
    function xF(f){ return real ? padL + total*(1-Math.pow(2,-f/12))/norm : padL + f*sx; }   /* f 本目のフレット線 */
    function xOf(f){ return f===0 ? padL-11 : (xF(f-1)+xF(f))/2; }                             /* f フレットの丸の中心 */
    function yOf(si){ return padT + (5-si)*sy; }                                                  /* si=0 が6弦（いちばん下） */
    function at(x,y){
      var row = Math.round((y-padT)/sy);
      if(row < -0.6 || row > 5.6) return null;
      var s = 5 - Math.max(0, Math.min(5, row));
      if(x < padL) return {s:s, f:0};
      for(var f=1; f<=nF; f++){ if(x < xF(f)) return {s:s, f:f}; }
      return {s:s, f:nF};
    }
    return {nF:nF, big:big, sx:sx, sy:sy, padL:padL, padR:padR, padT:padT, padB:padB, W:W, H:H,
            xF:xF, xOf:xOf, yOf:yOf, at:at};
  }

  function svg(o){
    o = o || {};
    var G = geom(o), C = THEME[o.theme==='light'?'light':'dark'], Wd = WOOD[o.wood] || WOOD.ebony;
    var nF = G.nF, padL = G.padL, padT = G.padT, sx = G.sx, sy = G.sy;
    var tuning = o.tuning || OPEN, capo = o.capo|0;
    var r0 = G.big ? 15 : 11;
    var top = padT - sy*0.55, hgt = 5*sy + sy*1.1, right = G.xF(nF);
    var g = '<svg viewBox="0 0 '+G.W+' '+G.H+'" width="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';

    /* 板・木目・縁 */
    g += '<rect x="'+padL+'" y="'+f2(top)+'" width="'+f2(right-padL)+'" height="'+f2(hgt)+'" rx="3" fill="'+Wd.board+'" stroke="'+Wd.edge+'" stroke-width="1"/>';
    for(var k=0; k<6; k++){
      var gy = top + hgt*(0.12 + k*0.16) + (k%2)*2;
      g += '<line x1="'+padL+'" y1="'+f2(gy)+'" x2="'+f2(right)+'" y2="'+f2(gy+2.5)+'" stroke="'+Wd.grain+'" stroke-width="1.3" opacity=".75"/>';
    }
    /* ポジションマーク */
    [3,5,7,9,15,17,19,21].forEach(function(f){ if(f>nF) return;
      g += '<circle cx="'+f2(G.xOf(f))+'" cy="'+f2(padT+2.5*sy)+'" r="'+(G.big?5:4.2)+'" fill="'+Wd.mark+'"/>'; });
    [12,24].forEach(function(f){ if(f>nF) return;
      g += '<circle cx="'+f2(G.xOf(f))+'" cy="'+f2(padT+1.5*sy)+'" r="'+(G.big?5:4.2)+'" fill="'+Wd.mark+'"/>';
      g += '<circle cx="'+f2(G.xOf(f))+'" cy="'+f2(padT+3.5*sy)+'" r="'+(G.big?5:4.2)+'" fill="'+Wd.mark+'"/>'; });
    /* フレットとナット */
    for(var f=1; f<=nF; f++){
      var x = G.xF(f), fw = G.big?3:2.6;
      g += '<rect x="'+f2(x-fw/2)+'" y="'+f2(top)+'" width="'+fw+'" height="'+f2(hgt)+'" fill="'+Wd.fret+'"/>';
    }
    g += '<rect x="'+f2(padL-4)+'" y="'+f2(top-1)+'" width="7" height="'+f2(hgt+2)+'" rx="1.5" fill="'+Wd.nut+'"/>';
    /* 弦（巻き弦は金、プレーン弦は銀。低い弦ほど太い）と弦番号 */
    for(var r=0; r<6; r++){
      var y = padT + r*sy;
      g += '<line x1="'+f2(padL-4)+'" y1="'+y+'" x2="'+f2(right)+'" y2="'+y+'" stroke="'+(r<2?STR_PLAIN:STR_WOUND)+'" stroke-width="'+STR_W[r]+'"/>';
      g += '<text x="'+(padL-26)+'" y="'+(y+4)+'" text-anchor="middle" font-size="10.5" font-weight="700" fill="'+C.str+'" font-family="'+FONT+'">'+(r+1)+'</text>';
    }
    /* フレット番号 */
    (o.numbers || [3,5,7,9,12,15,17,19,21,24]).forEach(function(f){ if(f>nF) return;
      g += '<text x="'+f2(G.xOf(f))+'" y="'+(G.H-7)+'" text-anchor="middle" font-size="12" font-weight="700" fill="'+C.num+'" font-family="'+FONT+'">'+f+'</text>'; });
    /* カポ */
    if(capo>0 && capo<=nF){
      var cx = G.xOf(capo);
      g += '<rect x="'+f2(cx-5)+'" y="'+(padT-4)+'" width="10" height="'+(5*sy+8)+'" rx="4" fill="'+C.capo+'"/>';
      g += '<text x="'+f2(cx)+'" y="'+(padT-7)+'" text-anchor="middle" font-size="9.5" font-weight="800" fill="'+C.capoText+'" font-family="'+FONT+'">capo</text>';
    }
    /* 使える範囲の外を覆う幕 */
    if(o.range){
      var lo = Math.max(0, o.range.lo|0), hi = Math.min(nF, o.range.hi|0);
      if(lo > 0){ var x2 = lo>1 ? G.xF(lo-1) : padL; g += '<rect x="0" y="'+f2(top)+'" width="'+f2(x2)+'" height="'+f2(hgt)+'" fill="'+C.veil+'"/>'; }
      if(hi < nF){ var x1 = G.xF(hi); g += '<rect x="'+f2(x1)+'" y="'+f2(top)+'" width="'+f2(right-x1)+'" height="'+f2(hgt)+'" fill="'+C.veil+'"/>'; }
    }
    /* 基準の音の輪 */
    (o.roots||[]).forEach(function(p){
      g += '<circle cx="'+f2(G.xOf(p.f))+'" cy="'+G.yOf(p.s)+'" r="'+(r0-3)+'" fill="none" stroke="'+C.root+'" stroke-width="2"/>';
      if(p.label!=null) g += '<text x="'+f2(G.xOf(p.f))+'" y="'+f2(G.yOf(p.s)+(G.big?4:3.5))+'" text-anchor="middle" font-size="'+(G.big?11:8.5)+'" font-weight="800" fill="'+C.root+'" font-family="'+FONT+'">'+esc(p.label)+'</text>';
    });
    /* 鳴っている押さえの光 */
    (o.glow||[]).forEach(function(p){
      var x = G.xOf(p.f), y = G.yOf(p.s);
      g += '<circle cx="'+f2(x)+'" cy="'+y+'" r="'+(r0+5)+'" fill="'+C.glow+'"/>';
      g += '<circle cx="'+f2(x)+'" cy="'+y+'" r="'+(r0+1)+'" fill="none" stroke="'+C.glowRing+'" stroke-width="2.4"/>';
    });
    /* 同じ高さの別の押さえ（輪郭だけ） */
    (o.same||[]).forEach(function(p){
      g += '<circle cx="'+f2(G.xOf(p.f))+'" cy="'+G.yOf(p.s)+'" r="'+(r0-2)+'" fill="none" stroke="'+C.same+'" stroke-width="2" stroke-dasharray="2.4 2"/>';
    });
    /* 押さえ */
    (o.press||[]).forEach(function(p){
      var x = G.xOf(p.f), y = G.yOf(p.s), t = (p.label!=null) ? String(p.label) : String(p.f);
      g += '<circle cx="'+f2(x)+'" cy="'+y+'" r="'+r0+'" fill="'+C.press+'"/>';
      g += '<text x="'+f2(x)+'" y="'+(y+(G.big?5:4))+'" text-anchor="middle" font-size="'+(G.big?14:10.5)+'" font-weight="800" fill="'+C.pressText+'" font-family="'+FONT+'">'+esc(t)+'</text>';
    });
    /* 音を並べて見せる丸 */
    var mode = o.colorMode || 'pc', nm = NAMES[o.names==='it'?'it':'en'][o.accidental==='flat'?'flat':'sharp'];
    var rootPc = (o.root==null) ? 0 : (((o.root%12)+12)%12);
    (o.notes||[]).forEach(function(p){
      var x = G.xOf(p.f), y = G.yOf(p.s);
      var pc = (((tuning[p.s] + capo + p.f) % 12) + 12) % 12;
      var col = p.color || (mode==='deg' ? degColor((pc-rootPc+12)%12) : mode==='mono' ? (o.monoColor||'#c8962e') : PC[pc]);
      if(p.ring) g += '<circle cx="'+f2(x)+'" cy="'+y+'" r="'+(r0+4)+'" fill="none" stroke="#f08a2c" stroke-width="2.6"/>';
      g += '<circle cx="'+f2(x)+'" cy="'+y+'" r="'+r0+'" fill="'+col+'" stroke="rgba(0,0,0,.28)" stroke-width="1"/>';
      var lab = (p.label!=null) ? String(p.label) : nm[pc];
      if(lab!=='') g += '<text x="'+f2(x)+'" y="'+f2(y+(G.big?5:3.8))+'" text-anchor="middle" font-size="'+(lab.length>2?(G.big?11:8.5):(G.big?13:10))+'" font-weight="700" fill="#ffffff" font-family="'+FONT+'">'+esc(lab)+'</text>';
    });
    /* 押せる的（見えている丸と同じ位置・大きさ） */
    if(o.hit){
      for(var si=0; si<6; si++) for(var ff=0; ff<=nF; ff++)
        g += '<circle class="fbhit" data-s="'+si+'" data-f="'+ff+'" cx="'+f2(G.xOf(ff))+'" cy="'+G.yOf(si)+'" r="'+(r0+1)+'" fill="transparent"/>';
    }
    return g + '</svg>';
  }

  /* 画面上の位置（clientX/Y）から、何弦の何フレットかを返す。外なら null */
  function hitAt(svgEl, clientX, clientY, o){
    if(!svgEl) return null;
    var b = svgEl.getBoundingClientRect(), vb = (svgEl.getAttribute('viewBox')||'').split(/\s+/).map(Number);
    var k = (b.width && vb[2]) ? Math.min(b.width/vb[2], b.height/vb[3]) : 1;
    var ox = (b.width - vb[2]*k)/2, oy = (b.height - vb[3]*k)/2;   /* 縦横比を保って中央に置かれた分 */
    return geom(o).at((clientX-b.left-ox)/k, (clientY-b.top-oy)/k);
  }

  var API = {svg:svg, geom:geom, hitAt:hitAt, OPEN:OPEN.slice(), colors:PC.slice(),
             noteName:function(pc,o){ o=o||{}; return NAMES[o.names==='it'?'it':'en'][o.accidental==='flat'?'flat':'sharp'][((pc%12)+12)%12]; },
             version:'fret-1.00'};
  if(typeof window !== 'undefined'){ window.DS = window.DS || {}; window.DS.fret = API; }
})();
