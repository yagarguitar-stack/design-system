/* ══════════════════════════════════════════════════════════════
   ScoreLine ギターの音（共通）— design-system v1/guitar.js
   ScoreLine TAB・Lead・Compass が同じ音を鳴らすための部品。
   ScoreLine TAB（tab-7.07）の音の仕組みをそのまま切り出した物（tab-7.08）。
     音色の表・弦の鳴らし方・奏法の鳴らし方・歪み・エフェクト・パートごとの通り道
   譜面の読み方・ミキサー・ドラム・録音は、使う道具の側に残す。

   使い方：
     SLGuitar.host({ song, toast, audioReady, playVol, strCount, tp, busOut })  … 道具の側の受け口
     SLGuitar.attach(AudioContext, 出口のGain)                        … 器を作った時に一度
   ══════════════════════════════════════════════════════════════ */
(function(){
const H={ song:()=>null, toast:()=>{}, audioReady:()=>null, playVol:()=>1, strCount:()=>6, tp:()=>null, busOut:()=>MASTER };
let AC=null, MASTER=null;


/* ══ ギターの音色 ══
   音源は持たず、その場で弦の振動を計算している（Karplus-Strong）。
   **遅延線の回し方そのものは触らないこと。** 均しの重みを変えると
   鳴る高さがずれる（ksFreq が 0.5 の平均を前提にしている）。
   音色は、その周りの四つで作る。

     seed   … 弾いた瞬間の雑音の均し。小さいほど丸く、大きいほど鋭い
     t60    … 弦が鳴りやむまでの秒。低音側／高音側
     lp     … 出口のローパス（倍率・下駄・上限）
     body   … 胴鳴り。[Hz, dB, Q] の並び。空なら胴の無い音（エレキ）
     trim   … 音量の釣り合い */
/* **「エレキっぽい」の正体はここにあった。**
   Karplus-Strong は、それだけでは「弦の振動」しか出さない。
   生ギターらしさは、弦そのものより**その周り**から来る——

     ① 弾いた瞬間の音（爪やピックが弦に当たる、ピッチの無い一撃）
     ② 箱の鳴り（木の胴が持つ、たくさんの共振の集まり）
     ③ 立ち上がりの明るさの落ち方（最初は倍音だらけ、じきに丸くなる）

   旧版は①が無く、②はピーキングEQ二つ、③は掛けっぱなしのローパスだった。
   減衰と明るさをいじっただけでは、どれも「弦の音」の域を出ない。

   ②は**胴の畳み込み（Convolver）**で作る。減衰する正弦波の束を
   その場で合成して応答とする（音源は持たない、という縛りは守れる）。 */
/* ══ 音色ごとの trim（出力の釣り合い）══
   耳の当てずっぽうで置くと、音色を変えるたびに音量が跳ねる。
   **鳴り始め0.3秒の平均**を測り、アコースティックに合わせてある。

   ══ 窓の取り方で答えが変わる ══
   頭だけで揃えると、歪んだ音は伸びるぶん大きく聞こえる。
   長い窓で揃えると、今度は頭が痩せて聞こえる。
   **0.6秒**——音一つぶんの聞こえ方に近い長さ——で揃えてある。

   それでも長い音では歪みが 1.5〜2 倍残る。これは音量の狂いではなく
   **伸びるという性質そのもの**なので、揃えにいくと歪みらしさが消える。

   ブリッジミュートだけは短いので平均で揃えられない（頭が過大になる）。
   こちらは頭で合わせてある。

   数は `lvl2.js` で出す。耳の当てずっぽうで置くと、
   音色を変えるたびに音量が跳ねる。 */
const TONES=[
  { id:'steel', label:'アコースティック（スチール）',
    seed:0.50, t60:[4.4,7.2], lp:[12,1800,8000], swp:[2.6,60],
    /* ══ 立ち上がりを締めた（tab-1.76）══
       ピックの当たりが 14ms と長く、明るさの掃引も 120ms あった。
       スチールは撥で弾く弦なので、当たりはもっと短く鋭い。 */
    pick:[3800,1.1,0.006,0.42],
    modes:[[100,0.62,0.10],[196,0.80,0.09],[248,0.55,0.075],[385,0.45,0.06],
           [432,0.30,0.055],[560,0.26,0.045],[730,0.18,0.035],[980,0.12,0.028]],
    /* 総量で正規化したので、wet は素直な混ぜ具合になった（tab-1.76） */
    wet:0.45, trim:0.92 },
  { id:'nylon', label:'ナイロン（クラシック）',
    seed:0.26, t60:[3.4,5.0], lp:[8,1100,4600], swp:[2.2,160],
    pick:[1500,0.7,0.018,0.34],
    modes:[[96,0.60,0.12],[182,0.85,0.11],[222,0.50,0.09],[338,0.40,0.07],
           [402,0.24,0.06],[520,0.16,0.05]],
    wet:0.52, trim:1.10 },
  { id:'clean', label:'エレキ（クリーン）',
    seed:0.75, t60:[6.0,9.4], lp:[18,2600,11000], swp:[1.4,60],
    pick:[4200,1.2,0.006,0.16],
    modes:[], wet:0, trim:1.33 },
  /* ══ 歪み ══
     drive:[前段の増幅, 潰しの深さ, キャビネットの上限Hz, 中域の山Hz,
            中域の持ち上げdB（負なら掘る）, 歪ませる前の低音切りHz（0で切らない）]
     弦そのものは素直に鳴らし、歪みは**全弦を混ぜた後**で掛ける（下の bus 参照）。
     ゆえにここでの seed / t60 / lp は「アンプへ送り込む前の弦の音」である。

     歪むと音は縮む（強く弾いても頭打ちになる）ので、
     ピックの当たりは弱め、減衰は長めに取る。実物も歪ませると伸びる。 */
  { id:'crunch', label:'エレキ（クランチ）',
    seed:0.80, t60:[7.0,10.8], lp:[20,3000,12000], swp:[1.3,45],
    pick:[4000,1.1,0.005,0.10],
    modes:[], wet:0, trim:0.156,
    drive:[3,3.2,5200,900,4] },
  { id:'drive',  label:'エレキ（ドライブ）',
    seed:0.86, t60:[8.5,13.0], lp:[22,3400,13000], swp:[1.2,35],
    pick:[4400,1.1,0.004,0.06],
    modes:[], wet:0, trim:0.080,
    drive:[6,9,4200,780,6] },
  /* ══ ハイゲイン（tab-1.75）══
     ドライブより上を足した。歪みを深くするだけでは「潰れた」音にしかならない。
     実物のハイゲインが締まって聞こえるのは、**歪ませる前に低音を切っている**からで、
     それをしないと低音が先に潰れて、和音が泥のようになる（`hp`）。
     中域を掘る（mg が負）のがこの音の顔である。 */
  { id:'metal', label:'エレキ（ハイゲイン）',
    seed:0.90, t60:[10.0,15.0], lp:[24,3600,13500], swp:[1.15,30],
    pick:[4600,1.0,0.003,0.04],
    /* trim は「ドライブと同じ大きさに聞こえる所」。中域を掘るぶんも見込んである */
    modes:[], wet:0, trim:0.099,
    drive:[16,26,3300,640,-7,170,7] },
  /* ══ 超ハイゲイン（tab-4.79）══
     L様——「ディストーションで今のハイゲインよりも歪んだ音が欲しい」。

     ハイゲイン（`metal`）より上を足す。深くするだけでは潰れきった音のまま
     変わらない（tab-1.75 で書いたとおり）ので、**四つ**を一緒に動かす。

       ① 前段の増幅を 16→30、潰しを 26→55。波形は角が立ち、ほぼ矩形へ寄る
       ② 二段目の潰しを 7→14。一段目で角の立った波を**もう一度濾してから**
          潰すので、倍音の並びが変わる——ここが「歪みの層」を作る
       ③ 二段目の前の濾しを 6000→5200Hz。中域から上を挽くと、
          耳には「粗さ」ではなく**密度**として届く
       ④ 歪ませる前の低音切りを 170→220Hz。深く潰すほど低音が先に潰れるので、
          切る位置も一緒に上げねば和音が泥になる

     中域はさらに掘り（-7→-9dB）、キャビネットの上限も 3300→3100Hz へ。
     深く潰すと上が耳に刺さるので、締める方へ寄せる。
     弦そのものは伸ばし（歪ませれば伸びる）、ピックの当たりはさらに弱く——
     潰れきった音では、当たりだけが浮いて聞こえる。 */
  { id:'insane', label:'エレキ（超ハイゲイン）',
    seed:0.92, t60:[12.0,17.0], lp:[26,3800,14000], swp:[1.1,26],
    pick:[4800,1.0,0.0025,0.03],
    /* trim は「ハイゲインと同じ大きさに聞こえる所」。掘りと締めのぶんを見込む */
    modes:[], wet:0, trim:0.086,
    drive:[30,55,4000,700,-8,220,14,5200,3.4,0.30] },
  { id:'mute',  label:'ブリッジミュート',
    seed:0.60, t60:[0.34,0.50], lp:[8,900,3600], swp:[1.8,50],
    pick:[2200,1.0,0.009,0.44],
    modes:[[104,0.55,0.05],[190,0.5,0.045],[300,0.3,0.035]],
    wet:0.32, trim:1.03 },
];
/* ══ 既定の音色（tab-2.49）══
   この道具はエレキギター用のTAB譜である。初期値がアコースティックでは筋が合わない。
   既にある曲は各々 `play.tone` を持つので、変わるのは新しい曲の初期値だけ。 */
const TONE_DEF='crunch';
const BODY_DEF=1;
const DRIVE_DEF=1;
const SUSTAIN_DEF=1;
const FX_DELAY_MUL={'16':0.25,'t8':1/3,'8':0.5,'d8':0.75,'t4b':2/3,'4':1,'d4':1.5,'2':2,'d2':3,'1':4};
const FX_COMP=[['0','なし'],['0.4','控えめ'],['0.7','ふつう'],['1','たっぷり'],['1.3','どっぷり']];

/* 摘みの読み出し。**書いていなければ「なし」**——
   既にある曲を開いた時に、勝手に音が変わってはならない */
function fxOf(s,k,def){
  /* セクションの束が差し込まれていればそちらが勝つ（tab-3.00） */
  const src=(typeof _sndNow!=='undefined'&&_sndNow&&_sndNow.fx)
              ? _sndNow.fx : ((s&&s.play&&s.play.fx)||null);
  const v=src?src[k]:undefined;
  return (v===undefined||v===null)?(def===undefined?0:def):v;
}
function fxNum(s,k,def){ const v=parseFloat(fxOf(s,k,def)); return isFinite(v)?v:(def||0); }
/* ══ 余韻の始末（tab-2.72）══
   L様——「一つ一つの音の音価（余韻）が残って濁ることがある」。

   実測——一音が鳴り止むまで **8.5〜10.8秒**。♩=61 の16分音符は **0.246秒**。
   **一音が四十音ぶん鳴り続けている。** 同じ弦なら次の音が止めるが（tab-1.46）、
   **弦をまたいだ音は誰も止めていなかった。**
   実弦でもそうではあるが、弾く人は左手の余りと右手の腹で常に消している。
   その「消す手」が無かった。

   'free' … 消さない（tab-2.71 までの鳴り方）
   'mono' … 単音の所だけ、次の音で前を消す（既定）
   'note' … 書いた音価で切る（譜面どおり）

   let ring と、伸ばしている最中のタイは**どの流儀でも消さない**——
   「伸ばす」と書いてあるものを消せば、書いたことと鳴ることが食い違う。 */
const RING_DEF='mono';
function ringMode(s){
  const v=(s&&s.play&&s.play.ring);
  return (v==='free'||v==='mono'||v==='note')?v:RING_DEF;
}
/* ══ いま鳴らしている音の束（tab-3.00）══
   セクションごとに音色と摘みを切り替えるための差し替え口。
   `null` なら曲ぜんたいに従う——**予約を出す側が差し込み、出し終えたら戻す。**
   音を出す道（`pluck` 等）は曲を直に見ずに、ここを通す。 */
let _sndNow=null;
function sndPick(s,k,def){
  if(_sndNow&&_sndNow[k]!=null) return _sndNow[k];
  const v=(s&&s.play)?s.play[k]:undefined;
  return (v==null)?def:v;
}
function sustainAmt(s){
  const v=parseFloat(sndPick(s,'sustain',undefined));
  if(!(isFinite(v)&&v>=0.5&&v<=1.8)) return SUSTAIN_DEF;
  return Math.round(v*20)/20;      /* 0.05 刻みへ丸める（控えの鍵を散らかさない） */
}
function driveAmt(s){
  const v=parseFloat(sndPick(s,'drive',undefined));
  return (isFinite(v)&&v>=0.2&&v<=2.5)?v:DRIVE_DEF;
}
/* クリーンの歪み（tab-6.73）。0〜1、既定 0（今までの曲は真っさらのまま） */
const CS_MAX=0.30;       /* 混ぜる量の上限 */
const CS_ENV_K=1.24;     /* 包絡の掛け戻し（潰した道の基音を元の大きさに揃える。測って決めた値） */
/* 4倍の細かさで潰す時のブラウザの遅れ（秒）。音の器ができた時に測る。測れなければ Chrome の値 */
let _csLat=null;
function csLatency(){ return (_csLat!=null)?_csLat:(192/((AC&&AC.sampleRate)||44100)); }
function csMeasureLatency(){
  const OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext; if(!OAC||_csLat!=null) return;
  try{
    const sr=(AC&&AC.sampleRate)||44100, len=4096, oc=new OAC(1,len,sr);
    const buf=oc.createBuffer(1,len,sr); buf.getChannelData(0)[100]=0.5;
    const src=oc.createBufferSource(); src.buffer=buf;
    const sh=oc.createWaveShaper(); sh.oversample='4x'; sh.curve=new Float32Array([-1,0,1]);
    src.connect(sh); sh.connect(oc.destination); src.start(0);
    const done=o=>{ const d=o.getChannelData(0); let mi=0; for(let i=0;i<len;i++) if(Math.abs(d[i])>Math.abs(d[mi])) mi=i;
      _csLat=Math.max(0,Math.min(0.04,(mi-100)/sr)); try{ busDirtyAll(); }catch(_){} };
    const r=oc.startRendering(); if(r&&r.then) r.then(done).catch(()=>{}); else oc.oncomplete=e=>done(e.renderedBuffer);
  }catch(_){}
}
function cdriveAmt(s){
  const v=parseFloat(sndPick(s,'cdrive',undefined));
  return (isFinite(v)&&v>=0&&v<=1)?Math.round(v*100)/100:0;
}
function bodyAmt(s){
  const v=parseFloat(sndPick(s,'body',undefined));
  return (isFinite(v)&&v>=0&&v<=2)?v:BODY_DEF;
}
/* ══ 伸びを掛けた音色を返す（tab-1.62）══
   **`id` に倍率を織り込むこと。** 控え（`_ksCache`／`_stCache`）の鍵は
   `id` から作られるので、ここを変えないと**摘みを動かしても古い波形が出続ける。**
   元の TONES はそのまま返す（1倍の時）——皆が同じ物を指しているので、
   書き換えてはならない。 */
const _susCache=new Map();
function toneOf(s){
  const id=sndPick(s,'tone',null)||TONE_DEF;
  const base=TONES.find(t=>t.id===id)||TONES[0];
  /* ══ 歪みを強くしたぶん、弦の伸びを抑える（tab-3.05）══
     L様——「歪みが強い時、残響が残る」。

     歪む音色は鳴りやむまでを長く取ってある。**それは正しい**——
     実物でも歪ませれば伸びる。だが摘みで強くすると、
     潰しが深くなって痩せた尾まで持ち上がるので、**伸びが二重に効く。**
     結果、書いた音価の何倍も鳴り続け、残響のように聞こえていた。

     強くするほど弦そのものは短くする。**耳に届く伸びは、
     潰しの持ち上がりと相殺されて釣り合う。**
     歪まない音色（`drive` を持たない）には掛けない——
     そちらは摘みそのものが効かない。 */
  let k=sustainAmt(s);
  if(base.drive){
    const dv=driveAmt(s);
    /* ふつう（1）で 0.72 倍、強烈（2.4）で 0.35 倍まで縮める。
       元が 10〜15 秒あるので、この幅でようやく「弾いた音の尾」に収まる */
    k*=Math.max(0.32,Math.min(1,0.95-0.25*dv));
    k=Math.round(k*100)/100;      /* 控えの鍵を散らかさない */
  }
  if(k===1) return base;
  const key=base.id+'@'+k;
  if(_susCache.has(key)) return _susCache.get(key);
  const o=Object.assign({},base);
  o.id=key;
  o.t60=[base.t60[0]*k,base.t60[1]*k];
  _susCache.set(key,o);
  return o;
}
/* いま鳴らすのに使う音色。H.song() を直に見る（再生中に差し替わっても追随する） */
function tone(){ return toneOf(H.song()); }

/* 胴鳴りは**一本の通り道**で作る。声ごとに持たせると、和音のたびに
   フィルタが六つ増える。音色を変えた時は作り直さず、値だけ入れ替える。 */
/* 胴の応答。減衰する正弦波の束＋頭の一撃。音源は持たずに合成する */
const _irCache=new Map();
function bodyIR(tn){
  if(_irCache.has(tn.id)) return _irCache.get(tn.id);
  const modes=tn.modes||[];
  if(!modes.length){ _irCache.set(tn.id,null); return null; }
  const sr=AC.sampleRate;
  const tail=Math.max.apply(null,modes.map(m=>m[2]));
  const len=Math.max(64,Math.round(sr*(tail*1.6+0.02)));
  const buf=AC.createBuffer(1,len,sr), o=buf.getChannelData(0);
  const TAU=Math.PI*2;
  /* ══ ここも種を固定する（tab-3.27）══
     胴の応答も控え（`_irCache`）に溜めるが、**捨てられて作り直されれば
     別の乱数が引かれ、音が変わる。** 弦の波形と同じ筋である。 */
  let rs=2654435761;
  for(let i=0;i<tn.id.length;i++){ rs=Math.imul(rs^tn.id.charCodeAt(i),2246822519); rs=(rs<<13)|(rs>>>19); }
  const rnd=()=>{ rs=Math.imul(rs^(rs>>>15),2246822507); rs=Math.imul(rs^(rs>>>13),3266489909);
                  rs^=rs>>>16; return (rs>>>0)/4294967296; };
  for(let i=0;i<modes.length;i++){
    const [hz,amp,dec]=modes[i];
    const ph=rnd()*TAU, w=TAU*hz/sr, k=1/(dec*sr);
    for(let j=0;j<len;j++) o[j]+=amp*Math.sin(w*j+ph)*Math.exp(-k*j);
  }
  /* 木を叩いた時の、ピッチの無い頭 */
  const nl=Math.round(sr*0.006);
  for(let j=0;j<nl;j++) o[j]+=(rnd()*2-1)*0.7*(1-j/nl);
  /* ══ 正規化は「尖り」ではなく「総量」で（tab-1.76）══
     いちばん高い所を 0.85 に揃えていた。だが**畳み込みの音量を決めるのは
     尖りではなく総量**である。0.18秒ぶんの減衰する正弦波は、
     尖りを揃えても総量が大きく、**畳み込みで +22dB も持ち上がっていた。**

     そのため——
       ・アコースティックだけ他の音色より 7dB ほど大きい
       ・**立ち上がりが遅い**（0.18秒の胴の響きが頭の一撃を塗りつぶす）

     総量で割れば、畳み込みは音量を変えない。`wet` が
     「どれだけ胴を混ぜるか」という素直な割合になる。 */
  let en=0; for(let j=0;j<len;j++) en+=o[j]*o[j];
  if(en>0){ const g=1/Math.sqrt(en); for(let j=0;j<len;j++) o[j]*=g; }
  _irCache.set(tn.id,buf);
  return buf;
}
/* 胴は**一本の通り道**で作る。声ごとに持たせると和音のたびに増える。
   音色を変える時は節点を作り直さず、応答と混ぜ具合だけ入れ替える。 */
let GBUS=null, GDRY=null, GWET=null, GCONV=null, GTRIM=null, _gbId=null;
/* コンプの後ろの合流点（tab-6.73）と、クリーンの歪みの節点一式（tab-6.73） */
let GPOST=null, GCS=null;    /* 紙の上の位置 → 小節の中の刻（bindPaper が渡す。tab-6.78） */
/* ══ エフェクトの段（tab-2.99）══
   `GTRIM`（音色の出口）から `MASTER` までのあいだに一列で繋ぐ。
   使わない段は wet を 0 にして素通りさせる——繋ぎ替えると、
   鳴っている最中に音が途切れるためである。 */
let FXIN=null, FXOUT=null, _fxId=null, _fxLFO=[];
/* ── 名は、見る者がいる分だけ（tab-5.49）──
   ここは長らく、一つの節点を二つの名で控えていた——`FXPH` と `FXPH_AP`、
   `FXCH` と `FXCH_D`、`FXFL` と `FXFL_D` のように。
   だが `fxDump`／`fxTune`／`fxMix` が見るのは、いつも片方だけであった。
   **誰も読まぬ名は、次に触る者を迷わせるだけである。** 読み手のある名だけ残す。 */
let FXCOMP=null, FXCOMP_DRY=null, FXCOMP_WET=null;
let FXWAH=null, FXWAH_DRY=null, FXWAH_WET=null, FXWAH_LFO=null, FXWAH_DEPTH=null, FXWAH_UP=null;
let FXPH_DRY=null, FXPH_WET=null, FXPH_LFO=null, FXPH_DEPTH=null, FXPH_FB=null;
let FXCH_DRY=null, FXCH_WET=null, FXCH_LFO=[], FXCH_DEPTH=[];
let FXFL_DRY=null, FXFL_WET=null, FXFL_LFO=null, FXFL_DEPTH=null, FXFL_FB=null;
let FXTR=null, FXTR_LFO=null, FXTR_DEPTH=null;
let FXDL_DRY=null, FXDL_WET=null, FXDL_D=null, FXDL_FB=null, FXDL_LP=null;
let FXRV_DRY=null, FXRV_WET=null, FXRV_CONV=null, FXRV_PRE=null;
let FXTRIM=null;
/* 使わない段の入口を断つ門（tab-3.20）。コーラス・フランジャー・トレモロは
   `wrap` を使わない作りなので、門を持たない（あちらは素の音が主役） */
let FXCOMP_SEND=null, FXWAH_SEND=null, FXPH_SEND=null, FXDL_SEND=null, FXRV_SEND=null;
/* 配り直しの跡（tab-3.24）。`fxLog()` で見る */
const _fxLog=[];
/* 列へ繋ぎ替えたか（tab-3.25） */
let _fxWired=false;
function fxLog(){ console.table?console.table(_fxLog):console.log(_fxLog); return _fxLog; }
/* トレモロの揺れは拍の頭で作り直す（tab-3.11）。控えた値で組み直すため */
let FXTR_START=null, _trHz=5, _trWave='sine';
/* ワウの掃きも拍の頭で組み直す（tab-3.29） */
let FXWAH_START=null;
/* 歪みの経路。素の経路と並べて置き、音量で選ぶ。
   繋ぎ替えると、鳴っている最中の切り替えで音が飛ぶ */
let GPRE=null, GSHP=null, GCAB=null, GMID=null, GDIRT=null, GCLEAN=null, _shpK=null;
let GHP=null;                     /* 歪ませる前の低音切り（tab-1.75） */
let GRECT=null,_shpR=null;        /* 潰す前の整流（tab-4.80） */
let GLP2=null,GPRE2=null,GSHP2=null,_shpK2=null;   /* 二段目の潰し（tab-1.75） */

/* ══ 通り道はパートごとに一本ずつ（tab-6.44）══
   L様——「再生音に違和感。他のパートがあるとタイで途切れる」。

   アンプとエフェクトの通り道（胴・歪み・エフェクトの列）は**曲に一本**だった。
   パートごとの音（tab-6.40）は、その一本の設定を出来事のたびに書き換えて鳴らし分けていた。
   ゆえに、クランチ＋ディレイで和音を伸ばしている最中にクリーンのパートが鳴ると、
   **通り道ごと切り替わり、伸ばしている和音の歪みとディレイが途中で消えていた。**

   通り道の部品はここより上の `let` に散っている。作り替えるのではなく、
   **部品一式をパートごとに控えて、鳴らすパートの物と差し替える**（`busUse`）。
   作り方・配り方（`guitarBus`／`fxChain`／`fxApply`）は一行も変えずに済む。
   出口（`MASTER`）だけは全パートで共有する。 */
/* 出口の音量・パン・目盛り（tab-6.45）。これもパートごとの部品として差し替える */
let PMIX=null, PPAN=null, PMET=null, PSEND=null;   /* PSEND：響きへ送る量（tab-6.46） */
const _BUSES=new Map(); let _busCur=0;
function busFresh(){ return {GPOST:null, GCS:null, GBUS:null, GDRY:null, GWET:null, GCONV:null, GTRIM:null, _gbId:null, FXIN:null, FXOUT:null, _fxId:null, _fxLFO:[], FXCOMP:null, FXCOMP_DRY:null, FXCOMP_WET:null, FXWAH:null, FXWAH_DRY:null, FXWAH_WET:null, FXWAH_LFO:null, FXWAH_DEPTH:null, FXWAH_UP:null, FXPH_DRY:null, FXPH_WET:null, FXPH_LFO:null, FXPH_DEPTH:null, FXPH_FB:null, FXCH_DRY:null, FXCH_WET:null, FXCH_LFO:[], FXCH_DEPTH:[], FXFL_DRY:null, FXFL_WET:null, FXFL_LFO:null, FXFL_DEPTH:null, FXFL_FB:null, FXTR:null, FXTR_LFO:null, FXTR_DEPTH:null, FXDL_DRY:null, FXDL_WET:null, FXDL_D:null, FXDL_FB:null, FXDL_LP:null, FXRV_DRY:null, FXRV_WET:null, FXRV_CONV:null, FXRV_PRE:null, FXTRIM:null, FXCOMP_SEND:null, FXWAH_SEND:null, FXPH_SEND:null, FXDL_SEND:null, FXRV_SEND:null, _fxWired:false, FXTR_START:null, _trHz:5, _trWave:'sine', FXWAH_START:null, GPRE:null, GSHP:null, GCAB:null, GMID:null, GDIRT:null, GCLEAN:null, _shpK:null, GHP:null, GRECT:null, _shpR:null, GLP2:null, GPRE2:null, GSHP2:null, _shpK2:null, PMIX:null, PPAN:null, PMET:null, PSEND:null}; }
function busSave(){ return {GPOST:GPOST, GCS:GCS, GBUS:GBUS, GDRY:GDRY, GWET:GWET, GCONV:GCONV, GTRIM:GTRIM, _gbId:_gbId, FXIN:FXIN, FXOUT:FXOUT, _fxId:_fxId, _fxLFO:_fxLFO, FXCOMP:FXCOMP, FXCOMP_DRY:FXCOMP_DRY, FXCOMP_WET:FXCOMP_WET, FXWAH:FXWAH, FXWAH_DRY:FXWAH_DRY, FXWAH_WET:FXWAH_WET, FXWAH_LFO:FXWAH_LFO, FXWAH_DEPTH:FXWAH_DEPTH, FXWAH_UP:FXWAH_UP, FXPH_DRY:FXPH_DRY, FXPH_WET:FXPH_WET, FXPH_LFO:FXPH_LFO, FXPH_DEPTH:FXPH_DEPTH, FXPH_FB:FXPH_FB, FXCH_DRY:FXCH_DRY, FXCH_WET:FXCH_WET, FXCH_LFO:FXCH_LFO, FXCH_DEPTH:FXCH_DEPTH, FXFL_DRY:FXFL_DRY, FXFL_WET:FXFL_WET, FXFL_LFO:FXFL_LFO, FXFL_DEPTH:FXFL_DEPTH, FXFL_FB:FXFL_FB, FXTR:FXTR, FXTR_LFO:FXTR_LFO, FXTR_DEPTH:FXTR_DEPTH, FXDL_DRY:FXDL_DRY, FXDL_WET:FXDL_WET, FXDL_D:FXDL_D, FXDL_FB:FXDL_FB, FXDL_LP:FXDL_LP, FXRV_DRY:FXRV_DRY, FXRV_WET:FXRV_WET, FXRV_CONV:FXRV_CONV, FXRV_PRE:FXRV_PRE, FXTRIM:FXTRIM, FXCOMP_SEND:FXCOMP_SEND, FXWAH_SEND:FXWAH_SEND, FXPH_SEND:FXPH_SEND, FXDL_SEND:FXDL_SEND, FXRV_SEND:FXRV_SEND, _fxWired:_fxWired, FXTR_START:FXTR_START, _trHz:_trHz, _trWave:_trWave, FXWAH_START:FXWAH_START, GPRE:GPRE, GSHP:GSHP, GCAB:GCAB, GMID:GMID, GDIRT:GDIRT, GCLEAN:GCLEAN, _shpK:_shpK, GHP:GHP, GRECT:GRECT, _shpR:_shpR, GLP2:GLP2, GPRE2:GPRE2, GSHP2:GSHP2, _shpK2:_shpK2, PMIX:PMIX, PPAN:PPAN, PMET:PMET, PSEND:PSEND}; }
function busLoad(o){ GPOST=o.GPOST||null; GCS=o.GCS||null; GBUS=o.GBUS; GDRY=o.GDRY; GWET=o.GWET; GCONV=o.GCONV; GTRIM=o.GTRIM; _gbId=o._gbId; FXIN=o.FXIN; FXOUT=o.FXOUT; _fxId=o._fxId; _fxLFO=o._fxLFO; FXCOMP=o.FXCOMP; FXCOMP_DRY=o.FXCOMP_DRY; FXCOMP_WET=o.FXCOMP_WET; FXWAH=o.FXWAH; FXWAH_DRY=o.FXWAH_DRY; FXWAH_WET=o.FXWAH_WET; FXWAH_LFO=o.FXWAH_LFO; FXWAH_DEPTH=o.FXWAH_DEPTH; FXWAH_UP=o.FXWAH_UP; FXPH_DRY=o.FXPH_DRY; FXPH_WET=o.FXPH_WET; FXPH_LFO=o.FXPH_LFO; FXPH_DEPTH=o.FXPH_DEPTH; FXPH_FB=o.FXPH_FB; FXCH_DRY=o.FXCH_DRY; FXCH_WET=o.FXCH_WET; FXCH_LFO=o.FXCH_LFO; FXCH_DEPTH=o.FXCH_DEPTH; FXFL_DRY=o.FXFL_DRY; FXFL_WET=o.FXFL_WET; FXFL_LFO=o.FXFL_LFO; FXFL_DEPTH=o.FXFL_DEPTH; FXFL_FB=o.FXFL_FB; FXTR=o.FXTR; FXTR_LFO=o.FXTR_LFO; FXTR_DEPTH=o.FXTR_DEPTH; FXDL_DRY=o.FXDL_DRY; FXDL_WET=o.FXDL_WET; FXDL_D=o.FXDL_D; FXDL_FB=o.FXDL_FB; FXDL_LP=o.FXDL_LP; FXRV_DRY=o.FXRV_DRY; FXRV_WET=o.FXRV_WET; FXRV_CONV=o.FXRV_CONV; FXRV_PRE=o.FXRV_PRE; FXTRIM=o.FXTRIM; FXCOMP_SEND=o.FXCOMP_SEND; FXWAH_SEND=o.FXWAH_SEND; FXPH_SEND=o.FXPH_SEND; FXDL_SEND=o.FXDL_SEND; FXRV_SEND=o.FXRV_SEND; _fxWired=o._fxWired; FXTR_START=o.FXTR_START; _trHz=o._trHz; _trWave=o._trWave; FXWAH_START=o.FXWAH_START; GPRE=o.GPRE; GSHP=o.GSHP; GCAB=o.GCAB; GMID=o.GMID; GDIRT=o.GDIRT; GCLEAN=o.GCLEAN; _shpK=o._shpK; GHP=o.GHP; GRECT=o.GRECT; _shpR=o._shpR; GLP2=o.GLP2; GPRE2=o.GPRE2; GSHP2=o.GSHP2; _shpK2=o._shpK2; PMIX=o.PMIX; PPAN=o.PPAN; PMET=o.PMET; PSEND=o.PSEND; }
function busUse(pi){
  pi=(pi|0);
  if(pi===_busCur) return;
  _BUSES.set(_busCur,busSave());
  busLoad(_BUSES.get(pi)||busFresh());
  _busCur=pi;
}
/* 全パートの通り道に、配り直しを促す（音量の摘みなど、全体に効く物を変えた時） */
function busDirtyAll(){
  _gbId=null; _fxId=null;
  _BUSES.forEach((o,k)=>{ if(k!==_busCur){ o._gbId=null; o._fxId=null; } });
}

/* ══ 潰しの曲線 ══
   x/(1+k|x|) の形。k が大きいほど頭打ちが早く、倍音が増える。
   角で切り落とすと耳に痛いので、丸く潰す。 */
/* ══ 整流（オクターブ）の曲線（tab-4.80）══
   L様——「もっと歪んでほしい」。

   潰しをこれ以上深くしても、**倍音はもう増えない。**
   潰しの曲線は矩形へ漸近して止まるので、前段を倍にしても波形は同じ矩形——
   実際に測ると、ハイゲインも超ハイゲインも倍音の割合は 48% で並ぶ。

   > **同じ形の潰しを重ねても、同じ形にしかならない。
   >   増やしたければ、**違う形**を通さねばならない。**

   ゆえに**潰す前**に整流を入れる。負の側を折り返すと波の周期が半分になり、
   **オクターブ上の偶数倍音**が立つ——実物のオクターブファズがしていることである。
   これを素の音へ混ぜてから潰すと、偶数と奇数が混じり合い、
   矩形では出せない濁りが出る。直流ぶんは後ろの低音切り（`GHP`）が始末する。

   混ぜ具合で顔が変わる——
     0.2 … 粗さが少し増す　0.35 … はっきり濁る　0.7 … オクターブ上が主役 */
function rectCurve(r){
  const n=2048, c=new Float32Array(n);
  for(let i=0;i<n;i++){
    const x=i*2/(n-1)-1;
    c[i]=(1-r)*x+r*(2*Math.abs(x)-1);
  }
  return c;
}
function driveCurve(k){
  const n=2048, c=new Float32Array(n);
  for(let i=0;i<n;i++){
    const x=i*2/(n-1)-1;
    c[i]=(1+k)*x/(1+k*Math.abs(x));
  }
  return c;
}
/* ══ 空間の残響の応答（tab-2.99）══
   「胴の鳴り」（`bodyIR`）が**箱の共鳴**を作るのに対し、こちらは**部屋**を作る。
   雑音を指数で痩せさせた素直な作りだが、頭に少しの間（プリディレイ）を置き、
   高い方から先に痩せるようにしてある——実際の部屋は高音から吸われるので、
   一律に痩せさせると硬く、作り物めいて聞こえる。 */
const _rvCache=new Map();
function roomIR(kind){
  if(_rvCache.has(kind)) return _rvCache.get(kind);
  const sr=AC.sampleRate;
  const spec={room:{sec:0.9,pre:0.012,damp:0.55},
              plate:{sec:1.6,pre:0.006,damp:0.30},
              hall:{sec:2.8,pre:0.028,damp:0.45}}[kind];
  if(!spec){ _rvCache.set(kind,null); return null; }
  const n=Math.max(1,Math.floor(sr*spec.sec)), pre=Math.floor(sr*spec.pre);
  const buf=AC.createBuffer(2,n,sr);
  /* 種を固定する（tab-3.27）。控えが捨てられても同じ部屋が返るように */
  let rs=1013904223;
  for(let i=0;i<kind.length;i++){ rs=Math.imul(rs^kind.charCodeAt(i),1664525); rs=(rs<<13)|(rs>>>19); }
  const rnd=()=>{ rs=Math.imul(rs^(rs>>>15),2246822507); rs=Math.imul(rs^(rs>>>13),3266489909);
                  rs^=rs>>>16; return (rs>>>0)/4294967296; };
  for(let ch=0;ch<2;ch++){
    const d=buf.getChannelData(ch);
    /* 一次の濾しを噛ませて、高音から先に痩せさせる */
    let lp=0;
    for(let i=0;i<n;i++){
      if(i<pre){ d[i]=0; continue; }
      const t=(i-pre)/(n-pre);
      const env=Math.pow(1-t,2.2)*Math.exp(-3.0*t);
      const x=(rnd()*2-1)*env;
      lp+=(x-lp)*(1-spec.damp*t);
      d[i]=lp;
    }
    /* 頭の数十msに反射をいくつか置くと、部屋の広さが出る */
    const early=[0.013,0.021,0.031,0.043,0.057];
    early.forEach((sec,k)=>{
      const i=pre+Math.floor(sr*sec);
      if(i<n) d[i]+=(k%2?-1:1)*0.35/(k+1);
    });
  }
  _rvCache.set(kind,buf);
  return buf;
}

/* ══ エフェクトの列を組む（tab-2.99）══
   一度だけ組み、以後は摘みの値だけを差し替える。 */
/* ══ コンプを作り直す（tab-6.72）══
   L様——「コンプがすごい歪む」（掛けると薄く歪みが乗る）。

   測ると原因は二つあった。
     ① ブラウザのコンプは、こちらの持ち上げとは別に**自前でも音を持ち上げる**作り
        （閾値と比率から決まる。−34dB・10倍では十数dB）。そこへ立ち上がり4ミリ秒・
        比率10〜16倍で掛けていたので、低い弦では一周期の中で音量が動き、波形そのものが潰れた
        （正弦波で 3倍音が −48dB）。
     ② 掛けると出口が持ち上がり、クランチ等では 3〜6dB 大きくなっていた。
        ※ 音の通り道を辿ると、コンプは実際には歪み（`guitarBus` の中）の**後ろ**に繋がっている
          （エフェクトの列は音色の出口 `GTRIM` の後）。ゆえに歪みを深くしてはいない。
          画面とヘルプの「コンプは歪みより前」と食い違っていたので、tab-6.73 で繋ぎを説明どおり歪みの前へ付け替えた。

   直し方（L様の選択）：
     ・掛かり方を実物のコンプに近い穏やかさにする——立ち上がり20ミリ秒・戻り0.45秒、比率は2〜5倍、
       膝（掛かり始めの丸み）を付ける。歪み（3倍音）を決めるのは主に**戻りの速さ**であった
       （戻りが速いと一周期ごとに音量が揺れる）。6弦開放で −47dB → −58dB 前後
     ・掛けても掛けなくても**同じ大きさで次へ送る**。ギターの弾く強さ（実効値 −16.5dB）の音で
       コンプの通り抜け（自前の持ち上げ込み）を実際に測り、その逆数を掛ける。
       ゆえに大きい音はそのまま、小さい音（減衰の尾）だけが持ち上がる——コンプ本来の働きである。
   測りは音の器ができた時に、選べる強さの分だけ裏で済ませる（一回 0.5 秒の書き出し×4）。 */
var COMP_REF_DB=-16.5;   /* 弾く強さの音（実効値）で、掛けても掛けなくても同じ大きさに（歪みの前に置いた tab-6.73 で測り直し：音色4つで ±1.8dB 以内） */
function compParams(a){
  a=Math.max(0,Math.min(1.5,+a||0));
  return {thr:+(-18-a*11).toFixed(2), ratio:+(2+a*2.4).toFixed(2), knee:10, attack:0.020, release:0.45};
}
const _compGain=new Map();
function compKey(cp){ return [cp.thr,cp.ratio,cp.knee,cp.attack,cp.release].join('|'); }
/* 見積もり（測り終えるまでの仮の値）。ブラウザの自前の持ち上げはおよそ (閾値の深さ×(1−1/比率))×0.6 dB */
function compEstimate(cp){
  const refDb=COMP_REF_DB, over=Math.max(0,refDb-cp.thr);
  const red=over*(1-1/cp.ratio);
  const auto=(-cp.thr)*(1-1/cp.ratio)*0.6;
  return Math.pow(10,(red-auto)/20);
}
function compMatchGain(cp){
  const k=compKey(cp);
  if(_compGain.has(k)) return _compGain.get(k);
  compMeasure(cp);
  return compEstimate(cp);
}
let _compBusy=new Set();
function compMeasure(cp){
  const k=compKey(cp);
  if(_compGain.has(k)||_compBusy.has(k)) return;
  const OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext; if(!OAC) return;
  _compBusy.add(k);
  try{
    const sr=44100, len=Math.round(sr*0.5);
    const oc=new OAC(1,len,sr);
    const o=oc.createOscillator(); o.frequency.value=220;
    const g=oc.createGain(); g.gain.value=Math.pow(10,COMP_REF_DB/20)*Math.SQRT2;
    const c=oc.createDynamicsCompressor();
    c.threshold.value=cp.thr; c.ratio.value=cp.ratio; c.knee.value=cp.knee; c.attack.value=cp.attack; c.release.value=cp.release;
    o.connect(g); g.connect(c); c.connect(oc.destination); o.start(0);
    const done=buf=>{
      const d=buf.getChannelData(0), from=Math.round(len*0.6);
      let sum=0; for(let i=from;i<len;i++) sum+=d[i]*d[i];
      const rms=Math.sqrt(sum/(len-from)), ref=Math.pow(10,COMP_REF_DB/20);
      const gain=(rms>1e-6)?Math.max(0.05,Math.min(4,ref/rms)):compEstimate(cp);
      _compGain.set(k,gain); _compBusy.delete(k);
      /* 測り終えたら、いま掛かっている通り道へ配る */
      try{ compApplyMeasured(); }catch(_){}
    };
    const r=oc.startRendering();
    if(r&&r.then) r.then(done).catch(()=>_compBusy.delete(k));
    else oc.oncomplete=e=>done(e.renderedBuffer);
  }catch(e){ _compBusy.delete(k); }
}
function compPrime(){ FX_COMP.forEach(([v])=>{ const a=parseFloat(v); if(a>0) compMeasure(compParams(a)); }); }
function compApplyMeasured(){
  const put=(c,w)=>{ if(!c||!w||!(w.gain.value>0)) return;
    const cp={thr:+c.threshold.value.toFixed(2),ratio:+c.ratio.value.toFixed(2),knee:c.knee.value,attack:+c.attack.value.toFixed(3),release:+c.release.value.toFixed(2)};
    const k=compKey(cp); if(_compGain.has(k)) w.gain.value=_compGain.get(k); };
  put(FXCOMP,FXCOMP_WET);
  if(typeof _BUSES!=='undefined') _BUSES.forEach(o=>put(o.FXCOMP,o.FXCOMP_WET));
}
function fxChain(){
  if(!AC) return null;
  if(FXIN) return FXIN;
  try{ return _fxChainBuild(); }
  catch(e){
    /* ══ 組み立てが落ちた時は、黙って素通りさせない（tab-3.25）══
       L様——「音にはかかってるけど列がまだ組まれていませんって出る」。

       途中で落ちると `FXIN` だけが残り、繋がりは半端なまま。
       `guitarBus` は `fx` が返らなければ `GTRIM→MASTER` を繋ぐので、
       **音は鳴るがエフェクトは通らない**——この食い違いが起きていた。
       落ちたら跡形を消し、何が起きたかを必ず告げる。 */
    console.error('[fx] 列を組めませんでした',e);
    FXIN=null; FXOUT=null;
    try{ H.toast('エフェクトを組めませんでした（コンソールに詳細）',null,null,6000); }catch(_){}
    return null;
  }
}
function _fxChainBuild(){
  const mk=()=>AC.createGain();
  FXIN=mk(); FXOUT=mk();
  let cur=FXIN;
  /* 直列と並列（dry/wet）を繋ぐ小道具。
     **使わない段も繋いだままにする**——鳴っている最中に繋ぎ替えると音が切れる */
  /* ══ 使わない段には、音を入れない（tab-3.20）══
     以前は `wet=0` で出口だけ絞っていたが、**入口は開いたまま**だった。
     遅延や畳み込みの中には音が溜まり続け、**後で掛けた瞬間に
     古い音が飛び出す。** これが「掛けた途端に変な音がする」の正体。

     入口にも門（`send`）を置き、使わない段は**そこで断つ。**
     素の音の道（`dry`）はそのままなので、音が切れることはない。 */
  const wrap=(build)=>{
    const inN=mk(), outN=mk(), dry=mk(), wet=mk(), send=mk();
    dry.gain.value=1; wet.gain.value=0; send.gain.value=0;
    inN.connect(dry); dry.connect(outN);
    inN.connect(send);
    const node=build(send,wet);
    wet.connect(outN);
    cur.connect(inN); cur=outN;
    return {in:inN,out:outN,dry,wet,send,node};
  };

  /* ① コンプは、この列ではなく通り道の頭（歪みの前）に置く（tab-6.73。`guitarBus` 参照） */
  /* ══ ② ワウ（tab-3.02 で作り直した）══
     はじめは bandpass 一段・Q=4・素の音を半分残す作りにしたが、
     **地味すぎた**（L様のご指摘）。実物のワウが効いて聞こえる理由は三つある。

     ① **素の音を残さない。** ペダルは通り道に直に入るので、
        掛かった音がそのまま出る。混ぜると芯が薄まって「少し曇った音」になる。
     ② **山が鋭い。** Q は 4 ではなく 10 前後。緩い山は「音色の違い」にしか
        聞こえず、動かしても「ワウ」と鳴らない。
     ③ **振れ幅が広い。** 中心 700Hz に ±900Hz を足す形では、下が 0 で
        潰れて上へしか動かない。**耳は周波数を対数で聞く**ので、
        足し算ではなく掛け算で振らねばならない。
        そこで LFO を `detune` に繋ぐ——ここは cent（対数）の目盛なので、
        ±1200 で上下1オクターヴ、きっちり対称に振れる。

     山だけでは低音が痩せるので、**素の低域を少し戻す**道を並べる。
     実物のワウも低音まで切り落としはしない。 */
  {
    const bq=AC.createBiquadFilter(); bq.type='bandpass'; bq.Q.value=10;
    bq.frequency.value=700;
    const lfo=AC.createOscillator(); lfo.type='sine'; lfo.frequency.value=1.6;
    const dep=mk(); dep.gain.value=0;
    /* **detune（cent）に繋ぐ。** frequency に足すと上下が非対称になる */
    lfo.connect(dep); dep.connect(bq.detune);
    try{ lfo.start(); }catch(_){}
    lfo._fxLfo=true;   /* 音ではない。止める手から守る（tab-3.28） */
    _fxLFO.push(lfo);
    /* ══ 痩せを取り戻す（tab-3.03）══
       L様——「ワウはすごい小さく聴こえる」。
       **狭い山は、音のごく一部しか通さない。** Q=12 ともなれば
       素通りの十分の一も出ない。素の音を切った以上、ここで取り戻さねば
       ワウにした途端に音が引っ込む。持ち上げは Q に応じて決める。 */
    const up=mk(); up.gain.value=6;
    /* ══ 山ひとつだけを通す（tab-3.20 で作り直した）══
       L様——「エフェクトの聞こえ方が大体変」「音が濁る」。

       tab-3.03 で「低音が痩せる」と見て、素の音の低域を**足して**いた。
       これが濁りの元であった——**bandpass は位相を回す。**
       回った音（山）と回らない音（低音の戻し）を足せば、重なる帯域で
       打ち消しが起き、狙っていない櫛が立つ。

       実物のワウは**山ひとつを通すだけ**である。低音が薄くなるのは
       ワウの音そのものであって、補ってはならない。 */
    const w=wrap((inN,wet)=>{ inN.connect(bq); bq.connect(up); up.connect(wet); return bq; });
    FXWAH=bq; FXWAH_DRY=w.dry; FXWAH_WET=w.wet; FXWAH_LFO=lfo; FXWAH_DEPTH=dep;
    FXWAH_UP=up; FXWAH_SEND=w.send;
    /* ══ 掃きも拍の頭から（tab-3.29）══
       細かい刻みほど、拍とずれた掃きは**ただの揺らぎ**に聞こえる。
       トレモロと同じく、鳴らし始める時刻を指定して組み直す。 */
    FXWAH_START=(at)=>{
      if(!dep) return;
      const t=Math.max(AC.currentTime+0.001,at||0);
      const old=FXWAH_LFO;
      if(old){
        try{ old.stop(t); }catch(_){}
        try{ old.onended=()=>{ try{ old.disconnect(); }catch(__){} }; }catch(_){}
        setTimeout(()=>{ try{ old.disconnect(); }catch(__){} },
                   Math.max(50,(t-AC.currentTime)*1000+200));
      }
      const l2=AC.createOscillator();
      l2._fxLfo=true;
      l2.type=(FXWAH_LFO?FXWAH_LFO.type:'sine')||'sine';
      l2.frequency.value=(FXWAH_LFO?FXWAH_LFO.frequency.value:1.6)||1.6;
      l2.connect(dep);
      try{ l2.start(t); }catch(_){ try{ l2.start(); }catch(__){} }
      FXWAH_LFO=l2;
    };
  }
  /* ══ ③ フェイザー（tab-3.30 で作り直した）══
     L様——「フェイザーとフランジャーの音色がイマイチ」。

     三つ足りなかった。

     ① **段数。** 全域通過は2段で谷が一つ。四段では谷が二つしかなく、
        薄い。実物でも Small Stone や Phase 100 は6〜8段——
        **谷が三つ四つ**あって初めて、あの「うねうね」した厚みが出る。
     ② **振り方。** 揺れを `frequency` へ**足して**いたので、
        低い段は 7.5倍も動くのに高い段は 2.8倍しか動かない。
        **谷が揃って動かない。** ワウで直したのと同じ誤りである（tab-3.02）。
        `detune`（cent）で振れば、どの段も同じ幅で動く。
     ③ **戻り。** 実物は最終段から入口へ戻す。これが谷を尖らせ、
        あの独特のクセを作る。無ければ、ただ通り過ぎるだけになる。 */
  {
    const aps=[];
    /* 六段＝谷三つ。段の高さは掛け算で並べる（耳は対数で聞く） */
    for(let i=0;i<6;i++){ const a=AC.createBiquadFilter();
      a.type='allpass'; a.Q.value=0.6;
      a.frequency.value=280*Math.pow(1.55,i);   /* 280〜1580Hz */
      aps.push(a); }
    const lfo=AC.createOscillator(); lfo.type='sine'; lfo.frequency.value=0.4;
    const dep=mk(); dep.gain.value=0;
    /* **detune に繋ぐ。** どの段も同じ cent だけ動く＝谷が揃って掃く */
    lfo.connect(dep); aps.forEach(a=>dep.connect(a.detune));
    try{ lfo.start(); }catch(_){}
    lfo._fxLfo=true;   /* 音ではない。止める手から守る（tab-3.28） */
    _fxLFO.push(lfo);
    const fb=mk(); fb.gain.value=0;
    const w=wrap((inN,wet)=>{
      inN.connect(aps[0]);
      for(let i=0;i<aps.length-1;i++) aps[i].connect(aps[i+1]);
      const last=aps[aps.length-1];
      last.connect(fb); fb.connect(aps[0]);     /* 戻り。谷を尖らせる */
      last.connect(wet);
      return aps; });
    FXPH_DRY=w.dry; FXPH_WET=w.wet;
    FXPH_LFO=lfo; FXPH_DEPTH=dep; FXPH_SEND=w.send; FXPH_FB=fb;
  }
  /* ══ ④ コーラス（tab-3.08 で作り直した）══
     L様——「コーラスとフランジャーが全然良くない」。

     **掛かって聞こえる正体は、素の音との打ち消し合いである。**
     わずかに遅らせた音を素の音へ重ねると、周波数ごとに強め合う所と
     打ち消し合う所ができ、遅れが揺れるとその縞が動く——これが「うねり」。

     ところが tab-3.07 で `wrap` の混ぜ方を強め、**素の音を二割まで
     退かせてしまった。** 打ち消す相手がいなければ縞は立たず、
     遅らせた音だけが出て「ただのぼやけた音」になる。**逆効果であった。**

     ゆえに `wrap` に載せず、**素の音は常に丸ごと通す**。
     揺れた音はその横へ足すだけにする（実物のコーラスも、
     ミックスを上げても原音は減らない作りが多い）。

     遅れの基準も詰めた。18/26ms は**遅すぎて二重に聞こえる**。
     コーラスは 8〜15ms あたりが縞のよく立つ所。
     二本の揺れを**逆位相**にすると左右に散って厚みが出る。 */
  {
    const ds=[], lfos=[], deps=[];
    const inN=mk(), outN=mk(), wet=mk();
    wet.gain.value=0;
    cur.connect(inN);
    inN.connect(outN);                     /* 素の音は丸ごと通す（打ち消しの相手） */
    [[0.009,0.62,1],[0.013,0.47,-1]].forEach(([base,rate,sign])=>{
      const d=AC.createDelay(0.2); d.delayTime.value=base;
      const lfo=AC.createOscillator(); lfo.type='sine'; lfo.frequency.value=rate;
      const dep=mk(); dep.gain.value=0;
      const inv=mk(); inv.gain.value=sign; /* 片方を逆位相で揺らす＝左右に散る */
      lfo.connect(inv); inv.connect(dep); dep.connect(d.delayTime);
      try{ lfo.start(); }catch(_){}
      lfo._fxLfo=true;   /* 音ではない。止める手から守る（tab-3.28） */
    _fxLFO.push(lfo);
      inN.connect(d); d.connect(wet);
      ds.push(d); lfos.push(lfo); deps.push(dep);
    });
    wet.connect(outN);
    cur=outN;
    FXCH_LFO=lfos; FXCH_DEPTH=deps; FXCH_DRY=inN; FXCH_WET=wet;
  }
  /* ══ ⑤ フランジャー（tab-3.08 で作り直した）══
     コーラスと同じ理由で `wrap` から外す——**素の音との打ち消しが命**である。
     違いは遅れの短さと、戻り（フィードバック）の有無。
     短い遅れ（0.5〜6ms）は縞の間隔が広く、倍音の一本一本を舐めるように
     動くので「ジェット機」に聞こえる。戻りはその縞を鋭くする。

     基準の遅れも詰めた。4ms 固定では縞が真ん中で止まったままなので、
     0.6ms まで下げ、そこから上へ振る。**低い所まで下りて初めて
     あの「シューン」という掃き上げになる。** */
  {
    /* ══ ジェットにするには、遅れを 0.1ms まで下げる（tab-3.12）══
       L様——「フランジャーってもっとジェット音っぽい感じじゃないの？」。

       縞の一段目の谷は **1/(2×遅れ)**。0.6ms では 833Hz が上限で、
       そこから下へしか動かない——**低い所でうねるだけ**であった。
       あの「シューン」は縞が 5kHz 超まで駆け上がることで生まれるので、
       遅れの下限を 0.1ms（谷 5kHz）まで下げねばならない。 */
    /* ══ 下限は 0.4ms（tab-3.30 で戻した）══
       tab-3.12 で「縞を 5kHz まで上げる」ために 0.1ms まで下げたが、
       **44.1kHz では 4.4サンプル。** DelayNode は補間するので、
       この短さでは高域が暴れ、金属質な雑味が乗る。
       実物のフランジャーも下限は 0.5〜1ms あたり。
       0.4ms なら縞は 1.25kHz——そこから上は**戻りが作る倍音**が担う。 */
    const d=AC.createDelay(0.05); d.delayTime.value=0.0004;
    const fb=mk(); fb.gain.value=0;
    /* ══ 三角で掃く（tab-3.12）══
       正弦は端で速度が落ちるので、**上下の折り返しに留まって「うねり」**に
       聞こえる。三角なら一定の速さで駆け上がり駆け下りるので、
       あの「シューン、シューン」という掃きになる。 */
    const lfo=AC.createOscillator(); lfo.type='triangle'; lfo.frequency.value=0.25;
    const dep=mk(); dep.gain.value=0;
    /* 揺れを 0〜1 の片側にする（負に振ると遅れが負になり、揺れが止まる）。
       正弦を +1 側へ持ち上げるため、定数 1 を足し込んでから深さを掛ける */
    const one=AC.createConstantSource?AC.createConstantSource():null;
    if(one){ one._fxLfo=true; one.offset.value=1; try{ one.start(); }catch(_){} }
    const sum=mk(); sum.gain.value=1;
    lfo.connect(sum); if(one) one.connect(sum);
    sum.connect(dep); dep.connect(d.delayTime);
    try{ lfo.start(); }catch(_){}
    lfo._fxLfo=true;   /* 音ではない。止める手から守る（tab-3.28） */
    _fxLFO.push(lfo);
    const inN=mk(), outN=mk(), wet=mk();
    wet.gain.value=0;
    cur.connect(inN);
    inN.connect(outN);                     /* 素の音は丸ごと通す（打ち消しの相手） */
    /* ══ 戻りの中に濾しを一枚（tab-3.12）══
       戻りを 0.88 まで上げると、**高い所の縞が耳に刺さる。**
       実物のフランジャーも戻りの道で高域を落としている。 */
    const fbLP=AC.createBiquadFilter(); fbLP.type='lowpass';
    fbLP.frequency.value=7000; fbLP.Q.value=0.6;
    inN.connect(d); d.connect(fbLP); fbLP.connect(fb); fb.connect(d);
    d.connect(wet); wet.connect(outN);
    cur=outN;
    FXFL_FB=fb; FXFL_LFO=lfo; FXFL_DEPTH=dep;
    FXFL_DRY=inN; FXFL_WET=wet;
  }
  /* ⑦ ディレイ（戻りの中に濾しを入れて、繰り返すほど丸くする） */
  {
    const d=AC.createDelay(4.0); d.delayTime.value=0.3;   /* 上限 4秒（tab-6.42） */
    const fb=mk(); fb.gain.value=0.3;
    const lp=AC.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=3200;
    const w=wrap((inN,wet)=>{ inN.connect(d); d.connect(lp); lp.connect(fb);
      fb.connect(d); d.connect(wet); return d; });
    FXDL_D=d; FXDL_FB=fb; FXDL_LP=lp; FXDL_DRY=w.dry; FXDL_WET=w.wet; FXDL_SEND=w.send;
  }
  /* ⑧ 空間の残響（いちばん後ろ。返りをもう一度歪ませない） */
  {
    const cv=AC.createConvolver?AC.createConvolver():null;
    if(cv) cv.normalize=true;
    const pre=AC.createDelay(0.2); pre.delayTime.value=0;
    const w=wrap((inN,wet)=>{ if(cv){ inN.connect(pre); pre.connect(cv); cv.connect(wet); }
                              else inN.connect(wet); return cv; });
    FXRV_CONV=cv; FXRV_PRE=pre; FXRV_DRY=w.dry; FXRV_WET=w.wet; FXRV_SEND=w.send;
  }
  /* ══ ⑨ トレモロ（tab-3.09 で最後尾へ移した）══
     L様——「トレモロは全くわからん」。

     以前は歪みの直後、**ディレイと残響より前**に置いていた。
     並び順としては実物どおりだが、**返りが谷を埋めてしまう。**
     音量を落とした隙間へディレイの繰り返しと残響の尾が流れ込むので、
     揺れているはずの所が塗り潰されて平らに聞こえていた。

     実物のアンプでも、トレモロは**スピーカーの直前**（パワー段）にある。
     リバーブより後ろ——つまりここが正しい場所である。 */
  {
    const g=mk(); g.gain.value=1;
    const dep=mk(); dep.gain.value=0;
    dep.connect(g.gain);
    cur.connect(g); cur=g;
    FXTR=g; FXTR_DEPTH=dep;
    /* ══ 揺れは拍の頭から始める（tab-3.11）══
       L様——「トレモロが３連だとかかって聞こえない」。

       揺れが**拍と結び付いていなかった。** 4分・8分・16分は拍を割り切る
       数なので、位相がずれていても規則正しく聞こえる。だが**3連は拍と
       噛み合わず、ただの不規則な揺らぎに聞こえる。**

       Web Audio の発振器は途中で位相を戻せないので、
       **鳴らし始める時刻を指定して作り直す。** そこが位相 0 になる。 */
    /* ══ 切り離すのは、止まってから（tab-3.22）══
       L様——「起動してすぐと何かをいじった後だと聞こえ方が違う」。

       `stop(at)` は**未来の時刻**なのに、`disconnect()` を
       **その場で**呼んでいた。古い揺れは止まる前に切り離され、
       新しい揺れは `at` まで始まらない——**その間トレモロが消える。**
       しかも古い発振器は繋ぎを失ったまま鳴り続けるので、
       次に組み直すたびに取り残しが増えていく。

       止まる時刻に合わせて切り離すこと。時刻は必ず**今より先**を取る
       （過ぎた時刻を渡すと、その場で始まって位相が合わない）。 */
    FXTR_START=(at)=>{
      /* 使っていなければ組み直さない（tab-3.22）。
         **要らぬ作り直しは、取り残しを生むだけである。**
         ただし**一本も無い時は必ず作る**（tab-3.28）——
         初回にここで弾いていたので、揺れが一度も生まれず、
         後から掛けても鳴らなかった。 */
      if(FXTR_LFO&&(!dep||dep.gain.value<=0)) return;
      const t=Math.max(AC.currentTime+0.001,at||0);
      const old=FXTR_LFO;
      if(old){
        try{ old.stop(t); }catch(_){}
        /* 止まってから切り離す。onended が無い機械のために時計でも保険を張る */
        try{ old.onended=()=>{ try{ old.disconnect(); }catch(__){} }; }catch(_){}
        setTimeout(()=>{ try{ old.disconnect(); }catch(__){} },
                   Math.max(50,(t-AC.currentTime)*1000+200));
      }
      const lfo=AC.createOscillator();
      lfo._fxLfo=true;   /* 音ではない。止める手から守る（tab-3.28） */
      lfo.type=_trWave||'sine';
      lfo.frequency.value=_trHz||5;
      lfo.connect(dep);
      try{ lfo.start(t); }catch(_){ try{ lfo.start(); }catch(__){} }
      FXTR_LFO=lfo;
    };
    FXTR_START(0);
  }
  /* ══ ⑩ 出口の抑え（tab-3.10）══
     効きを強めた結果、**重ね掛けで音量が積み上がる。** 素の音を残す段
     （コーラス・フランジャー・ディレイ・残響）はいずれも「足す」作りなので、
     並べるほど大きくなり、深く掛けると割れる。

     摘みごとに引き算すると、**一つ足すたびに全部の勘定をやり直す**ことに
     なるので、出口で一度だけ抑える。掛かった量から見積もった減衰と、
     取りこぼしを拾う穏やかなリミッタの二段構え。 */
  {
    /* ══ 抑えは一段だけ（tab-3.20 で改めた）══
       減衰（`trim`）の後ろに、さらに閾値 −3dB・比12 のリミッタを
       置いていた。これでは**掛けるほど動的に潰れる**——
       音量が暴れ、歪みの後段でさらに潰されて平らになる。
       L様の「効きが不自然」はここが効いていた。

       見積もった減衰で足りるようにし、リミッタは**逃げ道**に留める——
       閾値を上げ、比を緩め、離れを早くして、
       **ふだんは何もしない**（本当に飛び出した時だけ押さえる）。 */
    const trim=mk(); trim.gain.value=1;
    const lim=AC.createDynamicsCompressor?AC.createDynamicsCompressor():null;
    if(lim){
      lim.threshold.value=-1; lim.ratio.value=4;
      lim.attack.value=0.006; lim.release.value=0.05; lim.knee.value=12;
    }
    cur.connect(trim);
    if(lim){ trim.connect(lim); lim.connect(FXOUT); } else trim.connect(FXOUT);
    FXTRIM=trim;
    cur=trim;
  }
  return FXIN;
}

/* ══ 摘みの値を段へ配る（tab-2.99）══
   繋ぎ替えは行わない。**値だけを差し替える。** */
/* ══ いま実際に掛かっている値を書き出す（tab-3.24）══
   L様——「まだ変わる」。**推測を重ねても当たらない。**
   コンソールで `fxDump()` と打てば、その瞬間の値がそのまま出る。
   起動直後と、変わった後で二度取っていただければ、
   **何がどう違うのか**が数で判る。 */
function fxDump(label){
  /* ══ どこで止まっているかを、順に告げる（tab-3.26）══
     L様——「列がまだ組まれていませんしか出ない」。
     **落ちてすらいないなら、呼ばれていない。** 段階ごとに見て回る。 */
  console.log('── 診断 ──');
  console.log('1. AC（音の仕組み）:', (typeof AC!=='undefined'&&AC)?('あり state='+AC.state):'なし');
  if(typeof AC==='undefined'||!AC){
    try{ H.audioReady(); }catch(e){ console.error('audioReady で落ちました',e); }
    console.log('   → 起こした後:', (typeof AC!=='undefined'&&AC)?('あり state='+AC.state):'なし');
  }
  console.log('2. GBUS（音の道）:', (typeof GBUS!=='undefined'&&GBUS)?'あり':'なし');
  if(typeof GBUS==='undefined'||!GBUS){
    try{ guitarBus(); }catch(e){ console.error('guitarBus で落ちました',e); }
    console.log('   → 起こした後:', (typeof GBUS!=='undefined'&&GBUS)?'あり':'なし');
  }
  console.log('3. FXIN（エフェクトの列）:', FXIN?'あり':'なし');
  if(!FXIN){
    console.log('   fxChain を直に呼びます…');
    let r=null;
    try{ r=fxChain(); }catch(e){ console.error('   fxChain で落ちました',e); }
    console.log('   → 戻り:', r?'あり':'なし', ' FXIN:', FXIN?'あり':'なし');
  }
  console.log('4. 列へ繋いだか（_fxWired）:', (typeof _fxWired!=='undefined')?_fxWired:'（無し）');
  console.log('5. 鍵（_fxId）:', (typeof _fxId!=='undefined')?_fxId:'（無し）');
  console.log('6. 摘み:', JSON.stringify((H.song()&&H.song().play&&H.song().play.fx)||{}));
  if(!FXIN){ console.log('[fx] ここまでで列が組めませんでした。上の1〜6をお知らせください'); return null; }
  const g=(n)=>n?(+n.gain.value.toFixed(3)):null;
  const o={
    いつ: label||'',
    時刻: +AC.currentTime.toFixed(2),
    摘み: JSON.parse(JSON.stringify((_sndNow&&_sndNow.fx)||(H.song()&&H.song().play&&H.song().play.fx)||{})),
    セクションの束: _sndNow?'あり':'なし',
    鍵: _fxId,
    テンポ: H.song()&&H.song().play?H.song().play.bpm:null,
    音色: (typeof tone==='function')?tone().id:null,
    コンプ: {送:g(FXCOMP_SEND),出:g(FXCOMP_WET),閾:FXCOMP?+FXCOMP.threshold.value.toFixed(1):null,比:FXCOMP?+FXCOMP.ratio.value.toFixed(1):null},
    ワウ: {送:g(FXWAH_SEND),出:g(FXWAH_WET),素:g(FXWAH_DRY),
           中心:FXWAH?Math.round(FXWAH.frequency.value):null,
           ずれ:FXWAH?Math.round(FXWAH.detune.value):null,
           Q:FXWAH?+FXWAH.Q.value.toFixed(2):null,
           振幅:g(FXWAH_DEPTH),持上:g(FXWAH_UP),
           速さ:FXWAH_LFO?+FXWAH_LFO.frequency.value.toFixed(2):null},
    フェイザー:{送:g(FXPH_SEND),出:g(FXPH_WET),素:g(FXPH_DRY),振幅:g(FXPH_DEPTH)},
    コーラス:{出:g(FXCH_WET),素:g(FXCH_DRY),振幅:(FXCH_DEPTH&&FXCH_DEPTH[0])?+(FXCH_DEPTH[0].gain.value*1000).toFixed(2):null},
    フランジャー:{出:g(FXFL_WET),素:g(FXFL_DRY),振幅:FXFL_DEPTH?+(FXFL_DEPTH.gain.value*1000).toFixed(2):null,戻:g(FXFL_FB)},
    トレモロ:{深:g(FXTR_DEPTH),中:g(FXTR),速さ:FXTR_LFO?+FXTR_LFO.frequency.value.toFixed(2):null,波:FXTR_LFO?FXTR_LFO.type:null},
    ディレイ:{送:g(FXDL_SEND),出:g(FXDL_WET),素:g(FXDL_DRY),長さ:FXDL_D?+FXDL_D.delayTime.value.toFixed(3):null,戻:g(FXDL_FB)},
    残響:{送:g(FXRV_SEND),出:g(FXRV_WET),素:g(FXRV_DRY),応答:(FXRV_CONV&&FXRV_CONV.buffer)?'あり':'なし'},
    出口の抑え: g(FXTRIM),
    弦の伸び: (typeof sustainAmt==='function')?sustainAmt(H.song()):null,
    歪み: (typeof driveAmt==='function')?driveAmt(H.song()):null,
    胴: (typeof bodyAmt==='function')?bodyAmt(H.song()):null,
  };
  console.log('════ fxDump '+(label||'')+' ════');
  console.log(JSON.stringify(o,null,1));
  return o;
}

/* ══ 録っている間、重い効果は切り離す（tab-5.85）══
   L様——「録音するたびにラグの位置が変わるな」。

   **位置が定まらぬなら、仕組みの不具合ではない。**
   器が音を作り切れずに一瞬取りこぼしている——**糸の飢え**である。
   マイクを開くと刻みが細かくなり、間に合わなくなる。

   ならば削るべきは「どこで起きるか」ではなく、**糸そのものの仕事量**である。
   いちばん重いのは**畳み込み残響**——部屋の響きを一粒ごとに畳み込むので、
   ほかの効果を全部合わせたより重い。次いで遅れ（ディレイ）。

   > **録っている間、響きは要らない。要らない仕事を糸に載せない。**

   録音中は残響と遅れを**繋ぎから外す**。音量を0にするだけでは畳み込みは回り続ける——
   **外さねば軽くならない。** 録り終えれば元へ戻す。 */
let _fxOff=false;
function fxQuiet(on){
  if(!AC) return;
  if(on===_fxOff) return;
  _fxOff=!!on;
  try{
    if(on){
      if(FXRV_SEND) FXRV_SEND.disconnect();
      if(FXDL_SEND) FXDL_SEND.disconnect();
    }else{
      /* 繋ぎ直しは列の組み直しに任せる——**繋ぎ先を知っているのはあちらである**。
         `_fxId` を空にしておけば、次の配り直しで送りが繋ぎ直る（行14476） */
      _fxId=null;
    }
  }catch(e){ console.error('[効果] 切り離せず',e); }
  try{ fxApply(); }catch(_){}
}
function fxApply(){
  if(!AC||!FXIN) return;
  const s=(H.song());
  const bpm=(s&&s.play&&s.play.bpm)?s.play.bpm:100;
  const beat=60/Math.max(20,Math.min(400,bpm));
  /* ══ 混ぜ方（tab-3.07 で強めた）══
     L様——「エフェクトが全体的にもっとかかってて欲しい」。

     以前は素の音を `1-amt*0.5` で残していた。たっぷり（1）でも半分残るので、
     **どれだけ深くしても「素の音に薄く重なる」までしか行かない。**
     実物のペダルは掛かった音の側が主役なので、素の音は掛けたぶんだけ退く。
     ただし完全に消すと揺れ物は芯を失うので、二割は残す。 */
  const mix=(dry,wet,amt,send)=>{ if(!dry||!wet) return;
    wet.gain.value=amt; dry.gain.value=Math.max(0.2,1-amt*0.95);
    /* 使わない段は入口で断つ（tab-3.20）。溜まった音を持ち越さない */
    if(send) send.gain.value=(amt>0)?1:0; };

  /* コンプ */
  {
    const a=fxNum(s,'comp',0);
    const cp=compParams(a);
    if(FXCOMP&&a){
      FXCOMP.threshold.value=cp.thr; FXCOMP.ratio.value=cp.ratio; FXCOMP.knee.value=cp.knee;
      FXCOMP.attack.value=cp.attack; FXCOMP.release.value=cp.release;
    }
    mix(FXCOMP_DRY,FXCOMP_WET,a?Math.min(1,a):0,FXCOMP_SEND);
    if(FXCOMP_DRY&&a) FXCOMP_DRY.gain.value=0;   /* コンプは掛けたら素の音は要らない */
    /* 出口の大きさを、掛けない時と揃える（tab-6.72）。測り終えるまでは見積もりで */
    if(FXCOMP_WET&&a) FXCOMP_WET.gain.value=compMatchGain(cp);
  }
  /* ══ ワウ（tab-3.01）══
     濾しは一つ。型によって**動かすかどうか**だけが変わる。 */
  {
    const kind=String(fxOf(s,'wah','0'));
    const a=fxNum(s,'wahAmt',0.7);
    if(kind==='fix'){
      /* 半どめ。踏み込んだ位置で止める——揺らさないので depth は 0 */
      const pos=fxNum(s,'wahPos',0.5);
      /* ══ 踏み込む位置も対数で取る（tab-3.02）══
         300Hz〜1800Hz を**掛け算**で辿る。等分に足すと、低い側が
         ほとんど動かず、高い側だけが大きく動いて聞こえる。 */
      if(FXWAH){
        /* 400Hz〜2200Hz を掛け算で辿る（tab-3.23 で上を伸ばした）。
           実物のワウが掃くのはこのあたり。1800Hz 止まりでは
           **ギターの美味しい所（2〜3kHz）に届かない** */
        FXWAH.frequency.value=400*Math.pow(5.5,pos);
        FXWAH.detune.value=0;
        /* ══ Q は立てすぎない（tab-3.23）══
           5〜14 は**明らかに立ちすぎ**であった。実物のワウ（CryBaby 等）は
           概ね 3〜5。それ以上にすると笛のように鳴り、**音程感が出る**——
           ギターの音程と喧嘩して、耳に付く。 */
        FXWAH.Q.value=2.5+a*2.2;      /* どっぷりで 5.4 */
      }
      if(FXWAH_DEPTH) FXWAH_DEPTH.gain.value=0;
      /* 持ち上げも Q に合わせて控えめに（tab-3.23） */
      if(FXWAH_UP) FXWAH_UP.gain.value=1.6+(2.5+a*2.2)*0.85;
      /* **素の音は残さない。** ペダルは通り道に直に入る */
      if(FXWAH_DRY) FXWAH_DRY.gain.value=0;
      if(FXWAH_WET) FXWAH_WET.gain.value=1.15;
      if(FXWAH_SEND) FXWAH_SEND.gain.value=1;
    } else if(kind==='auto'){
      /* 周期で踏む。**速さは拍から割り出す**ので、テンポを変えても付いてくる */
      const mul=fxNum(s,'wahRate',1);
      const whz=1/Math.max(0.03,beat*mul);
      if(FXWAH_LFO){
        FXWAH_LFO.frequency.value=Math.min(24,whz);
        /* ══ 速い時は角を立てる（tab-3.29）══
           正弦は端で速度が落ちるので、**速く掃くと丸まって耳が均す。**
           三角なら一定の速さで上下するので、細かい刻みでも粒が立つ。
           トレモロで同じ手を打ってあるのと揃える（tab-3.09）。 */
        FXWAH_LFO.type=(whz>=4.5)?'triangle':'sine';
      }
      if(FXWAH){
        /* ══ 振れの真ん中を上げた（tab-3.23）══
           620Hz を中心に上下へ振ると、上は 1950Hz 止まり。
           **実物のワウは 400Hz〜2.2kHz** を掃くので、その幾何平均あたり
           （≒940Hz）を中心に据える。 */
        FXWAH.frequency.value=940;
        FXWAH.Q.value=2.5+a*2.2;
      }
      /* ══ 振れ幅は cent で（tab-3.02）══
         1200 cent ＝ 1オクターヴ。たっぷりで上下1オクターヴ半、
         つまり 220Hz〜1750Hz を行き来する。ここまで振って初めて
         「ワウワウ」と鳴る。 */
      /* 振れをさらに広げる（tab-3.10）。±2400 cent ＝ 上下2オクターヴ */
      if(FXWAH_DEPTH) FXWAH_DEPTH.gain.value=1000+a*1400;
      if(FXWAH_UP) FXWAH_UP.gain.value=1.6+(2.5+a*2.2)*0.85;
      if(FXWAH_DRY) FXWAH_DRY.gain.value=0;
      if(FXWAH_WET) FXWAH_WET.gain.value=1.15;
      if(FXWAH_SEND) FXWAH_SEND.gain.value=1;
    } else {
      if(FXWAH_DEPTH) FXWAH_DEPTH.gain.value=0;
      mix(FXWAH_DRY,FXWAH_WET,0,FXWAH_SEND);
    }
  }
  /* フェイザー */
  {
    const a=fxNum(s,'phaser',0);
    /* 振れ幅を倍に。700 では山がほとんど動かず、うねりに聞こえなかった */
    /* ══ 振れは cent で（tab-3.30）══
       1200 cent ＝ 1オクターヴ。たっぷりで上下1オクターヴ強を、
       **六段そろって**掃く。 */
    if(FXPH_DEPTH) FXPH_DEPTH.gain.value=a*1100;
    if(FXPH_LFO) FXPH_LFO.frequency.value=0.28+a*0.5;
    /* 戻りが谷を尖らせる。0.75 を越えると鳴き出す（tab-3.30） */
    if(FXPH_FB) FXPH_FB.gain.value=Math.min(0.75,a*0.62);
    /* 全域通過は素の音と混ぜて初めて「打ち消し」が起きる。**等分が最も深い** */
    if(FXPH_DRY) FXPH_DRY.gain.value=1;
    if(FXPH_WET) FXPH_WET.gain.value=a?Math.min(1,a*1.0):0;
    if(FXPH_SEND) FXPH_SEND.gain.value=a?1:0;
  }
  /* コーラス */
  {
    const a=fxNum(s,'chorus',0);
    /* ══ 素の音は退かせない（tab-3.08）══
       打ち消し合いが縞を作るので、**相手を減らせば効きも減る。**
       揺れ幅は 2〜5ms。これ以上振ると音程のふらつきが目立ち、
       「うねり」ではなく「音痴」に聞こえる。 */
    /* 揺れ幅を広げる（tab-3.10）。5ms あたりまでなら音痴にならず、縞はよく動く */
    (FXCH_DEPTH||[]).forEach((d,i)=>{ d.gain.value=a*(i?0.0040:0.0052); });
    if(FXCH_LFO) FXCH_LFO.forEach((l,i)=>{ l.frequency.value=(i?0.52:0.70)*(1+a*0.4); });
    if(FXCH_DRY) FXCH_DRY.gain.value=1;
    /* **等分が最も深い。** 1 を越えても縞は深くならず、音量が増すだけ */
    if(FXCH_WET) FXCH_WET.gain.value=Math.min(1,a*1.0);
  }
  /* フランジャー */
  {
    const a=fxNum(s,'flange',0);
    /* ══ 素の音は退かせない（tab-3.08）══
       揺れ幅は 0.6ms から上へ最大 6ms。**低い所まで下りて初めて**
       あの掃き上げになる。戻りは縞を鋭くするが、0.85 を越えると発振する。 */
    /* ══ 掃きの幅（tab-3.12）══
       0.1ms から上へ。たっぷりで 4ms まで届く＝縞が 125Hz〜5kHz を
       駆け上がる。**この幅があって初めてジェットになる。** */
    /* 掃きの幅（tab-3.30）。0.4ms から上へ、たっぷりで 8.4ms まで */
    if(FXFL_DEPTH) FXFL_DEPTH.gain.value=a*0.0040;
    /* ══ 戻りは深く（tab-3.12）══
       ジェットの正体は**鋭く尖った縞**である。戻りが浅いと縞がなだらかで、
       ただのうねりにしかならない。0.88 まで上げる——0.9 を越えると発振する。 */
    if(FXFL_FB) FXFL_FB.gain.value=Math.min(0.88,a*0.78);
    /* ゆっくり掃くほど「飛び去る」感じが出る */
    if(FXFL_LFO) FXFL_LFO.frequency.value=0.12+a*0.22;
    if(FXFL_DRY) FXFL_DRY.gain.value=1;
    if(FXFL_WET) FXFL_WET.gain.value=Math.min(1,a*1.0);
  }
  /* トレモロ */
  {
    const a=fxNum(s,'trem',0), r=fxNum(s,'tremRate',2);
    /* 拍から割り出す（tab-3.09）。r は 1拍あたりの揺れの回数 */
    _trHz=Math.max(0.2,Math.min(24,r/Math.max(0.05,beat)));
    /* ══ 波の形を変える（tab-3.09）══
       正弦は**谷にいる時間が一瞬**なので、「途切れる」感じが出ない。
       深く掛けた時は三角に近い形——山と谷に留まる時間の長い波——へ
       寄せると、はっきり波打って聞こえる。 */
    /* ══ 速いほど角を立てる（tab-3.11）══
       速い揺れは耳が均してしまうので、正弦では丸まって消える。
       6Hz を越えたら三角へ寄せ、山と谷に留まる時間を稼ぐ。 */
    _trWave=(a>=0.6||_trHz>=5.5)?'triangle':'sine';
    if(FXTR_LFO){
      FXTR_LFO.frequency.value=_trHz;
      FXTR_LFO.type=_trWave;
    }
    /* ══ 谷を負にしない（tab-3.07）══
       深さが中心を越えると音量が負に振れ、**位相が裏返って割れる。**
       中心 = 深さ、が谷ちょうど 0。ここを越えないように結び付ける。 */
    /* ══ 速く揺らす時ほど深く（tab-3.10）══
       L様——「トレモロを早くかけた時よくわからん」。
       浅い揺れは**速いほど耳が均してしまう。** ふつうで谷が −8dB では、
       ゆっくりなら判っても、速いと平らに聞こえる。谷を沈める。 */
    const dep=Math.min(0.5,a*0.5);
    if(FXTR_DEPTH) FXTR_DEPTH.gain.value=dep;
    if(FXTR) FXTR.gain.value=Math.max(dep,1-a*0.75);
  }
  /* ディレイ（拍から割り出す。速さを変えても付いてくる） */
  {
    const kind=String(fxOf(s,'delay','0'));
    const a=fxNum(s,'delayAmt',0.28);
    const mul=FX_DELAY_MUL[kind==='t4'?'t8':kind];
    if(mul&&FXDL_D){
      /* 長い音価でも切れないよう、上限は 4秒（BPM60 の全音符まで。tab-6.42） */
      FXDL_D.delayTime.value=Math.min(4,beat*mul);
      /* ══ 返りは、弾いた音より前へ出ない（tab-4.78）══
         L様——「ディレイが基本かかりすぎかな」。

         二つ、盛り過ぎていた。

         ① **返りの大きさ。** `a*1.5` で送っていたので、〈ふつう〉でも 0.6——
            素の音を 1 とすれば**返りが六分**、〈たっぷり〉では八分を超える。
            そこへ繰り返しが重なるので、二音も弾けば返りの方が厚くなる。
         ② **繰り返しの数。** tab-3.10 で「二度ほどで消える」として戻りを
            0.78 まで上げたが、上げ過ぎた。〈控えめ〉ですら六度近く返る。

         > **返りは、弾いた音の影である。影が本体より濃くては困る。**

         返りは素の音の半分より下から始める。繰り返しは四度前後を上限とし、
         戻りの中の濾しも 3600→2400Hz へ落として、返るほど後ろへ退かせる
         （実際の機械も、繰り返すほど丸くなる）。
         〈どっぷり〉は今までの〈ふつう〉くらいまで出せるので、
         深く掛けたい時の道は残してある。 */
      if(FXDL_FB) FXDL_FB.gain.value=Math.min(0.68,0.20+a*0.60);
      if(FXDL_LP) FXDL_LP.frequency.value=2400;
      /* ディレイは素の音を退かせない——**返りは足すもの**である。
         退かせると「遠くで鳴っている音」になってしまう */
      mix(FXDL_DRY,FXDL_WET,Math.min(0.62,a*0.90),FXDL_SEND);
      if(FXDL_DRY) FXDL_DRY.gain.value=1;
    } else mix(FXDL_DRY,FXDL_WET,0,FXDL_SEND);
  }
  /* 空間の残響 */
  {
    const kind=String(fxOf(s,'room','0'));
    const a=fxNum(s,'roomAmt',0.25);
    const ir=(kind&&kind!=='0')?roomIR(kind):null;
    if(FXRV_CONV&&ir&&FXRV_CONV.buffer!==ir) FXRV_CONV.buffer=ir;
    if(FXRV_PRE) FXRV_PRE.delayTime.value=(kind==='hall')?0.03:(kind==='room'?0.012:0.006);
    /* 残響も**足すもの**。素の音は退かせず、返りだけを増す */
    mix(FXRV_DRY,FXRV_WET,ir?Math.min(1.6,a*2.2):0,FXRV_SEND);
    if(FXRV_DRY) FXRV_DRY.gain.value=1;
  }
  /* ══ 出口の抑えを決める（tab-3.10）══
     「足す」段がいくつ立っているかで見積もる。**掛けた数だけ退く**ので、
     一つだけ深く掛けた時は痩せず、全部盛った時だけ抑えが効く。 */
  {
    let add=0;
    add+=Math.min(1,fxNum(s,'chorus',0));
    add+=Math.min(1,fxNum(s,'flange',0));
    add+=Math.min(1,fxNum(s,'phaser',0));
    if(String(fxOf(s,'delay','0'))!=='0') add+=Math.min(1,fxNum(s,'delayAmt',0.4)*1.4);
    if(String(fxOf(s,'room','0'))!=='0')  add+=Math.min(1,fxNum(s,'roomAmt',0.35)*1.8);
    add+=Math.min(1,fxNum(s,'comp',0))*0.6;
    if(String(fxOf(s,'wah','0'))!=='0')   add+=0.4;
    /* 一段ごとにおよそ 15% ずつ退く。下限は半分——それ以上絞ると、
       エフェクトを掛けたとたんに音が遠くなる */
    if(FXTRIM) FXTRIM.gain.value=Math.max(0.5,1/(1+add*0.22));
  }
}

/* ノイズゲートの開き具合（弦の音の大きさ・整流してならした値）。−66dB で閉じ、−54dB で全開（tab-6.87） */
const GATE_LO=0.0005, GATE_HI=0.002, GATE_K=200;
function guitarBus(){
  if(!AC) return null;
  if(!GBUS){
    GBUS=AC.createGain();  GBUS.gain.value=1;
    GDRY=AC.createGain();  GDRY.gain.value=1;
    GWET=AC.createGain();  GWET.gain.value=0;
    GTRIM=AC.createGain(); GTRIM.gain.value=H.playVol();   /* 覚えた混ぜ具合（tab-6.12） */
    GCONV=AC.createConvolver?AC.createConvolver():null;
    if(GCONV) GCONV.normalize=false;
    GCLEAN=AC.createGain(); GCLEAN.gain.value=1;
    /* ══ コンプを歪みの前へ（tab-6.73）══
       L様——「コンプは繋ぎを説明どおり、歪みの前に付け替える」。
       以前はエフェクトの列（音色の出口 GTRIM の後ろ）にあり、説明と食い違っていた。
       弦の音が入る GBUS の直後に置き、ここから先（素の音・胴・歪み）はすべて GPOST から分ける。
       使わない時は素通し（FXCOMP_DRY=1・送り0）。 */
    GPOST=AC.createGain(); GPOST.gain.value=1;
    { const c=AC.createDynamicsCompressor?AC.createDynamicsCompressor():null;
      const dry=AC.createGain(), wet=AC.createGain(), send=AC.createGain();
      dry.gain.value=1; wet.gain.value=0; send.gain.value=0;
      GBUS.connect(dry); dry.connect(GPOST);
      GBUS.connect(send); if(c){ send.connect(c); c.connect(wet); } else send.connect(wet);
      wet.connect(GPOST);
      FXCOMP=c; FXCOMP_DRY=dry; FXCOMP_WET=wet; FXCOMP_SEND=send; }
    /* 素の音の道に遅れを一つ挟む。ふだんは 0。クリーンの歪みを混ぜる時だけ、潰す道の遅れ
       （曲線の4倍の細かさで潰すと、ブラウザが数ミリ秒遅らせる）に揃える——揃えないと、
       混ぜた所で打ち消し合い、音が痩せる（tab-6.73） */
    const _gdl=AC.createDelay(0.05); _gdl.delayTime.value=0;
    GPOST.connect(GDRY); GDRY.connect(_gdl); _gdl.connect(GCLEAN); GCLEAN.connect(GTRIM);
    if(GCONV){ GPOST.connect(GCONV); GCONV.connect(GWET); GWET.connect(GTRIM); }
    /* ══ クリーンの歪み（tab-6.73）══
       L様——「クリーンもつまみで調整できない？」。選択：0は真っさらなクリーン、上げるほど艶が乗り、
       上げきってもクランチより手前／**弾く強さに関わらず、つまみの分だけ均一に掛かる。**

       ふつうの潰し（曲線一枚）は、強く弾くほど深く掛かる。強さに依らず同じだけ掛けるため、
       別の道を一本並べて素の音に混ぜる：
         ① 大きく持ち上げて潰す——どの強さの音もほぼ同じ形（角の取れた矩形）になる＝歪みの割合が一定
         ② 角を落とす濾し（4.5kHz）
         ③ 元の音の大きさ（整流して濾した包絡）を掛け戻す——**大きさは弾いた強さのまま**
       混ぜる量はつまみで決め、混ぜたぶん素の音を引く（大きさは変えない）。上限は 0.3 で、
       3倍音がクランチより 5dB ほど下に留まる。 */
    { const pre=AC.createGain(); pre.gain.value=1;
      /* 持ち上げは曲線の中で行う（曲線の外＝±1 を超える入力は、ブラウザによって折り返して化けるため） */
      const shp=AC.createWaveShaper(); shp.oversample='4x';
      { const n=16385, c=new Float32Array(n); for(let i=0;i<n;i++){ const x=i*2/(n-1)-1; c[i]=Math.tanh(120*x); } shp.curve=c; }
      const lp=AC.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=4500; lp.Q.value=0.5;
      const vca=AC.createGain(); vca.gain.value=0;
      const ab=AC.createWaveShaper();
      { const n=2049, c=new Float32Array(n); for(let i=0;i<n;i++){ c[i]=Math.abs(i*2/(n-1)-1); } ab.curve=c; }
      const e1=AC.createBiquadFilter(); e1.type='lowpass'; e1.frequency.value=28; e1.Q.value=0.5;
      const e2=AC.createBiquadFilter(); e2.type='lowpass'; e2.frequency.value=28; e2.Q.value=0.5;
      const eg=AC.createGain(); eg.gain.value=CS_ENV_K;
      const mixg=AC.createGain(); mixg.gain.value=0;
      GPOST.connect(pre); pre.connect(shp); shp.connect(lp); lp.connect(vca); vca.connect(mixg); mixg.connect(GCLEAN);
      GPOST.connect(ab); ab.connect(e1); e1.connect(e2); e2.connect(eg); eg.connect(vca.gain);
      GCS={mix:mixg,pre,dly:_gdl}; }

    /* ══ 歪みは全弦を混ぜた後で掛ける ══
       一音ずつ歪ませると、音どうしが混じり合わない。
       和音が濁らず、いくら潰しても「歪んだギター」に聞こえない。
       実物のアンプが弦を選ばず一緒くたに増幅しているのと同じ理屈。 */
    /* ══ 歪ませる前に低音を切る（tab-1.75）══
       低音は振幅が大きいので、切らずに潰すと**低音から先に潰れる。**
       和音が泥になり、深くするほど輪郭を失う。実物のハイゲインが
       締まって聞こえるのは、前段でここを切っているからである。
       切る高さは音色ごと（`drive[5]`）。0 なら素通り。 */
    /* 整流はいちばん前（tab-4.80）。**潰す前に波の形を変える**のが要で、
       潰した後では矩形を折り返すだけになり、何も増えない。
       直流ぶんは、すぐ後ろの低音切りが落とす。 */
    GRECT=AC.createWaveShaper?AC.createWaveShaper():null;
    if(GRECT) GRECT.oversample='4x';
    GHP=AC.createBiquadFilter(); GHP.type='highpass'; GHP.Q.value=0.6;
    GHP.frequency.value=10;
    GPRE=AC.createGain();  GPRE.gain.value=1;
    GSHP=AC.createWaveShaper?AC.createWaveShaper():null;
    if(GSHP) GSHP.oversample='4x';        /* 折り返しの汚れを抑える */
    /* ══ 二段目の潰し（tab-1.75）══
       一段で深く潰しても、ある所から先は「潰れきった」音のまま変わらない。
       実物のハイゲインが段を重ねているのは、**一段目で潰れた波形を
       もう一度濾してから潰す**と、倍音の並びが変わるからである。
       間に軽く濾しを入れる（そのまま二度潰すと耳障りなだけになる）。
       使わない音色では素通りさせる（curve を直線、増幅を1、濾しを上限へ）。 */
    GLP2=AC.createBiquadFilter(); GLP2.type='lowpass'; GLP2.Q.value=0.5;
    GLP2.frequency.value=20000;
    GPRE2=AC.createGain(); GPRE2.gain.value=1;
    GSHP2=AC.createWaveShaper?AC.createWaveShaper():null;
    if(GSHP2) GSHP2.oversample='4x';
    GCAB=AC.createBiquadFilter(); GCAB.type='lowpass'; GCAB.Q.value=0.7;
    GMID=AC.createBiquadFilter(); GMID.type='peaking'; GMID.Q.value=0.9;
    GDIRT=AC.createGain(); GDIRT.gain.value=0;
    /* ══ 歪みの入口のノイズゲート（tab-6.87）══
       L様——「歪ませると常にノイズがなってる」。
       弦の音は少しずつ小さくなるが、ぴたりと0にはならない。歪みの強い音色は、その消え残りまで
       持ち上げるので、メタル・インセインでは弾いた後いつまでも −23dB で鳴り続けていた。
       本物のアンプと同じく、入口で小さな音を切る。弦の音の大きさを追いかけ（整流→ならし）、
       GATE_LO を下回れば閉じ、GATE_HI を越えれば全開。素の音・胴の響きには掛けない。 */
    const _gate=AC.createGain(); _gate.gain.value=0;
    { const ab=AC.createWaveShaper(), c=new Float32Array(1025);
      for(let i=0;i<1025;i++){ const x=i/512-1; c[i]=Math.abs(x); } ab.curve=c;
      const l1=AC.createBiquadFilter(); l1.type='lowpass'; l1.frequency.value=40; l1.Q.value=0.5;
      const l2=AC.createBiquadFilter(); l2.type='lowpass'; l2.frequency.value=40; l2.Q.value=0.5;
      const k=AC.createGain(); k.gain.value=GATE_K;               /* 小さな値を、曲線の分解能が足りる所まで持ち上げる */
      const cv=AC.createWaveShaper(), N=4097, cc=new Float32Array(N);
      for(let i=0;i<N;i++){ const x=(i/(N-1))*2-1, v=Math.max(0,x)/GATE_K;
        const u=Math.max(0,Math.min(1,(v-GATE_LO)/(GATE_HI-GATE_LO))); cc[i]=u*u*(3-2*u); }
      cv.curve=cc;
      GPOST.connect(ab); ab.connect(l1); l1.connect(l2); l2.connect(k); k.connect(cv); cv.connect(_gate.gain); }
    GPOST.connect(_gate);
    if(GRECT){ _gate.connect(GRECT); GRECT.connect(GHP); } else _gate.connect(GHP);
    GHP.connect(GPRE);
    const _afterShp=GSHP?(GPRE.connect(GSHP),GSHP):GPRE;
    _afterShp.connect(GLP2); GLP2.connect(GPRE2);
    if(GSHP2){ GPRE2.connect(GSHP2); GSHP2.connect(GCAB); } else GPRE2.connect(GCAB);
    GCAB.connect(GMID); GMID.connect(GDIRT); GDIRT.connect(GTRIM);

    /* ══ エフェクトの列を挟む（tab-2.99）══
       音色の出口（`GTRIM`）と `MASTER` のあいだ。使わない段は
       素通りするので、何も選んでいなければこれまでと同じ音が出る。 */
    /* ══ 列へ繋ぐのは、組めた時だけ（tab-3.25）══
       ここは `if(!GBUS)` の中——**一度きりしか通らない。**
       組めなければ `GTRIM→MASTER` で直に繋がれ、以後どれだけ
       列を組み直しても**音は通らない。**
       ゆえに繋ぎは外へ出し、組めた時に一度だけ差し替える。 */
    GTRIM.connect(H.busOut());          /* パートの出口へ（tab-6.45） */
    _fxWired=false;
    /* ══ 組んだら、その場で配る（tab-3.21）══
       L様——「起動してすぐと何かをいじった後だと聞こえ方が違う」。

       列を組むのはここ（バスを初めて作る時）だが、値を配る `fxApply` は
       **摘みが変わった時だけ**呼んでいた。ゆえに起動直後は
       **組み立ての初期値のまま鳴り**、どこかを触って初めて正しくなる。

       組み立ての値と、配る値は**別物**である。組んだら必ず配ること。 */
    _fxId=null;
    _gbId=null;
  }
  const t=tone();
  const sg=(H.song());
  const amt=bodyAmt(sg), dv=driveAmt(sg);
  /* ══ エフェクトの摘みを配る（tab-2.99）══
     鍵に織り込んで、変わった時だけ配り直す。テンポも見るのは
     ディレイの長さが拍から決まるためである。 */
  {
    /* セクションの束が差し込まれていればそちらを見る（tab-3.00） */
    const fs=(_sndNow&&_sndNow.fx)||(sg&&sg.play&&sg.play.fx)||{};
    const fk=JSON.stringify(fs)+'|'+((sg&&sg.play&&sg.play.bpm)||0);
    if(_fxId!==fk){
      const fx=fxChain();
      /* 組めた時に一度だけ、素通りの道から列へ差し替える（tab-3.25） */
      if(fx&&!_fxWired){
        try{ GTRIM.disconnect(H.busOut()); }catch(_){}
        GTRIM.connect(fx); FXOUT.connect(H.busOut());
        _fxWired=true;
      }
      fxApply(); _fxId=fk;
      /* ══ 配り直した跡を残す（tab-3.24）══
         **いつ・何が変わったか**を控えておく。コンソールで
         `fxLog()` と打てば、これまでの配り直しが一覧で出る。
         「変わった」の正体が、配り直しなのか別の物なのかが判る。 */
      try{
        _fxLog.push({t:+AC.currentTime.toFixed(2),鍵:fk,束:_sndNow?'あり':'なし'});
        if(_fxLog.length>50) _fxLog.shift();
      }catch(_){}
    }
  }
  const cdv=(t.id==='clean'||String(t.id).indexOf('clean@')===0)?cdriveAmt(sg):0;   /* クリーンの歪み（tab-6.73） */
  const key=t.id+'|'+amt+'|'+(t.drive?dv:0)+'|c'+cdv;
  if(_gbId!==key){
    const ir=GCONV?bodyIR(t):null;
    const wet=(ir&&t.wet)?Math.min(1,t.wet*amt):0;
    if(GCONV&&ir) GCONV.buffer=ir;
    GWET.gain.value=wet;
    GDRY.gain.value=(1-wet*0.45)*(1-CS_MAX*cdv);      /* 濡れたぶんだけ素の音を少し引く。クリーンの歪みを混ぜたぶんも引く */
    if(GCS&&GCS.mix){ GCS.mix.gain.value=CS_MAX*cdv; if(GCS.dly) GCS.dly.delayTime.value=cdv>0?csLatency():0; }
    /* 音色ごとの補正に、混ぜ具合を**掛け合わせる**（tab-6.12）。
       上書きすれば、音色を変えるたび摘みが忘れられる——
       **二つの理由で同じ摘みを動かすなら、掛ける。** */
    GTRIM.gain.value=(t.trim||1)*H.playVol();
    if(t.drive&&GPRE){
      const [pre,k,cab,mid,mg,hp,k2,lp2,pre2,rect]=t.drive;
      if(GHP) GHP.frequency.value=Math.max(10,hp||10);
      /* 整流の混ぜ具合（tab-4.80）。0 なら素通り */
      { const rr=Math.max(0,Math.min(1,(rect||0)*Math.min(1.4,dv)));
        if(GRECT&&_shpR!==rr){ GRECT.curve=rr>0?rectCurve(rr):null; _shpR=rr; } }
      /* 二段目。使わない音色では素通り */
      const kk2=(k2>0)?Math.max(0.5,k2*dv):0;
      /* 二段目の前の濾しも音色ごと（tab-4.79。既定は 6000） */
      if(GLP2) GLP2.frequency.value=kk2?(lp2||6000):20000;
      /* ══ 二段目へ送り込む強さも音色ごと（tab-4.79）══
         潰しの曲線は、ある所から先は**矩形に近づいて止まる**。
         ゆえに前段をいくら上げても倍音はもう増えない——変わるのは
         **どこまで小さい音を持ち上げるか**である。
         尾（減衰しきる手前）まで潰れきったまま伸びるのが、
         耳には「もっと歪んでいる」と届く。 */
      if(GPRE2) GPRE2.gain.value=kk2?(pre2||2.2):1;
      if(GSHP2&&_shpK2!==kk2){
        GSHP2.curve=kk2?driveCurve(kk2):null;
        _shpK2=kk2;
      }
      GPRE.gain.value=pre*dv;
      /* 曲線は作るのに手間が掛かる。同じ深さなら作り直さない */
      const kk=Math.max(0.5,k*dv);
      if(GSHP&&_shpK!==kk){ GSHP.curve=driveCurve(kk); _shpK=kk; }
      GCAB.frequency.value=cab;
      GMID.frequency.value=mid; GMID.gain.value=mg;
      GDIRT.gain.value=1; GCLEAN.gain.value=0;
    }else if(GPRE){
      GDIRT.gain.value=0; GCLEAN.gain.value=1;
    }
    _gbId=key;
  }
  return GBUS;
}
/* 弾いた瞬間の音。ピッチを持たない一撃で、弦の音の頭に重ねる */
function pickHit(at,vol,tn,out){
  if(!AC||!tn.pick) return;
  const [hz,q,dur,lv]=tn.pick;
  const sr=AC.sampleRate, len=Math.max(8,Math.round(sr*dur));
  const buf=AC.createBuffer(1,len,sr), o=buf.getChannelData(0);
  for(let i=0;i<len;i++){ const e=1-i/len; o[i]=(Math.random()*2-1)*e*e; }
  const src=AC.createBufferSource(); src.buffer=buf;
  const bq=AC.createBiquadFilter(); bq.type='bandpass';
  bq.frequency.value=hz; bq.Q.value=q;
  const g=AC.createGain(); g.gain.value=Math.max(0.0001,vol*lv);
  src.connect(bq); bq.connect(g); g.connect(out);
  src.start(at); src.stop(at+dur+0.02);
}

/* ══ Phase 5-C — 撥弦の合成（Karplus-Strong）══
   雑音を詰めた遅延線を、少しずつ均しながら回す。
   弦をはじいた時の「最初は倍音だらけ、じきに丸くなる」挙動が出る。 */
const _ksCache=new Map();
let _ksBytes=0;                     /* 控えが抱えている目方（バイト） */
const KS_CACHE_BYTES=64*1024*1024;  /* 総量の頭。本数より先にこちらが効くことが多い */
/* 遅延線の長さ N から作る。この実装は「次の枡と平均する」ので、
   実際に鳴る高さは sr/(N-0.5) になる（半サンプルぶん先へ進む）。
   端数は再生速度で補正するので、buffer は N ごとに使い回せる。 */
function ksFreq(N){ return AC.sampleRate/(N-0.5); }
function ksLength(freq){ return Math.max(3,Math.round(AC.sampleRate/freq+0.5)); }
/* ══ 弦が鳴りやむまでの時間（-60dB まで）══
   以前は「1周あたりの減衰率」を固定していたため、高音弦が一瞬で消えていた。
   高さで落ち方を変えるようにしたが、**傾きが急すぎた**（tab-1.61）。
   0.28 乗では 1弦12F が 6弦開放の 0.55 倍まで縮み、
   弦ごとの補正（下の `strTone`）と掛け合わさって**二重に痩せて**いた。
   実物のギターはここまで隔たらない。0.20 乗へ緩めた。 */
function ksT60(freq,tn){
  const t=(tn||tone()).t60;
  return Math.max(t[0],Math.min(t[1],(t[1]*1.18)*Math.pow(80/Math.max(60,freq),0.20)));
}
/* ══ どこまで書き出すか（tab-1.61）══
   バッファは `ksT60` 秒かけて 0.001（-60dB）まで落ちる。
   だが**最後の四分の一は耳に届かない**（-45dB より下）。
   そこまで書き出すのは、聞こえない波形のために丈を取っているだけである。
   伸ばすぶんの目方をここで返す——**減衰を緩めても、控えはさほど太らない。**
   ※ 減衰の速さ自体は `ksT60` のままなので、書き出す丈を切っても音は変わらない。 */
const KS_TAIL=0.75;
/* 書き出す丈の頭（秒）。伸びを 1.6 倍にした歪みの低音は
   これを越えるので、そこで切る。**切った先はもう -30dB より下**である。
   控え一本を 2MB 前後に収めるための歯止めでもある（tab-1.62）。 */
const KS_MAX_SECS=12;
/* ══════════════════════════════════════════
   弦ごとの手触り

   これまで六本の弦は**まったく同じ音色**で鳴っていた。
   高さが違うだけで、太さの違いが音に出ていなかった。

   そのため**オクターブの型が一つの音に聞こえる**。
   二音が同じ音色・同じ減衰で、しかも十数ミリ秒のうちに重なると、
   耳は上の音を下の音の倍音として束ねてしまう。実物のギターで
   束ならないのは、巻き弦とプレーン弦の手触りがまるで違うからである。

   ここでは二つだけ変える。多くを触ると音色設定の意味が崩れる。
     ・種（ピックの当たりの明るさ）… 太い弦ほど鈍く、細い弦ほど鋭く
     ・残響時間             … 太い弦ほど長く伸び、細い弦ほど早く痩せる
   ══════════════════════════════════════════ */
const _stCache=new Map();
function strTone(tn,str){
  if(tn==null||str==null||str<0) return tn;
  const nS=H.strCount(H.song());
  const key=tn.id+'|s'+str+'/'+nS;
  if(_stCache.has(key)) return _stCache.get(key);
  /* 0＝いちばん太い弦（6弦）… 1＝いちばん細い弦（1弦） */
  const u=(nS>1)?Math.max(0,Math.min(1,str/(nS-1))):0.5;
  const o=Object.assign({},tn);
  o.id=key;                                   /* バッファの控えを弦ごとに分ける */
  /* ══ 差は思い切って付ける ══
     はじめ控えめ（種 0.80〜1.20倍）に振ってみたが、明るさの差は 1.08 倍にしかならず、
     数字では動いていても耳には届かなかった。
     実物の巻き弦とプレーン弦はもっと隔たっている。 */
  o.seed=Math.max(0.05,Math.min(1,(tn.seed||0.5)*(0.50+1.10*u)));
  /* ══ 伸びの差は、明るさの差ほど付けない（tab-1.61）══
     太い弦がよく伸びるのは本当だが、1.26〜0.78（1.6倍の開き）は付けすぎであった。
     高さによる落ち方（`ksT60`）と掛け合わさり、細い弦が**二重に痩せて**いた。
     弦の隔たりは主に**種（明るさ）**が担っている——そちらは思い切ったまま残す。 */
  const m=1.22-0.40*u;
  o.t60=[tn.t60[0]*m,tn.t60[1]*m];
  _stCache.set(key,o);
  return o;
}

/* ══════════════════════════════════════════════════════════════
   ブリッジミュートは、二段（tab-5.95）
   ══════════════════════════════════════════════════════════════
   L様——「ブリッジミュートはタイトなものとルーズなものが欲しい。今はルーズな感じ」。

   仰るとおりであった。これまでの掛かり方は二行しかない——

     if(sym.pm) vol*=0.8;                     音量を八分に
     else if(sym.pm) cut=Math.min(dur,0.12);  0.12秒で切る

   **音色そのものは何も変えていない。** 素の弦のまま短く切っているだけで、
   掌で押さえた時の**低く詰まった響き**にはなっていなかった。
   0.12秒という長さも、ブリッジミュートとしては確かに緩い。

   > **短く切るのと、掌で押さえるのは、別のことである。**

   掌を当てると弦は三つ変わる——
     ①**早く止まる**（伸びが縮む）
     ②**高い所が落ちる**（詰まって聞こえる）
     ③**当たりが鈍る**（撥の鋭さが丸まる）

   タイトは①②③を強く、ルーズは軽く。長さだけでなく**詰まり方**で分ける。
   器には既に `mute` 音色があるので、その締め方を借りる。 */
const PM_KIND={
  /* 伸び／高域／撥の鋭さ／音量／切る長さ */
  tight: {t60:0.16, lp:0.45, pick:0.55, vol:0.72, cut:0.055},
  loose: {t60:0.34, lp:0.70, pick:0.80, vol:0.86, cut:0.150},
};
function pmOf(sym){
  if(!sym||!sym.pm) return null;
  return PM_KIND[(sym.pmKind==='loose')?'loose':'tight'];   /* 既定はタイト（tab-5.95） */
}
/* 音色に、掌の締めを掛ける。`strTone` の後ろで挟む */
const _pmCache=new Map();
function pmTone(tn,pm){
  if(!tn||!pm) return tn;
  const key=tn.id+'|pm'+pm.t60;
  if(_pmCache.has(key)) return _pmCache.get(key);
  const o=Object.assign({},tn);
  o.id=key;
  o.t60=[tn.t60[0]*pm.t60, tn.t60[1]*pm.t60];              /* ① 早く止まる */
  if(tn.lp) o.lp=[tn.lp[0], Math.max(240,tn.lp[1]*pm.lp),
                            Math.max(900,tn.lp[2]*pm.lp)]; /* ② 高い所が落ちる */
  if(tn.pick) o.pick=[Math.max(600,tn.pick[0]*pm.pick), tn.pick[1],
                      tn.pick[2]*(2-pm.pick), tn.pick[3]]; /* ③ 当たりが鈍る */
  o.wet=Math.max(0,(tn.wet==null?0.2:tn.wet)*pm.lp);       /* 胴の鳴りも詰まる */
  _pmCache.set(key,o);
  return o;
}
/* ══════════════════════════════════════════════════════════════
   スライドバー（ボトルネック）（tab-6.16）
   ══════════════════════════════════════════════════════════════
   L様のお指図——**① 当たりを丸め ② 伸びを長くし ⑤ 擦れる音を足す。**
   滑りと揺れは書いた所だけ（スライド記号・ビブラート記号のまま）。

   金属やガラスの筒を弦に当てて弾くと、弦は三つ変わる——

     ① **当たりが丸い**……フレットに当たらないので、あの硬い頭が出ない
     ② **長く伸びる**……筒が弦を押さえ切らず、振動が死なない
     ⑤ **擦れる音がする**……筒が弦の巻きを撫でる、ごく短い雑音

   ブリッジミュート（`pmTone`）と同じ形で音色に掛ける。
   あちらが**締める**のに対し、こちらは**緩めて伸ばす**——向きが逆である。 */
/* ══ 効き幅（tab-6.16-2 で強めた）══
   L様——「違いがわからない」。控えめに過ぎた。
   筒を当てた弦は、**同じギターの別の楽器**と言ってよいほど変わる。
   遠慮して掛ければ、掛けた意味が無い。 */
const SB={ t60:2.2, pick:0.26, attack:4.2, lp:0.82, vol:0.94, noise:0.13 };
const _sbCache=new Map();
function sbTone(tn){
  if(!tn) return tn;
  const key=tn.id+'|sb';
  if(_sbCache.has(key)) return _sbCache.get(key);
  const o=Object.assign({},tn);
  o.id=key;
  o.t60=[tn.t60[0]*SB.t60, tn.t60[1]*SB.t60];              /* ② 長く伸びる */
  if(tn.pick) o.pick=[Math.max(420,tn.pick[0]*SB.pick),    /* ① 当たりが丸い */
                      tn.pick[1], tn.pick[2]*SB.attack, tn.pick[3]*0.58];
  /* 筒は爪や撥ほど高い所を立てない。てっぺんだけ少し下ろす */
  if(tn.lp) o.lp=[tn.lp[0], tn.lp[1], Math.max(2600,tn.lp[2]*SB.lp)];
  _sbCache.set(key,o);
  return o;
}
/* ⑤ 筒が弦を撫でる音。`fingerHit` と同じ作りで、**高く・長く・薄く**。
   これが無いと「柔らかいギター」に聞こえるだけで、筒を当てた感じが出ない */
function slideHit(at,vol){
  if(!AC) return;
  const sr=AC.sampleRate, dur=0.055, len=Math.max(8,Math.round(sr*dur));
  const buf=AC.createBuffer(1,len,sr), o=buf.getChannelData(0);
  for(let i=0;i<len;i++){
    const p=i/len, e=Math.sin(Math.PI*Math.min(1,p*1.6))*(1-p);
    o[i]=(Math.random()*2-1)*e*e;
  }
  const src=AC.createBufferSource(); src.buffer=buf;
  const bq=AC.createBiquadFilter(); bq.type='bandpass';
  bq.frequency.value=3200; bq.Q.value=1.4;
  const g=AC.createGain(); g.gain.value=Math.max(0.0001,vol*SB.noise);
  src.connect(bq); bq.connect(g); g.connect(guitarBus()||MASTER);
  src.start(at); src.stop(at+dur+0.02);
}
function sbOn(sym){ return !!(sym&&sym.sb); }
/* ══ 筒は、開放弦には当たらない（tab-6.16-3）══
   L様——「どうやって０フレットからスライドすんだよ」。**仰るとおりであった。**
   筒を弦に当てれば、それは押さえた状態である。0フレット——開放弦——には
   当てようがない。**筒を当てた開放弦という音は、この世に無い。**

   とはいえ、開放弦を混ぜて弾くのがボトルネックの常道でもある——
   「5弦は筒、6弦は開放」は、実際に鳴らされる形である。
   ゆえに**帯ごと禁じるのではなく、弦ごとに見る**。
   帯の中でも、0フレットの弦だけは素の音で鳴る。

   > **記号は音符に掛かるが、弦の物理は弦ごとに決まる。** */
function sbAt(sym,fret){ return sbOn(sym)&&Number(fret)>0; }
function ksBuffer(N,tn){
  tn=tn||tone();
  const sr=AC.sampleRate, key=N+'|'+tn.id;
  if(_ksCache.has(key)) return _ksCache.get(key);
  const freq=ksFreq(N);
  /* 減衰は T60 のまま。**書き出す丈だけ**を耳に届く所で切る（tab-1.61） */
  const secs=Math.min(KS_MAX_SECS,ksT60(freq,tn)*KS_TAIL);
  const len=Math.max(1,Math.round(sr*secs));
  const buf=AC.createBuffer(1,len,sr), out=buf.getChannelData(0);
  /* ══ 種は毎回おなじにする（tab-3.27）══
     L様——「２回目再生すると音が変わる」。

     ここは `Math.random()` で雑音を起こしていた。**控え（`_ksCache`）が
     残っているうちは同じ音が返るが、上限に達して捨てられると作り直され、
     その時に別の乱数が引かれる。** ゆえに同じ譜面・同じ設定でも、
     二度目に鳴らすと音が変わっていた。

     ハイゲイン＋強い歪みは伸びが長く、波形一本が大きい。
     上限（目方）に真っ先に届くので、**この組み合わせで最も現れる。**
     診断で音色が `metal@0.35`・歪み 2.4 と出ていたのが符合する。

     弦の音は**同じ弦・同じ音色なら同じ**であるべきもの。
     鍵から種を起こす（同じ鍵なら必ず同じ並び）。 */
  const d=new Float32Array(N); let prev=0;
  const sd=tn.seed;
  /* 鍵の文字から種を作る。取り立てて良い乱数である必要はない——
     **毎回おなじであることだけ**が要る */
  let rs=1779033703;
  for(let i=0;i<key.length;i++){ rs=Math.imul(rs^key.charCodeAt(i),3432918353); rs=(rs<<13)|(rs>>>19); }
  const rnd=()=>{ rs=Math.imul(rs^(rs>>>15),2246822507); rs=Math.imul(rs^(rs>>>13),3266489909);
                  rs^=rs>>>16; return (rs>>>0)/4294967296; };
  for(let i=0;i<N;i++){ const w=rnd()*2-1; prev=sd*w+(1-sd)*prev; d[i]=prev; }
  /* 高い弦ほど早く減衰する */
  /* 目標の残響時間から、1周あたりの減衰率を逆算する */
  const decay=Math.exp(Math.log(0.001)/(freq*ksT60(freq,tn)));
  let idx=0, y=0;
  for(let i=0;i<len;i++){
    const a=d[idx], b=d[(idx+1)%N];
    y=decay*0.5*(a+b);
    out[i]=d[idx]; d[idx]=y; idx=(idx+1)%N;
  }
  /* 頭と尻を整える */
  const fi=Math.min(48,len);
  for(let i=0;i<fi;i++) out[i]*=i/fi;
  /* 尻の始末。丈を切った所で終わるので、以前より長めに寝かせる（tab-1.61） */
  const fo=Math.min(6600,len);
  for(let i=0;i<fo;i++) out[len-1-i]*=i/fo;
  /* ══ 控えの捨て方 ══
     伸ばしたぶん一つが重い（5秒＝約880KB）。持ちすぎない。
     ただし **全部捨ててはいけない**。以前は上限を越えた時に clear() で
     まとめて流していたため、越えた次の一音から六本ぶんを作り直すことになり、
     ちょうどそこで音が途切れた。合成は主スレッドで同期に走るからである。
     Map は入れた順を憶えているので、**古いものから数本だけ**流す。

     ══ 本数だけでなく、総量でも頭を打つ（tab-1.61）══
     一つの重さは高さと音色で十倍以上ちがう。歪みの低音は一本 2MB を越えるので、
     **本数だけで数えると、同じ110本でも抱える目方が桁ちがいになる。**
     履歴で同じことをした（§13）のと同じ筋である。 */
  _ksCache.set(key,buf);
  _ksBytes+=buf.length*4;
  while((_ksCache.size>110||_ksBytes>KS_CACHE_BYTES)&&_ksCache.size>8){
    const k=_ksCache.keys().next();
    if(k.done) break;
    const old=_ksCache.get(k.value);
    _ksBytes-=(old?old.length*4:0);
    _ksCache.delete(k.value);
  }
  return buf;
}
/* いま鳴っている弦。ブラッシングで掌が触れた時に止めるため控えておく */
let VOICES=[];
/* ══ 弦ごとの「いま鳴っている声」══
   ハンマリング・プリング・スライドは、弦を弾き直さずに
   **鳴っている弦の音程だけを動かす**。そのために直前の声を控えておく。 */
let LASTV=new Map();
/* ══ 弦の帳簿を、パートごとに分ける（tab-6.27）══
   L様——「可能であれば同時再生も」。

   音は「いま何弦が鳴っているか」で管理している（`LASTV`）。
   二つのパートを同時に鳴らすと**両方が同じ3弦を使う**ので、
   後から来た方が前の音を消してしまう——ギターが二本あるのに、
   器は弦を六本しか数えていなかった。

   ここで分けるのは**帳簿の鍵だけ**である。弦の番号そのものは
   `strTone` が音色を決めるのに使っており（太い弦は暗く、細い弦は明るい）、
   番号をずらせば音色まで変わってしまう。

   > **鍵と番号は別物。分けるのは鍵の方だけ。**

   `VK_BASE` はこれから鳴らす出来事のパートを指す。`fireEvent` が
   出来事ごとに置き換える（`_sndNow` と同じ作法）。 */
const VK_SPAN=16;              /* 一パートに取っておく鍵の幅。弦は最大でも十数本 */
let VK_BASE=0;
function vkOf(str){ return (str==null||str<0)?str:(VK_BASE+str); }
function pruneVoices(t){
  if(VOICES.length<=180) return;
  VOICES=VOICES.filter(v=>v.offAt>t-0.25);
}
/* その時刻に鳴っている弦を、掌で押さえたように止める */
/* その時刻に、その弦がどれだけの大きさで鳴っているか。
   **消す時は、いまの大きさから落とすこと。**
   旧版は `setValueAtTime(v.vol,t)` と、**弾いた時の大きさへ戻して**いた。
   スタッカートや P.M. で既に減衰の途中だった弦は、そこで一度**元の大きさまで跳ね上がり**、
   それから落ちる。ブラッシングやコードの変わり目の直前に音が膨らんで聞こえたのはこれ。 */
function voiceLevelAt(v,t){
  if(v.relAt==null||t<=v.relAt) return v.vol;
  const k=Math.min(1,(t-v.relAt)/Math.max(0.001,v.rel));
  return Math.max(0.0001,v.vol*Math.pow(0.0001/Math.max(0.0001,v.vol),k));
}
/* ══ 止めるのは、自分のパートの弦だけ（tab-6.37）══
   L様——「パートを増やすとタイで繋いだ音が消える」。

   パートを足すと、表に出るのは新しい空のパート——休符ばかりである。
   休符は「弦を止める」出来事を出す。その出来事が**全パートの弦を止めていた。**
   1本目でタイで伸ばしている音は、2本目の休符に切られて消えていた。

   止める手は、そのパートの手である。**他のパートの弦には触れない。**
   出来事を鳴らしている間（`fireEvent`）は、その出来事のパートの弦だけを止める。
   外から呼ぶ時（周の折り返し・停止）は、これまで通りすべてを止める。 */
let DAMP_VB=null;
function dampVoices(t,ms){
  const fade=(ms||45)/1000;
  /* ══ 控えを消すのは、本当に止めた声だけ（tab-1.73）══
     以前は「その時刻より前に始まった声」の控えを**まとめて**消していた。
     だが `dampVoices` は**未来の時刻**でも呼ばれる——アームの下げは
     音価の終わり際に断つので、呼ぶのは今、断つのは数秒先である。

     すると、断つ時刻より前に自然に消える声まで控えを外され、
     **その間に同じ弦を弾いても、前の声を止められなくなる。**
     実測（たしかめ帳・3弦）で、前の音が最後の和音の下に
     **4.2秒鳴り続けていた。**

     止めた声の控えだけを外す。止めていない声は、そのまま控えに残す。 */
  VOICES.forEach(v=>{
    if(DAMP_VB!=null&&(v.vb||0)!==DAMP_VB) return;  /* 他のパートの弦（tab-6.37） */
    if(v.at>=t-0.001||v.offAt<=t) return;       /* まだ鳴っていない／もう消えている */
    const lv=voiceLevelAt(v,t);
    try{
      v.g.gain.cancelScheduledValues(t);
      v.g.gain.setValueAtTime(Math.max(0.0001,lv),t);
      v.g.gain.exponentialRampToValueAtTime(0.0001,t+fade);
    }catch(e){}
    v.vol=Math.max(0.0001,lv); v.relAt=t; v.rel=fade;
    v.offAt=t+fade;
    /* 掌で止めた弦は、もう繋げられない */
    if(v.vk!=null&&v.vk>=0&&LASTV.get(v.vk)===v) LASTV.delete(v.vk);
  });
}
function stopAllVoices(t){ dampVoices(t+0.001,60); VOICES=[]; LASTV.clear(); }

/* 弦を1本はじく */
/* opt … TAB の奏法をここで受ける
   glide  {semi, at, dur}   … チョーキング・スライドの音程移動
   back   {semi, at, dur}   … チョークダウン（戻し）
   vib    {depth, rate}     … ビブラート
   soft   true              … ハンマリング／プリング（ピックの当たりを消す）
   harm   'n'|'a'|'p'       … ハーモニクス */
let opt_str_stash=null;
/* ══ ハーモニクスの音程 ══
   ナチュラルハーモニクスは、触れる位置で何倍音が出るかが決まる。
   12F=2倍音(+12) 7F/19F=3倍音(+19) 5F/24F=4倍音(+24) 9F/16F=5倍音(+16) 4F=6倍音(+28) */
const NAT_HARM={12:12,7:19,19:19,5:24,24:24,9:16,16:16,4:28,3:31};
function harmShift(kind,fret){
  if(kind==='n') return NAT_HARM[fret]!==undefined?NAT_HARM[fret]:12;
  if(kind==='a') return 12;            /* 人工（オクターブ上を取る） */
  return 19;                           /* ピッキング（倍音を拾う。3倍音あたり） */
}
/* ══ ハーモニクスの音 ══
   撥弦の合成をそのまま使うと、ただ高いだけの音になり、ふつうの音と区別が付かない。
   ハーモニクスは倍音が極端に少なく、立ち上がりが柔らかく、長く伸びる。
   そこで正弦波を数本重ね、頭に細い当たりを載せる形で作る。 */
function pluckHarmonic(at,midi,vol,cut,kind,vib){
  if(!AC) return null;
  const out=guitarBus()||MASTER;
  const f=440*Math.pow(2,(midi-69)/12);
  const g=AC.createGain();
  const long=(kind==='n')?4.6:3.0;                 /* ナチュラルはよく伸びる（tab-1.61 で実物へ寄せた） */
  const dur=cut>0?Math.min(long,cut+0.10):long;
  g.gain.setValueAtTime(0.0001,at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002,vol*1.15),at+0.008);   /* 柔らかい立ち上がり */
  g.gain.exponentialRampToValueAtTime(0.0001,at+dur);
  g.connect(out);
  /* ══ ハーモニクスにも揺れを掛ける（tab-2.21）══
     L様のお申し出——「A.Hにビブラートがかかってない」。
     実測すると**ハーモニクス全種**（ナチュラル・人工・ピッキング）で
     振れ幅 0.00半音、つまり一切揺れていなかった。

     撥弦の声は Karplus-Strong の再生速度（`v.pr`）で音程を動かすが、
     **ハーモニクスは正弦波を重ねて作っており `pr` を持たない**（`pr:null`）。
     揺れを掛ける口がそもそも無かった——`opt.vib` は渡っていても、
     受け取る側が無いので黙って捨てられていた。

     倍音の周波数を直に階段状に動かす。撥弦側（tab-1.47）と同じ筋——
     丈に収め、終わりは中心へ戻す。**倍音ごとに掛ける**のを忘れないこと。
     一本だけ揺らせば、倍音どうしがずれて濁る。 */
  const vSteps=(()=>{
    if(!vib) return null;
    const vt0=at+0.05;
    return {vt0,dep:(vib.depth||0.25),rate:(vib.rate||5.5),
            room:(vib.dur>0)?(at+vib.dur-vt0):null};
  })();
  [[1,1.0,1.0],[2,0.16,0.62],[3,0.07,0.42]].forEach(([mul,lv,ln])=>{
    if(f*mul>16000) return;
    const o=AC.createOscillator(); o.type='sine'; o.frequency.value=f*mul;
    if(vSteps){
      const base=f*mul;
      applyVib(o.frequency,base,vSteps.vt0,vSteps.dep,vSteps.rate,vSteps.room);
    }
    const gg=AC.createGain();
    gg.gain.setValueAtTime(0.0001,at);
    gg.gain.exponentialRampToValueAtTime(Math.max(0.0002,lv),at+0.010);
    gg.gain.exponentialRampToValueAtTime(0.0001,at+dur*ln);
    o.connect(gg); gg.connect(g);
    o.start(at); o.stop(at+dur+0.05);
  });
  /* 頭の当たり。ピッキングハーモニクスだけは鋭く高い */
  const sr=AC.sampleRate, hl=Math.max(8,Math.round(sr*0.012));
  const hb=AC.createBuffer(1,hl,sr), ho=hb.getChannelData(0);
  for(let i=0;i<hl;i++){ const e=1-i/hl; ho[i]=(Math.random()*2-1)*e*e*e; }
  const hs=AC.createBufferSource(); hs.buffer=hb;
  const hf=AC.createBiquadFilter(); hf.type='bandpass';
  hf.frequency.value=(kind==='p')?4200:2800; hf.Q.value=1.4;
  const hg=AC.createGain(); hg.gain.value=vol*((kind==='p')?0.45:0.22);
  hs.connect(hf); hf.connect(hg); hg.connect(out);
  hs.start(at); hs.stop(at+0.04);
  /* ══ 落ち始めの時刻を記す（tab-1.47）══
     この声は at+0.008 から at+dur まで落ち続ける。relAt を伏せたままだと
     `voiceLevelAt` が「まだ弾いた時の大きさ」と答えるので、P.M. やコードの
     変わり目で止める時に**一度膨らんでから**落ちる。撥弦の側では
     tab-1.15 で片づけた病が、ハーモニクスにだけ残っていた。 */
  const v={g,vol:Math.max(0.0002,vol*1.15),at,relAt:at+0.008,rel:Math.max(0.01,dur-0.008),offAt:at+dur,
           src:null,pr:null,base:1,midi,str:(opt_str_stash==null?-1:opt_str_stash),
           vk:vkOf(opt_str_stash==null?-1:opt_str_stash),
           vol0:vol,decT:dur,bq:null,c0:null,harm:true};
  v.vb=VK_BASE; VOICES.push(v); pruneVoices(at);
  return v;
}
function pluck(at,midi,vol,cut,opt){
  /* ══ 実際に弾いた高さを覗く口（tab-4.06）══
      は「そのバッファの素の音に対する比」なので、
     **比だけでは実際の高さが判らない**（バッファは音ごとに選び直される）。
     試験が絶対の高さで測れるよう、弾いた midi をここで控える。
      を置いた時だけ動くので、ふだんは何もしない。 */
  if(typeof window!=='undefined'&&window.__pluckLog) window.__pluckLog.push({at,midi});
  if(!AC) return null;
  opt=opt||{};
  let tn=strTone(tone(),(opt.str==null?-1:opt.str));
  if(opt.pm) tn=pmTone(tn,opt.pm);              /* 掌の締め（tab-5.95） */
  if(opt.sb) tn=sbTone(tn);                     /* 筒を当てて弾く（tab-6.16） */
  const out=guitarBus()||MASTER;
  if(opt.harm){
    /* ══ ハーモニクスも「同じ弦を弾けば前の音は止まる」（tab-1.47）══
       tab-1.46 で入れた掟は `pluck` の末尾にあるが、この分岐は**その手前で返る**。
       ゆえにハーモニクスの時だけ素通りし、前の音のビブラートが下で鳴り続けていた。
       物理の側の決まりなので、音色で分かれてはならない。 */
    if(opt.str!=null&&opt.str>=0&&!opt.skip) hushVoice(opt.str,at,22);   /* 鍵は hushVoice の中で付く */
    /* ハーモニクスは別の音色で作る。ここで分ける */
    midi+=harmShift(opt.harm,opt.fret);
    opt_str_stash=(opt.str==null?-1:opt.str);
    const hv=pluckHarmonic(at,midi,vol,cut,opt.harm,opt.vib);   /* 揺れも渡す（tab-2.21） */
    opt_str_stash=null;
    if(hv&&opt.str!=null&&opt.str>=0){ hv.vk=vkOf(opt.str); LASTV.set(hv.vk,hv); }
    return hv;
  }
  const f=440*Math.pow(2,(midi-69)/12);
  const N=ksLength(f);
  const buf=ksBuffer(N,tn);
  const src=AC.createBufferSource(); src.buffer=buf;
  if(src.playbackRate) src.playbackRate.value=f/ksFreq(N);   /* 端数を再生速度で合わせる */
  /* ══ 音程を動かす ══
     KS は遅延線の長さで高さが決まるので、再生速度を動かして代用する。
     厳密な弦の物理ではないが、チョーキングの「上がっていく」感じは出る。 */
  const base=f/ksFreq(N);
  let endRate=base, endMidi=midi;      /* 最後に落ち着く高さ。次の音を繋ぐ時の出発点 */
  if(src.playbackRate&&(opt.from||opt.glide||opt.back||opt.vib)){
    const pr=src.playbackRate;
    try{
      let cur=base, t=at;
      /* ══ よそから入る（グリスイン）══
         glide が「書かれた高さから離れてゆく」のに対し、
         こちらは「離れた高さから書かれた高さへ着地する」。
         **向きが逆なので、glide で代用してはいけない。**
         代用すると出発点と着地点が入れ替わり、さらに endMidi が
         書かれた高さからずれて、次の音を繋ぐ時の出発点まで狂う。 */
      if(opt.from){
        const fr=base*Math.pow(2,opt.from.semi/12);
        const d=Math.max(0.02,opt.from.dur);
        pr.setValueAtTime(fr,at);
        /* 滑って入るのだから、こちらも段で踏む（tab-6.23） */
        slidePitch(pr,fr,base,at,d,opt.str,(vol||0.2)*0.16);
        cur=base; t=at+d;
        /* 着地は書かれた高さそのもの。endRate / endMidi は動かさない */
      }
      if(opt.glide){
        const to=base*Math.pow(2,opt.glide.semi/12);
        const gd=Math.max(0.02,opt.glide.dur);
        pr.setValueAtTime(cur,at);
        /* ══ 滑りと張りを、ここで分ける（tab-6.23）══
           `step` が立っていれば滑り——フレットを跨ぐので段で踏む。
           立っていなければ張り——弦を曲げるので曲線で上がる。 */
        if(opt.glide.step) slidePitch(pr,cur,to,at,gd,opt.str,(vol||0.2)*0.18);
        else bendRamp(pr,cur,to,at,gd);
        cur=to; t=at+gd;
        endRate=to; endMidi=midi+opt.glide.semi;
      }
      if(opt.back){
        const to=base*Math.pow(2,opt.back.semi/12);
        const bt=Math.max(t,opt.back.at||t);
        /* 戻しも弦をゆるめる技。フレットは跨がないので曲線（tab-6.23） */
        pr.setValueAtTime(cur,bt);
        bendRamp(pr,cur,to,bt,Math.max(0.02,opt.back.dur));
        cur=to; endRate=to; endMidi=midi+opt.back.semi;
      }
      /* ══ ビブラートは、動き終わった先で揺らす（tab-1.45）══
         以前は `!opt.glide && !opt.back` ——**チョーキングやスライドが付いていると
         丸ごと飛ばしていた。** 記号は出るのに音が変わらない。
         だが実演では「上げ切った先で揺らす」のが常であり、
         チョーキング＋ビブラートはいちばん多い組み合わせである。

         揺らす起点は `cur`（いま落ち着いている高さ）、
         始める時刻は `t`（動き終わった時刻）。
         動きが無ければ `cur=base`／`t=at` のままなので、従来と同じ挙動になる。 */
      if(opt.vib){
        /* 付けた所から揺れ始める（tab-4.95。`wait` は音符の丈に対する割合から出した秒） */
        const t0=Math.max(at+0.08,t+0.02)+Math.max(0,opt.vib.wait||0);
        /* 揺れは音符の丈に収める（tab-1.47）。なめらかに、押した側へ（tab-4.31） */
        applyVib(pr,cur,t0,opt.vib.depth||0.25,opt.vib.rate||5.5,
                 (opt.vib.dur>0)?(at+opt.vib.dur-t0):null);
      }
    }catch(e){}
  }
  const secs=buf.length/AC.sampleRate;
  const bq=AC.createBiquadFilter(); bq.type='lowpass'; bq.Q.value=0.5;
  /* 立ち上がりだけ明るく、じきに落ち着く。掛けっぱなしでは「弦の音」の域を出ない */
  const c0=Math.min(tn.lp[2],f*tn.lp[0]+tn.lp[1]);
  const sp=tn.swp||[1,0];
  /* ══ 途中から鳴らす時は、立ち上がりの明るさも出さない ══
     頭の掃引は「いま弾いた」という合図そのもの。
     既に鳴っている弦を引き継ぐのだから、ここは落ち着いた側から始める */
  const skip=Math.max(0,Math.min(secs*0.85,opt.skip||0));
  if(sp[1]>0&&!skip&&bq.frequency.setValueAtTime){
    bq.frequency.setValueAtTime(Math.min(16000,c0*sp[0]),at);
    if(bq.frequency.exponentialRampToValueAtTime)
      bq.frequency.exponentialRampToValueAtTime(c0,at+sp[1]/1000);
  }else bq.frequency.value=c0;
  const g=AC.createGain();
  /* ══ 緩やかに入る ══
     音量を後から絞るのでは、既に生まれた波形の頭が漏れる。
     生まれる時点から立ち上げれば、そもそも頭が無い。 */
  const fin=Math.max(0,opt.fadeIn||0);
  if(fin>0){
    g.gain.setValueAtTime(0.0001,at);
    g.gain.linearRampToValueAtTime(Math.max(0.0001,vol),at+fin);
  }else{
    g.gain.setValueAtTime(Math.max(0.0001,vol),at);
  }
  if(cut>0){
    g.gain.setValueAtTime(Math.max(0.0001,vol),at+cut);
    g.gain.exponentialRampToValueAtTime(0.0001,at+cut+0.06);
  }
  src.connect(bq); bq.connect(g); g.connect(out);
  /* バッファの途中から鳴らす。**頭の雑音の塊を鳴らさない**ための要 */
  if(skip>0) src.start(at,skip); else src.start(at);
  src.stop(at+(secs-skip)+0.05);
  if(!opt.soft) pickHit(at,vol,tn,out);
  /* relAt … 落ち始める時刻／rel … 落ちきるまでの秒。消す時に「いまの大きさ」を出すのに要る */
  const v={g,vol,at,relAt:(cut>0?at+cut:null),rel:0.06,offAt:(cut>0?at+cut+0.06:at+(secs-skip)),
           src,pr:src.playbackRate||null,base:endRate,midi:endMidi,
           /* ══ 素の高さ（tab-3.90）══
              **押さえたフレットの高さ**であって、上げ切った先ではない。
              はじめ `endMidi` を入れたが、あれは**チョーキングで上がった後**の高さ——
              それを素と見なせば「張られている分」が常に 0 になり、
              ゆるめる処理が一度も走らなかった。
              `midi` は上げるたびに書き換わるが、こちらは押さえた高さのまま。 */
           midi0:((opt&&opt.midi0!=null)?opt.midi0:midi),
           str:(opt.str==null?-1:opt.str), vk:vkOf(opt.str==null?-1:opt.str),
           /* vol0 … 弾いた時の音量。レガートで繋ぐ時、ここまで戻す
              decT … バッファに焼き込まれた減衰の時定数（0.001 まで落ちる秒数） */
           /* 途中から鳴らした声は、既にその分だけ痩せている。
              残りの減衰時間で持たないと、繋ぎの押し戻しが過剰になる */
           /* ══ decT は「本当の T60」（tab-1.61）══
              以前は書き出した丈から逆に引いていた。丈を耳に届く所で切った以上、
              丈と減衰の速さは別物である。ここを取り違えると
              **繋いだ時の押し戻しが効きすぎる／効かなすぎる。** */
           vol0:vol, decT:Math.max(0.2,ksT60(f,tn)), bq, c0};
  v.vb=VK_BASE; VOICES.push(v); pruneVoices(at);
  if(opt.str!=null&&opt.str>=0){
    /* ══ 同じ弦を弾けば、前の音は止まる（tab-1.46）══
       実弦では当たり前のことだが、ここでは前の声を止めずに
       新しい声を重ねていた。**前の声に予約されていたビブラートやチョーキングが
       鳴り続け、次の音に掛かっているように聞こえる。**
       ビブラートの揺れは 14 回ぶん（毎秒6回なら1秒以上）先まで予約されるので、
       短い音符では必ず次へはみ出す。

       `skip` が立っているのは「鳴っている弦を途中から引き継ぐ」道で、
       そちらは既に自分で `hushVoice` を呼んでいる。二重に止めない。 */
    if(!opt.skip) hushVoice(opt.str,at,22);
    v.vk=vkOf(opt.str); LASTV.set(v.vk,v);
  }
  return v;
}
/* ══ 指が弦を打つ音 ══
   ハンマリング・プリングには、ピックとは別の「打つ・引っ掛ける」当たりがある。
   これが無いと、音量を揃えても輪郭がぼやけて小さく聞こえる。
   ピックより低く短い、鈍い一撃にする。 */
/* ══ 滑りは、フレットを跨いでゆく（tab-6.23）══
   L様——「スライドがベンドと同じに聞こえる」。

   聞こえるはずである。**どちらも同じ直線で音程を移していた。**
   違いは掛ける時間だけ（滑り 音価の45%／張り 35%）で、
   曲線の形も、途中の刻みも、色も同じであった。

   実物では別の出来事である。
     滑り … 指がフレットを跨ぐ。途中の音が半音ずつ**実際に鳴る**
     張り … 弦を押し曲げる。フレットは跨がず、連続して上がる

   ゆえに滑りは**段**で動かす。5F から 9F へなら 6・7・8 を踏む。
   段の中では音程を動かさず、フレットを越える所だけ短く渡る——
   指は瞬間移動しないが、越える時間は数ミリ秒でしかない。

   段が細かすぎて刻みに聞こえない時（ごく短い滑り、遠いフレット）は、
   何フレットかまとめて踏む。**踏めない段は、踏まない。** */
const STEP_MIN=0.016;     /* 一段に要る最短の時間。割るなら段を間引く */
const STEP_CROSS=0.004;   /* フレットを越えるのに掛ける時間 */
/* ══ 段の速さは、指が決める（tab-6.24）══
   L様——「スライドのリズムが狂って聞こえる」。

   滑りに掛ける時間は「音価の45%（最大0.20秒）」であった。これは
   **なめらかに移す**前提で決めた値で、段を踏む今は長すぎる——
   ♩=120 の4分音符で4フレット滑ると一段 0.050秒、すなわち32分音符。
   途中の半音が一つひとつ独立した音に聞こえ、滑りではなく
   **クロマチックの速弾き**になっていた。

   実物の指は4フレットを 60〜100ms で渡る。一段はおよそ 20ms。

   > **滑る速さは、音価ではなく指が決める。**
   音価から出した時間は**上限**として残す——長い音符で間延びさせないため。 */
const STEP_TIME=0.020;    /* 一フレット渡るのに掛かる時間 */
function stepPlan(from,to,maxDur){
  const semi=Math.round(12*Math.log(to/from)/Math.LN2);
  const n=Math.abs(semi);
  /* 半音一つ、または段を踏む間が無いなら、これまで通り直線で */
  if(n<2||maxDur<STEP_MIN*2) return {steps:0,stride:1,semi:semi,dur:maxDur};
  const dur=Math.min(maxDur,Math.max(STEP_MIN*2,n*STEP_TIME));
  let stride=1;
  while(stride<n&&dur/Math.ceil(n/stride)<STEP_MIN) stride++;
  return {steps:Math.max(1,Math.ceil(n/stride)),stride:stride,semi:semi,dur:dur};
}
function stepPitch(pr,from,at,plan){
  if(!plan.steps){
    pr.linearRampToValueAtTime(from*Math.pow(2,plan.semi/12),at+plan.dur);
    return 0;
  }
  const n=Math.abs(plan.semi), sgn=(plan.semi<0)?-1:1, span=plan.dur/plan.steps;
  let prev=from;
  for(let k=1;k<=plan.steps;k++){
    const sm=(k===plan.steps)?plan.semi:(sgn*Math.min(n,k*plan.stride));
    const y=from*Math.pow(2,sm/12);
    const edge=at+span*k;
    pr.setValueAtTime(prev,Math.max(at,edge-STEP_CROSS));  /* 段の中は動かさない */
    pr.linearRampToValueAtTime(y,edge);                    /* 越える所だけ渡る */
    prev=y;
  }
  return plan.steps;
}
/* 計画から実行まで一息で。着地の頃合いを動かさない道（抜け・グリスイン） */
function slidePitch(pr,from,to,at,maxDur,str,vol){
  const plan=stepPlan(from,to,maxDur);
  stepPitch(pr,from,at,plan);
  scrapeSteps(at,plan.dur,plan.steps,str,vol);
  return plan;
}
/* ══ フレットを越える擦れ（tab-6.23）══
   巻き弦（6・5・4弦）は溝が深く、越えるたびにはっきり擦れる。
   プレーン弦（3・2・1弦）は滑らかなので控えめに。
   弦は鳴り続けているので、ここで足すのは**擦過そのもの**だけである。 */
function fretScrape(at,str,vol){
  if(!AC||!(vol>0)) return;
  const sr=AC.sampleRate, dur=0.016, len=Math.max(8,Math.round(sr*dur));
  const buf=AC.createBuffer(1,len,sr), o=buf.getChannelData(0);
  for(let i=0;i<len;i++){ const e=1-i/len; o[i]=(Math.random()*2-1)*e*e; }
  const src=AC.createBufferSource(); src.buffer=buf;
  const hp=AC.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=1800;
  const bp=AC.createBiquadFilter(); bp.type='bandpass';
  /* 巻き弦は低め（溝の鳴り）、プレーン弦は高め（表面のこすれ） */
  const wound=(typeof str==='number'&&str<=2);
  bp.frequency.value=wound?3200:5200; bp.Q.value=0.9;
  const g=AC.createGain(); g.gain.value=Math.max(0.0001,vol*(wound?1:0.45));
  src.connect(hp); hp.connect(bp); bp.connect(g); g.connect(guitarBus()||MASTER);
  src.start(at); src.stop(at+dur+0.02);
}
/* 段のそれぞれに擦れを添える。段そのものは `stepPitch` が刻む */
function scrapeSteps(at,dur,steps,str,vol){
  if(!(steps>1)) return;
  /* 段が多いほど一粒は控える。同じ大きさで並べると鈴を振ったように鳴る */
  const each=vol/Math.sqrt(steps), span=dur/steps;
  for(let k=1;k<=steps;k++) fretScrape(at+span*k,str,each);
}
/* ══ 張りは、曲線で上がる（tab-6.23）══
   直線は機械の動きである。指は張力に逆らって押すので、
   **出だしはためらい、途中で伸び、着地でゆるむ。**
   滑りを段にした以上、こちらも直線のままでは片手落ちになる。 */
function bendRamp(pr,from,to,at,dur){
  const N=7;
  for(let k=1;k<=N;k++){
    const u=k/N, e=u*u*(3-2*u);          /* なめらかな S 字 */
    pr.linearRampToValueAtTime(from+(to-from)*e,at+dur*u);
  }
}
function fingerHit(at,vol,pull){
  if(!AC) return;
  const sr=AC.sampleRate, dur=0.022, len=Math.max(8,Math.round(sr*dur));
  const buf=AC.createBuffer(1,len,sr), o=buf.getChannelData(0);
  for(let i=0;i<len;i++){ const e=1-i/len; o[i]=(Math.random()*2-1)*e*e*e; }
  const src=AC.createBufferSource(); src.buffer=buf;
  const bq=AC.createBiquadFilter(); bq.type='bandpass';
  bq.frequency.value=pull?900:600; bq.Q.value=0.8;
  const g=AC.createGain(); g.gain.value=Math.max(0.0001,vol);
  src.connect(bq); bq.connect(g); g.connect(guitarBus()||MASTER);
  src.start(at); src.stop(at+dur+0.02);
}

/* ══ 弾き直さずに音程を変える ══
   ハンマリング・プリング・スライドの本体。
   前の音がまだ鳴っていれば、その遅延線の再生速度だけを動かす。
   鳴っていなければ false を返し、呼び出し側でふつうに弾き直す。 */
/* その弦の鳴っている音だけを静かに引く。
   dampVoices は全弦を止めるので、抜けには使えない */
/* その弦以外の余韻をすぼめる（tab-2.72）。
   `hold` の立った声（let ring・伸ばしている最中のタイ）には手を触れない */
function hushOthers(str,at,ms){
  /* 消すのは同じパートの弦だけ（tab-6.37）。鍵はパートごとに幅を取ってある */
  LASTV.forEach((v,k)=>{
    if(k==null||k<VK_BASE||k>=VK_BASE+VK_SPAN) return;
    if(k===vkOf(str)) return;
    if(v&&v.hold) return;
    hushVoice(k-VK_BASE,at,ms||45);
  });
}
function hushVoice(str,at,ms){
  const v=LASTV.get(vkOf(str));
  if(!v||!v.g||v.offAt<=at) return false;
  const f=(ms||60)/1000;
  try{
    const g=v.g.gain, lv=Math.max(0.0001,voiceLevelAt(v,at));
    g.cancelScheduledValues(at);
    g.setValueAtTime(lv,at);
    g.exponentialRampToValueAtTime(0.0001,at+f);
  }catch(e){ return false; }
  v.offAt=Math.min(v.offAt,at+f);
  return true;
}

/* ══════════════════════════════════════════
   抜けてゆく（グリスアウト）

   ══ 音量を戻すだけでは足りない ══
   はじめ、鳴っている音の高さを動かし、痩せた分をゲインで押し戻していた。
   数値の上では弾いた瞬間の大きさに戻る。それでも**痩せて聞こえる**。

   Karplus-Strong は**高域の減衰も波形に焼き込まれている**からである。
   音価の半ばでは倍音が既に失われており、音量を戻しても倍音は戻らない。
   ゲインで戻せるのは大きさだけで、中身は戻らない。

   ══ ゆえに弾き直す ══
   実物も、指が弦を擦って滑る時には新たに音が立っている。
   摩擦そのものが弦を励起するからで、これは誤魔化しではなく、そういう物である。
   新しい声は倍音を持って生まれるので、痩せない。
   ただしピックの当たりは出さない（右手は弾いていない）。
   ══════════════════════════════════════════ */
function slideOut(s,t,str,midi,t0,dur,vol){
  if(!t||!t.slOut||typeof midi!=='number') return false;
  /* 抜け出す所は譜面が持つ（tab-4.84。既定は丈の 55%） */
  const _f=(typeof t.slOutAt==='number')?Math.max(0.05,Math.min(0.95,t.slOutAt)):0.55;
  const wait=Math.max(0.05,dur*_f);
  const d=Math.min(0.30,Math.max(0.13,dur*0.45));
  const at=t0+wait;
  const XF=0.022;                       /* 入れ替わりに掛ける時間 */

  /* ══ 元の声が「いま居る場所」を引き継ぐ ══
     同じバッファの同じ地点から鳴らせば、波形の状態も音量も倍音も一致する。
     頭から鳴らすから発音に聞こえるのであって、途中から拾えば発音は起きない。
     残るのは位相の食い違いだけで、それは短い入れ替わりで均せる。 */
  const v=LASTV.get(vkOf(str));
  const el=(v&&v.at!=null)?Math.max(0,at-v.at):0;
  const lv=v?Math.max(0.0001,voiceLevelAt(v,at)):vol;
  /* ══ 抜けは「いま鳴っている高さ」から始める（tab-1.65）══
     以前は**譜面に書かれた高さ**から始めていた。だがこの弦は、
     チョーキングで上がっていたり、プリベンドで最初から上がっていたりする。
     そこへ書かれた高さの声を立てると、受け渡しの瞬間に**音程が飛ぶ**——
     耳には「もう一つ別の音が出た」と聞こえる。
     実測（1音チョーキング＋グリスアウト）で **2半音跳ねていた。**
     `holdTab` は `n.midi+semi` と自分で足していたが、`strumTab` は足していない。
     **足す場所を呼ぶ側に置いたのが誤り。**ここで声に聞けば一箇所で済む。 */
  const from=(v&&typeof v.midi==='number')?v.midi:midi;

  /* 古い声を落としながら、新しい声を同じだけ持ち上げる。
     どちらかが先に立つと、そこが継ぎ目として聞こえる */
  hushVoice(str,at,XF*1000);
  pluck(at,from,lv,d*0.78,
        {str:str,soft:true,skip:el,fadeIn:XF,
         glide:{semi:(t.slOut==='up'?7:-7),dur:d,step:true}});
  /* 擦れる音は入れない。弦は鳴り続けており、ここで新たに立つ音は無い */
  return true;
}

/* ══ 抜けてゆく（グリスアウト）══
   鳴っている音を、そのまま滑らせて消す。弾き直さない。

   `glideVoice` は使えない。あれは繋ぐための仕掛けで、
   焼き込まれた減衰を**押し戻して音量を揃える**。
   抜けは逆に、滑りながら痩せてゆく音である。押し戻しては別物になる。 */
function glideOut(str,at,semi,dur){
  const v=LASTV.get(vkOf(str));
  if(!v||!v.pr||v.offAt<=at+0.01) return false;
  const to=v.base*Math.pow(2,semi/12);
  try{
    v.pr.cancelScheduledValues(at);
    v.pr.setValueAtTime(v.base,at);
    /* 抜けも滑りである。フレットを跨いで落ちてゆく（tab-6.23） */
    slidePitch(v.pr,v.base,to,at,dur,str,(v.vol0||v.vol||0.2)*0.16);
  }catch(e){ return false; }
  /* ══ 焼き込まれた減衰を押し戻してから消す ══
     Karplus-Strong のバッファは、減衰が波形そのものに焼き込まれている。
     抜けが始まる音価の半ばでは、音量は既に三分の一以下まで落ちている。
     そこから更に消してゆけば、**予約は入っているのに耳には届かない**。
     実物は指がまだ弦を押さえて滑らせているのだから、ここで鳴っていなければ嘘になる。

     バッファは decT 秒で 0.001 まで落ちるので、経過 τ に対して
     1000^(τ/decT) を掛ければ弾いた瞬間の大きさへ戻る。
     繋ぎ（glideVoice）と違って弾き直しではないので、上乗せはしない。 */
  try{
    const g=v.g.gain;
    const el=Math.max(0,at-v.at);
    const comp=Math.min(10,Math.pow(1000,el/Math.max(0.2,v.decT||1)));
    const lv=Math.min(2.2,Math.max(0.0001,voiceLevelAt(v,at))*comp);
    g.cancelScheduledValues(at);
    g.setValueAtTime(lv,at);
    /* 滑り切るまでは張って、そこから落とす。
       滑りながら痩せきると、どこへ抜けたのか分からなくなる */
    g.setValueAtTime(lv*0.85,at+dur*0.6);
    g.exponentialRampToValueAtTime(0.0001,at+dur*1.35);
  }catch(e){}
  /* 滑って消えた音を、次の繋ぎの出発点にしない */
  v.offAt=Math.min(v.offAt,at+dur*1.35);
  LASTV.delete(vkOf(str));
  return true;
}
/* ══ 揺れは「なめらかに」「押した側へ」（tab-4.31）══
   L様——「ビブラートのワイドがめっちゃ音痴に聞こえる」。

   仰るとおりであった。二つ、間違っていた。

   ① **矩形波だった。** `setValueAtTime` で ±深さへ**跳ばして**半周期
      留めていたので、揺れではなく**二つの音の往復**になっていた。
      浅いうちは目立たないが、広くすると「別の音痴な音が混ざる」。
   ② **上下対称だった。** 弦を押して揺らす技であるから、実際の音程は
      **書かれた高さから上へ**動いて戻る。上下に振ると、鳴っている時間の
      半分が**書かれた音より低い**——これが音痴の正体である。

   > **弦は押されて上がる。下がりはしない。**

   なめらかな三角波にし、片側（上）へ振る。始めの一往復は浅くして、
   **弾いた瞬間から全開で揺れない**ようにする（実際の手もそう動く）。
   `to` は中心の高さ（比）、`dep` は片側の振れ幅（半音）。 */
/* ══ 揼んで、戻して、休む（tab-4.54）══
   L様——「ビブラートがもとの音程に戻ってないように聞こえる」
   「ギター的にしてほしい。普通正しい音から上に上げてもとの音程に戻るだけ」。

   揺れそのものは、終われば必ず書いた高さへ戻っていた。
   戻っていなかったのは**鳴っている最中の平均**である。

   tab-4.31 の三角波は、上げるのと戻すのに**半々の時間**を使っていた。
   ゆえに平均の高さが**幅の半分**だけ上がる——1音なら +100セント。
   耳は揺れる音の高さを平均で聞き取るので、まるまる半音高い音に聞こえる。
   しかも折り返し（頂点）で動きが最も遅くなるので、
   **頂点の音もひとつの音として居座ってしまう。**

   直しの筋は、下げることではない——**手の動きそのものを写す**ことである。
   弦を押す手は、すばやく押し上げて、すばやく戻し、
   **元の位置でひと息休む。** 頂点には留まらない。

   > **下げない。代わりに、帰ってきて休む。**

   一往復を三つに分ける——**押し上げ／戻し／休み。**
   休みの長さは幅に応じて伸びる（広く押すほど、手は戻って一息入れる）。
   これで**書いた高さが毎周、耳に戻ってくる**。平均の上がりは——
     クォーター +25セント → +13セント
     半音       +50セント → +23セント
     1音       +100セント → +39セント
   底は書いた高さそのものであり、**一度も下へは出ない**。

   さらに、幅と周期にほんの少しゆらぎを与える。
   寸分違わぬ往復は機械の揺れであって、人の手の揺れではない。
   終わりの一往復は幅を細めて着地させる（手もそのように止まる）。
   余った時間は素の高さで休むので、音符の終わりは必ず書いた高さである。 */
const VIB_PUSH=[[0.45,0.16],[0.78,0.60],[1.00,1.00]];   /* 押し上げ　（区間の割合, 幅の割合） */
const VIB_REL =[[0.28,0.58],[0.60,0.20],[1.00,0.00]];   /* 戻し　　　頂点には留まらない */
function applyVib(pr,to,vt0,dep,rate,room){
  const per0=1/Math.max(1.5,rate||5.5);          /* 一往復の秒数 */
  const d=Math.max(0,dep||0);
  const rest=Math.min(0.46,0.24+0.11*d);         /* 広いほど、元の位置で長く休む */
  const pushF=(1-rest)*0.55, relF=(1-rest)*0.45; /* 戻しは押しよりもやや早い */
  const up=a=>to*Math.pow(2,(d*a)/12);
  const nC=Math.max(1,Math.min(64,(room!=null&&room>0)?Math.floor(room/per0):12));
  pr.setValueAtTime(to,vt0);
  let t=vt0+per0*0.18;                           /* 弾いた高さをひと息聞かせてから */
  pr.setValueAtTime(to,t);
  for(let c=0;c<nC;c++){
    const per=per0*(0.94+Math.random()*0.12);
    const grow=(c===0)?0.38:((c===1)?0.72:1);    /* 弾いた瞬間から全開では揺れない */
    const fade=(nC>=3&&c===nC-1)?0.55:1;         /* 終わりは細めて着地 */
    const a=Math.max(0,Math.min(1,grow*fade*(0.93+Math.random()*0.14)));
    VIB_PUSH.forEach(([f,lv])=>pr.linearRampToValueAtTime(up(a*lv),t+per*pushF*f));
    VIB_REL .forEach(([f,lv])=>pr.linearRampToValueAtTime(up(a*lv),t+per*(pushF+relF*f)));
    t+=per;
    pr.setValueAtTime(to,t);                     /* 休み。次の押し上げはここから始まる */
  }
  return t;
}
function bendVoice(str,at,semi,dur,vib){
  const v=LASTV.get(vkOf(str));
  if(!v||!v.pr||v.offAt<=at+0.005||v.at>at+0.001) return false;
  const to=v.base*Math.pow(2,semi/12);
  try{
    v.pr.cancelScheduledValues(at);
    v.pr.setValueAtTime(v.base,at);
    const rise=semi?Math.max(0.03,dur):0;
    /* 弦を曲げる技。直線ではなく曲線で上げる（tab-6.23） */
    if(semi) bendRamp(v.pr,v.base,to,at,rise);
    if(vib){
      /* 上げ切った先で揺らす。丈に収め、終わりは中心へ戻す（tab-1.47 と同じ筋） */
      const vt0=at+rise+0.02;
      applyVib(v.pr,to,vt0,vib.depth||0.25,vib.rate||5.5,
               (vib.dur>0)?(at+vib.dur-vt0):null);
    }
  }catch(e){ return false; }
  /* 落ち着いた高さを控え直す。次の音を繋ぐ時（チョークダウン等）の出発点になる */
  v.midi=v.midi+semi; v.base=to;
  return true;
}

/* ══ 押し戻せる大きさの上限（tab-1.60）══
   Karplus-Strong のバッファは減衰が波形に焼き込まれているので、
   繋ぐ時は経過ぶんを掛けて押し戻す。だが**上限がある**——
   持ち上げすぎると雑音まで浮くため、14倍で頭を打たせている。
   この一つの数を、**押し戻す所と、諦める所の両方で使う。**
   別々に持つと、いつか食い違う（寸法を決める場所は一つ）。 */
const LEG_COMP_MAX=14;
/* ══ 押し戻せる大きさの、もう一つの頭（tab-1.63）══
   押し戻した先の音量にも頭がある（3.0）。**関門はこちらが先に効く。**
   弾いた時の音量 0.3・繋ぎの上乗せ 1.5 なら、6.7倍で頭を打つ——
   つまり `LEG_COMP_MAX`（14倍）は**そもそも届かない**。
   二つの頭を別々に持ち、諦める判断が片方しか見ていなかったのが tab-1.60 の穴である。 */
const LEG_GAIN_CEIL=3.0;
/* どれだけ足りなくても繋ぐか。1.5＝約3.5dB の不足まで許す */
const LEG_SHORT_OK=1.5;

function glideVoice(str,at,midi,opt){
  const v=LASTV.get(vkOf(str));
  if(!v||!v.pr||v.offAt<=at+0.005||v.at>at+0.001) return false;
  /* 折り返しの断ちを挟む場合は繋がない（周をまたいで滑ってしまう） */
  if(H.tp()&&H.tp().damps&&H.tp().damps.some(dt=>dt>v.at&&dt<=at+0.001)) return false;
  /* ══ 押し戻して届くか（tab-1.60 → tab-1.63 で作り直し）══
     関門はもともと `offAt`——**バッファが尽きるまで**——だけであった。
     バッファは decT 秒で 0.001 まで落ちるので、その手前でも
     とうに聞こえなくなっている。**予約は入るのに耳には届かない。**
     `glideVoice` が真を返すので、呼び出し側は弾き直しに回らず、
     **繋げたつもりで、何も起きていない**という一番厄介な形になる。

     ── tab-1.60 では足りなかった ──
     あの時は `LEG_COMP_MAX`（押し戻す倍率の頭）だけを見て諦める所を決めた。
     だが**先に効く頭は音量の側（3.0）**である。しかも押し戻しは
     `Math.max(lv,target)`——**下げない**——と書いてあるので、
     繋ぎを続けて既に頭を打っていると、次の繋ぎは**何も上げない。**

     波形を組み立てて測って分かったこと（第6小節・3弦）——
       17.7秒 ハンマリング … 前が 1.10 だったので 3.0 まで上がる（+8dB）
       18.4秒 プリング   … 既に 3.0。**上げ幅ゼロ。** 弦は落ち続けるだけ
     **繋ぎを重ねた二つ目以降が、黙って何も起こさなくなる。**

     ゆえに「要る大きさ」と「出せる大きさ」を**両方の頭から**出して比べる。
     届かないなら false を返し、呼び出し側に柔らかく弾かせる。
     実弦でも、鳴っている弦を叩けば**そこで新しい音が立つ**——
     指が弦を打つこと自体が弦を励起するからで、グリスアウトで
     「摩擦そのものが弦を励起する」として弾き直したのと同じ理屈である。 */
  {
    const _el=Math.max(0,at-v.at), _v0=(v.vol0||v.vol);
    const _lift=(opt&&opt.slide)?1.25:1.5;
    const _need=_v0*Math.pow(1000,_el/Math.max(0.2,v.decT))*_lift;   /* 元の大きさへ戻すのに要る */
    const _can=Math.min(LEG_GAIN_CEIL,_v0*LEG_COMP_MAX*_lift);       /* 二つの頭のうち低い方 */
    /* ══ 戻しは、弦を励起しない技である（tab-6.05）══
       L様——「そもそもループとか関係なく音がダウンになってない」。

       DARK 11小節目（♩=71・全音チョーキングを付点四分ぶん伸ばして戻す）を
       鳴らして音程の予約を数えたところ——
         経過 1.30秒／素の大きさ 0.255／減衰の時定数 3.22秒
         → 押し戻すのに要る 5.19、出せるのは 3.00（`LEG_GAIN_CEIL`）
       ゆえにこの関門が閉じ、戻しは**弾き直しへ落ちていた。**
       耳には「素の 15F が弾き直され、下がらない」と聞こえる。
       1小節目が鳴っていたのは伸ばしが 1.33拍と**わずかに短い**からで、
       同じ書き方でも音価一つで裏返る——ゆえに「明らかに違う」。

       ここで諦めるのは、繋ぎが**弦を弾き直せば取り返せる**技（h・p・s）
       だからである。指が弦を打てば、そこで新しい音が立つ。
       だが**戻し（`bd`）は違う。** 張った弦をゆるめるだけで、
       右手はどこにも触れない——**弾き直しは、譜面に無い音を足すことである。**
       痩せていようと、鳴っている弦の高さを下ろすほかない。

       > **取り返せる技だけが、諦めてよい。** */
    if(_can<_need/LEG_SHORT_OK&&!(opt&&opt.keep)) return false;
  }
  const to=v.base*Math.pow(2,(midi-v.midi)/12);
  try{
    /* ハンマリング・プリングは即座に、スライドは少し掛けて移る */
    /* 下限は 0.02（tab-2.65 で 0.05→0.03、tab-2.66 でさらに下げた）。
       〈ごく短い〉装飾音符が 0.028 を頼むので、上で止めると設定が効かない。
       頼まれない限り届かない値なので、ふつうのスライドの手触りは変わらない */
    /* 叩いてあるなら滑らせない（tab-4.49）。呼ぶ側が丈を短く渡してくる */
    const d=(opt&&opt.slide)?Math.max(0.015,Math.min(0.20,opt.dur||0.12)):0.018;
    /* ══ 滑りは段、叩きは一息（tab-6.23）══
       ハンマリング・プリングはフレットを跨がない（押さえ替えるだけ）ので
       これまで通り一息で移る。滑りだけが段を踏む。 */
    if(opt&&opt.slide){
      /* ══ 着地は、拍の上（tab-6.24）══
         これまでは**着地する音符の時刻から滑り始めて**いた。
         ゆえに目的のフレットへ届くのは拍の後——音価の45%ぶん遅れる。

         実演は逆である。前の音を弾いて押さえたまま、**拍の手前で滑り、
         拍の上で着地する。** 届いてから拍が来るのではない。

         > **滑りは拍へ向かう動きであって、拍から始まる動きではない。**

         ただし手前へ戻せる範囲には限りがある——
           ・前の音が鳴り始める前へは戻れない（まだ何も鳴っていない）
           ・いま鳴っている時刻より前へは戻れない（過ぎた時刻は予約できない）
         戻せないぶんは、これまで通り拍から滑り出す。 */
      const plan=stepPlan(v.base,to,d);
      const floor=Math.max((v.at!=null?v.at:0)+0.012,
                           (AC?AC.currentTime:0)+0.004);
      const t0s=Math.max(Math.min(at,floor),at-plan.dur);
      v.pr.cancelScheduledValues(t0s);
      v.pr.setValueAtTime(v.base,t0s);
      stepPitch(v.pr,v.base,t0s,plan);
      scrapeSteps(t0s,plan.dur,plan.steps,str,(v.vol0||0.2)*0.20);
    }else{
      v.pr.cancelScheduledValues(at);
      v.pr.setValueAtTime(v.base,at);
      v.pr.linearRampToValueAtTime(to,at+d);
    }
    if(opt&&opt.vib){
      /* 繋いだ先の揺れも、丈に収めて中心で締める（tab-1.47。上の pluck と同じ筋） */
      const vt0=at+d+0.05+Math.max(0,opt.vib.wait||0);   /* 付けた所から（tab-4.95） */
      applyVib(v.pr,to,vt0,opt.vib.depth||0.25,opt.vib.rate||5.5,
               (opt.vib.dur>0)?(at+opt.vib.dur-vt0):null);
    }
  }catch(e){ return false; }
  /* ══ 音量を落とさない ══
     Karplus-Strong のバッファは、減衰が波形そのものに焼き込まれている。
     ゲインを元に戻すだけでは、既に痩せた波形を素の音量で鳴らすことになり、
     ハンマリングの先が尻すぼみに聞こえる。
     **減った分をこちらで計算して押し戻す。**
     バッファは decT 秒で 0.001 まで落ちるので、経過 τ に対して
     1000^(τ/decT) を掛ければ、弾いた瞬間と同じ音量に戻る。
     持ち上げすぎると雑音まで浮くので、上限を設ける。 */
  const el=Math.max(0,at-v.at);
  /* ══ 焼き込まれた減衰を押し戻す ══
     バッファは decT 秒で 0.001 まで落ちるので、1000^(τ/decT) を掛ければ
     弾いた瞬間と同じ大きさに戻る。上限は雑音が浮かない範囲で広めに取る。
     さらに LEG_LIFT ぶん足す。**音そのものの大きさが揃っても、
     鳴り続けている音は頭の当たりが無いぶん小さく聞こえる**ため。 */
  /* ══ プリングは弦を弾いている（tab-1.64）══
     ハンマリングは弦を「打つ」だけだが、プリングは指で弦を**引っ掛けて放す**。
     実弦では、こちらの方が明らかに音が立つ。以前は同じ扱いだったので、
     長く伸ばした先のプリングが、音程だけ動いて articulation が立たなかった。 */
  const LEG_LIFT=(opt&&opt.slide)?1.25:((opt&&opt.pull)?1.85:1.5);
  const comp=Math.min(LEG_COMP_MAX,Math.pow(1000,el/v.decT));
  const target=Math.min(LEG_GAIN_CEIL,(v.vol0||v.vol)*comp*LEG_LIFT);
  try{
    const lv=voiceLevelAt(v,at);
    v.g.gain.cancelScheduledValues(at);
    v.g.gain.setValueAtTime(Math.max(0.0001,lv),at);
    /* 立ち上がりは短く。長いと「膨らむ」音になって不自然 */
    v.g.gain.linearRampToValueAtTime(Math.max(lv,target),at+0.008);
  }catch(e){}
  /* ══ 明るさを戻す ══
     時間が経った弦は倍音が落ちている。音量だけ上げると、こもった音が
     大きくなるだけで「近づいて」こない。頭だけ開けて、すぐ戻す。 */
  try{
    if(v.bq&&v.c0&&v.bq.frequency.setValueAtTime){
      v.bq.frequency.cancelScheduledValues(at);
      v.bq.frequency.setValueAtTime(Math.min(15000,v.c0*2.2),at);
      if(v.bq.frequency.exponentialRampToValueAtTime)
        v.bq.frequency.exponentialRampToValueAtTime(v.c0,at+0.16);
    }
  }catch(e){}
  /* 指が弦を打つ／引っ掛ける当たり。スライドには当たりが無いので出さない */
  if(!(opt&&(opt.slide||opt.noHit))) fingerHit(at,Math.min(0.16,(v.vol0||0.2)*0.5),(opt&&opt.pull));
  v.midi=midi; v.base=to;
  /* ══ 滑って移った先が、新しい素の高さ（tab-3.90）══
     スライドやハンマリングで音程が移ったなら、そこが押さえた高さ。
     **チョーキングで上げた分とは別物**なので、素の高さも書き換える。

     ══ ただし、張ったまま移ったなら張りは残る（tab-4.36）══
     着地の高さで丸ごと書き換えていたので、**繋いだ先で張りが忘れられて**
     いた。`12F(1音) ─h→ 17F(T) ─s→ 19F` の三つめが、
     素の 19F へ落ちて鳴っていた——左手はまだ張ったままなのに、である。
     > **書き換えるのは押さえた高さだけ。張りは張りとして持ち越す。**
     呼ぶ側が渡した張り（`opt.held`）を差し引いて素の高さを出す。 */
  v.midi0=midi-Math.max(0,(opt&&opt.held)||0);
  v.relAt=null; v.rel=0.06;            /* 戻した音量を、いまの音量として扱い直す */
  v.vol=target;
  return true;
}

/* ブラシ／ミュート：ピッチのない擦過音 */
/* ══ 擦過音（tab-2.42 で中身を選べるようにした）══
   `o.freq` … 帯域の中心。低いほど「弦を撫でた」太い音になる
   `o.q`    … 締まり。`o.dur` … 丈
   既定は左手のミュート（×）や空振りの当たり——短く、軽く、高い。 */
function scrape(at,vol,up,o){
  if(!AC) return;
  o=o||{};
  const D=Math.max(0.04,o.dur||0.13);
  const sr=AC.sampleRate, len=Math.round(sr*D);
  const buf=AC.createBuffer(1,len,sr), b=buf.getChannelData(0);
  /* ══ 中身の丈（tab-2.45）══
     既定は当たりの音なので、頭から落ちてゆく（e²）。
     `o.hold` を渡すと、その割合まで**大きさを保ってから**落ちる。
     拾いは「撫でて渡っている間ずっと鳴る」音なので、頭で落ちては届かない。 */
  const hold=Math.max(0,Math.min(0.9,o.hold||0));
  for(let i=0;i<len;i++){
    const u=i/len;
    const e=(u<hold)?1:(1-(u-hold)/(1-hold));
    b[i]=(Math.random()*2-1)*e*e;
  }
  const src=AC.createBufferSource(); src.buffer=buf;
  /* ══ 帯を絞りすぎない（tab-2.45）══
     狭い帯域通過は**通る成分そのものを削る。** 音量の数値を上げても届かない
     ——「全然小さい」の正体がこれであった。
     拾いのように**音量が要る音**は、低い側と高い側を切るだけに留める。 */
  const g=AC.createGain();
  let head, tail;
  if(o.wide){
    const hp=AC.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=o.hp||180;
    const lp=AC.createBiquadFilter(); lp.type='lowpass';  lp.frequency.value=o.lp||2800;
    hp.connect(lp); head=hp; tail=lp;
  } else {
    const bq=AC.createBiquadFilter(); bq.type='bandpass';
    bq.frequency.value=o.freq||(up?2600:1700); bq.Q.value=o.q||0.9;
    head=bq; tail=bq;
  }
  g.gain.setValueAtTime(vol,at);
  g.gain.exponentialRampToValueAtTime(0.0001,at+D);
  src.connect(head); tail.connect(g); g.connect(guitarBus()||MASTER);  /* 擦過音も胴を通す */
  src.start(at); src.stop(at+D+0.03);
}

/* ══ ピックスクラッチの音（tab-2.26）══
   `scrape` は一瞬の擦れ（ミュートやレイキングの当たり）である。
   ピックスクラッチは**音価いっぱい擦り続ける**技なので、別に持つ。

   要るものは三つ。
     ① 溝を渡る当たり … 一様な雑音では「砂」にしか聞こえない。
        巻き弦の溝の間隔ぶんで山谷を刻む。
     ② 音程の移り … 下降はネックへ向かうので明るさが落ち、上昇はその逆。
        帯域の中心を掃かせて示す。**ここが向きの正体**である。
     ③ 尻すぼみにしない … 擦っている間じゅう鳴るので、
        終わり際まで大きさを保ち、最後だけ落とす。 */
function pickScratch(at,dur,up,accent){
  if(!AC) return;
  const D=Math.min(2.4,Math.max(0.09,dur));
  const sr=AC.sampleRate, len=Math.max(128,Math.round(sr*D));
  const buf=AC.createBuffer(1,len,sr), o=buf.getChannelData(0);

  /* ══ 溝を渡る当たりが「高さ」を作る（tab-2.38）══
     はじめは一定の間隔で雑音を刻んでいた。**間隔が変わらなければ高さも変わらない**——
     ゆえに「ジーッ」ではなく、ただの砂音に聞こえていた。
     ピックスクラッチの正体は**当たりの連なりそのもの**であって、
     帯域を掃いた雑音ではない。当たりの間隔を滑らせれば、高さが滑る。 */
  const f0=up?240:1200, f1=up?1200:240;      /* 当たりの毎秒回数 */
  const dec=Math.exp(-1/(sr*0.0007));        /* 一つの当たりの余韻（0.7ms） */
  let ph=0, imp=0;
  for(let i=0;i<len;i++){
    const u=i/len;
    ph+=(f0*Math.pow(f1/f0,u))/sr;
    if(ph>=1){ ph-=1; imp=0.8+Math.random()*0.4; }   /* 溝を一つ越えた */
    /* 当たりの列＋擦れの地の音。地だけでは砂、当たりだけでは電子音になる */
    o[i]=imp*0.72+(Math.random()*2-1)*0.20;
    imp*=dec;
  }

  const src=AC.createBufferSource(); src.buffer=buf;
  /* 巻き線の金属らしさ。掃くのは当たりの高さに従わせる */
  const bp=AC.createBiquadFilter(); bp.type='bandpass'; bp.Q.value=1.5;
  bp.frequency.setValueAtTime(up?900:2800,at);
  bp.frequency.exponentialRampToValueAtTime(up?2800:900,at+D);
  const pk=AC.createBiquadFilter(); pk.type='peaking';
  pk.frequency.value=1800; pk.Q.value=1.1; pk.gain.value=6;
  const hp=AC.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=260;

  const g=AC.createGain();
  const vol=accent?0.34:0.26;
  const ar=Math.min(0.018,D*0.2);
  g.gain.setValueAtTime(0.0002,at);
  g.gain.exponentialRampToValueAtTime(vol,at+ar);
  g.gain.setValueAtTime(vol,at+Math.max(ar,D*0.80));
  g.gain.exponentialRampToValueAtTime(0.0001,at+D);

  src.connect(bp); bp.connect(pk); pk.connect(hp); hp.connect(g);
  g.connect(guitarBus()||MASTER);
  src.start(at); src.stop(at+D+0.03);
}

const API={
  version:'1.0',
  host(h){ Object.assign(H,h||{}); },
  attach(ac,master){ AC=ac; MASTER=master; },
  TONES,
  TONE_DEF,
  BODY_DEF,
  DRIVE_DEF,
  SUSTAIN_DEF,
  FX_DELAY_MUL,
  FX_COMP,
  fxOf,
  fxNum,
  RING_DEF,
  ringMode,
  sndPick,
  sustainAmt,
  driveAmt,
  CS_MAX,
  CS_ENV_K,
  csLatency,
  csMeasureLatency,
  cdriveAmt,
  bodyAmt,
  _susCache,
  toneOf,
  tone,
  _irCache,
  bodyIR,
  GDRY,
  GWET,
  GCONV,
  _gbId,
  GPOST,
  GCS,
  _fxLFO,
  FXCOMP,
  FXCOMP_DRY,
  FXCOMP_WET,
  FXWAH,
  FXWAH_DRY,
  FXWAH_WET,
  FXWAH_LFO,
  FXWAH_DEPTH,
  FXWAH_UP,
  FXPH_DRY,
  FXPH_WET,
  FXPH_LFO,
  FXPH_DEPTH,
  FXPH_FB,
  FXCH_DRY,
  FXCH_WET,
  FXCH_LFO,
  FXCH_DEPTH,
  FXFL_DRY,
  FXFL_WET,
  FXFL_LFO,
  FXFL_DEPTH,
  FXFL_FB,
  FXTR,
  FXTR_LFO,
  FXTR_DEPTH,
  FXDL_DRY,
  FXDL_WET,
  FXDL_D,
  FXDL_FB,
  FXDL_LP,
  FXRV_DRY,
  FXRV_WET,
  FXRV_CONV,
  FXRV_PRE,
  FXTRIM,
  FXCOMP_SEND,
  FXWAH_SEND,
  FXPH_SEND,
  FXDL_SEND,
  FXRV_SEND,
  _fxLog,
  fxLog,
  _trHz,
  _trWave,
  GPRE,
  GSHP,
  GCAB,
  GMID,
  GDIRT,
  GCLEAN,
  _shpK,
  GHP,
  GRECT,
  _shpR,
  GLP2,
  GPRE2,
  GSHP2,
  _shpK2,
  _BUSES,
  busFresh,
  busSave,
  busLoad,
  busUse,
  busDirtyAll,
  rectCurve,
  driveCurve,
  _rvCache,
  roomIR,
  COMP_REF_DB,
  compParams,
  _compGain,
  compKey,
  compEstimate,
  compMatchGain,
  _compBusy,
  compMeasure,
  compPrime,
  compApplyMeasured,
  fxChain,
  _fxChainBuild,
  fxDump,
  _fxOff,
  fxQuiet,
  fxApply,
  GATE_LO,
  GATE_HI,
  GATE_K,
  guitarBus,
  pickHit,
  _ksCache,
  _ksBytes,
  KS_CACHE_BYTES,
  ksFreq,
  ksLength,
  ksT60,
  KS_TAIL,
  KS_MAX_SECS,
  _stCache,
  strTone,
  PM_KIND,
  pmOf,
  _pmCache,
  pmTone,
  SB,
  _sbCache,
  sbTone,
  slideHit,
  sbOn,
  sbAt,
  ksBuffer,
  VK_SPAN,
  vkOf,
  pruneVoices,
  voiceLevelAt,
  dampVoices,
  stopAllVoices,
  opt_str_stash,
  NAT_HARM,
  harmShift,
  pluckHarmonic,
  pluck,
  STEP_MIN,
  STEP_CROSS,
  STEP_TIME,
  stepPlan,
  stepPitch,
  slidePitch,
  fretScrape,
  scrapeSteps,
  bendRamp,
  fingerHit,
  hushOthers,
  hushVoice,
  slideOut,
  glideOut,
  VIB_PUSH,
  VIB_REL,
  applyVib,
  bendVoice,
  LEG_COMP_MAX,
  LEG_GAIN_CEIL,
  LEG_SHORT_OK,
  glideVoice,
  scrape,
  pickScratch,
};
  Object.defineProperty(API,'_sndNow',{get(){return _sndNow;},set(v){_sndNow=v;},enumerable:true});
  Object.defineProperty(API,'_busCur',{get(){return _busCur;},set(v){_busCur=v;},enumerable:true});
  Object.defineProperty(API,'GTRIM',{get(){return GTRIM;},set(v){GTRIM=v;},enumerable:true});
  Object.defineProperty(API,'GBUS',{get(){return GBUS;},set(v){GBUS=v;},enumerable:true});
  Object.defineProperty(API,'FXIN',{get(){return FXIN;},set(v){FXIN=v;},enumerable:true});
  Object.defineProperty(API,'FXOUT',{get(){return FXOUT;},set(v){FXOUT=v;},enumerable:true});
  Object.defineProperty(API,'_fxWired',{get(){return _fxWired;},set(v){_fxWired=v;},enumerable:true});
  Object.defineProperty(API,'_fxId',{get(){return _fxId;},set(v){_fxId=v;},enumerable:true});
  Object.defineProperty(API,'LASTV',{get(){return LASTV;},set(v){LASTV=v;},enumerable:true});
  Object.defineProperty(API,'FXTR_START',{get(){return FXTR_START;},set(v){FXTR_START=v;},enumerable:true});
  Object.defineProperty(API,'FXWAH_START',{get(){return FXWAH_START;},set(v){FXWAH_START=v;},enumerable:true});
  Object.defineProperty(API,'VK_BASE',{get(){return VK_BASE;},set(v){VK_BASE=v;},enumerable:true});
  Object.defineProperty(API,'DAMP_VB',{get(){return DAMP_VB;},set(v){DAMP_VB=v;},enumerable:true});
  Object.defineProperty(API,'_csLat',{get(){return _csLat;},set(v){_csLat=v;},enumerable:true});
  Object.defineProperty(API,'PMIX',{get(){return PMIX;},set(v){PMIX=v;},enumerable:true});
  Object.defineProperty(API,'PPAN',{get(){return PPAN;},set(v){PPAN=v;},enumerable:true});
  Object.defineProperty(API,'PMET',{get(){return PMET;},set(v){PMET=v;},enumerable:true});
  Object.defineProperty(API,'PSEND',{get(){return PSEND;},set(v){PSEND=v;},enumerable:true});
  Object.defineProperty(API,'VOICES',{get(){return VOICES;},set(v){VOICES=v;},enumerable:true});
window.SLGuitar=API;
})();
