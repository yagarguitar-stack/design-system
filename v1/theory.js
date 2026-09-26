/* yagarguitar-stack 共通デザイン v1 — 音楽の計算（theory.js）
   音名・音程・調・音階・度数・コード・ギターの弦とフレットを、全ツールで同じ答えにするための計算。
   画面には何も描かない。読み込むと DS.theory が使える。

   決まりごと
     ・C4＝60（sound.js・notation.js と同じ）
     ・弦は 0＝6弦 〜 5＝1弦（notation.js・fretboard.js と同じ並び）
     ・音名は調に合わせて綴る（ト長調なら F♯、ヘ長調なら G♭）。調の指定がない時は ギター譜の慣用（C♯ E♭ F♯ A♭ B♭）
     ・コード名の書き方は 'ja'（CM7・C7(♭9)）と 'en'（Cmaj7・C7(b9)）。初期は 'ja'。DS.theory.style('en') で切り替え
     ・読めなかった時は null を返す（黙って別の答えで埋めない）

   例：
     DS.theory.midi('C#4')              // 61
     DS.theory.name(66,{key:'G'})       // 'F♯4'
     DS.theory.chord('G7(♭9)/B').notes  // ['G','B','D','F','A♭']
     DS.theory.identify([52,55,60])[0].name   // 'C/E'
     DS.theory.fret(0,3)                // 43（6弦3フレット）
*/
(function(){
  var G=(typeof window!=='undefined')?window:globalThis;
  var DS=G.DS=G.DS||{};

  /* ───────── 土台 ───────── */
  var LET='CDEFGAB';
  var LPC=[0,2,4,5,7,9,11];          // 各文字の高さ（C からの半音）
  var LFIFTH=[0,2,4,-1,1,3,5];       // 各文字の五度圏の位置（C＝0、G＝1、F＝−1）
  var SOLFA=['ド','レ','ミ','ファ','ソ','ラ','シ'];
  var IROHA=['ハ','ニ','ホ','ヘ','ト','イ','ロ'];
  var DEF_SPELL=[[0,0],[0,1],[1,0],[2,-1],[2,0],[3,0],[3,1],[4,0],[5,-1],[5,0],[6,-1],[6,0]]; // 調なしの綴り：C C♯ D E♭ E F F♯ G A♭ A B♭ B
  var DEG_LABEL=['R','♭2','2','♭3','3','4','♭5','5','♭6','6','♭7','7'];                       // 半音数→度数の表記（指板の度数色と同じ並び）
  var STYLE='ja';

  function mod(n,m){return ((n%m)+m)%m;}
  function isNum(x){return typeof x==='number'&&isFinite(x);}

  function accSym(a,ascii){
    if(!a) return '';
    if(ascii) return a>0?new Array(a+1).join('#'):new Array(-a+1).join('b');
    if(a===2) return '𝄪'; if(a===-2) return '𝄫';
    return a>0?new Array(a+1).join('♯'):new Array(-a+1).join('♭');
  }
  function asc(opts){opts=opts||{};return opts.ascii!=null?!!opts.ascii:((opts.style||STYLE)==='en');}

  /* 綴った音 {l:文字0-6, a:変化 −2〜+2, o:オクターブ or null} */
  function sp(l,a,o){return {l:l,a:a,o:(o==null?null:o)};}
  function spPc(n){return mod(LPC[n.l]+n.a,12);}
  function spMidi(n){return n.o==null?null:(n.o+1)*12+LPC[n.l]+n.a;}
  function spStr(n,opts){opts=opts||{};var s=LET[n.l]+accSym(n.a,asc(opts));if(opts.octave!==false&&n.o!=null)s+=n.o;return s;}
  function withOct(n,midi){return sp(n.l,n.a,Math.floor((midi-(LPC[n.l]+n.a))/12)-1);}

  /* 文字列の音名を読む：'C#4' 'Bb' 'E♭3' 'F##' 'Cb4' 'ド♯' */
  function parseNote(str){
    if(str==null) return null;
    if(typeof str==='object'&&str.l!=null) return str;
    var s=String(str).trim(), l=-1, rest='';
    var m=/^([A-Ga-g])(.*)$/.exec(s);
    if(m){l=LET.indexOf(m[1].toUpperCase());rest=m[2];}
    else{
      for(var i=0;i<7;i++){if(s.indexOf(SOLFA[i])===0){l=i;rest=s.slice(SOLFA[i].length);break;}}
      if(l<0) return null;
    }
    var mm=/^((?:##|bb|x|𝄪|𝄫|#|♯|b|♭)*)(-?\d+)?$/.exec(rest);
    if(!mm) return null;
    var a=0, t=mm[1];
    for(var k=0;k<t.length;k++){var c=t[k];
      if(c==='#'||c==='♯') a++; else if(c==='b'||c==='♭') a--; else if(c==='x') a+=2;
      else if(c==='\uD834'){var d=t[k+1];k++;if(d==='\uDD2A')a+=2;else if(d==='\uDD2B')a-=2;}
    }
    if(Math.abs(a)>2) return null;
    return sp(l,a,mm[2]!=null?parseInt(mm[2],10):null);
  }

  /* ───────── 調 ───────── */
  function scaleSpell(tonic,degs){
    return degs.map(function(d){var q=parseDeg(d);var l=mod(tonic.l+q.n-1,7);
      var want=mod(spPc(tonic)+q.semi,12);var a=mod(want-LPC[l]+6,12)-6;return sp(l,a,null);});
  }
  function parseDeg(d){ // '♭3' 'b7' '#11' 'bb7' '13' → {n, acc, semi}
    var m=/^((?:bb|b|♭♭|♭|𝄫|##|#|♯)?)(\d+)$/.exec(String(d).replace('𝄫','bb'));
    var t=m[1],a=0;for(var i=0;i<t.length;i++){a+=(t[i]==='#'||t[i]==='♯')?1:-1;}
    var n=parseInt(m[2],10);
    return {n:n,acc:a,semi:LPC[(n-1)%7]+12*Math.floor((n-1)/7)+a};
  }
  function degLabel(d){var q=parseDeg(d);if(q.n===1&&!q.acc)return 'R';return accSym(q.acc,false)+q.n;}

  var MAJ_DEG=['1','2','3','4','5','6','7'], MIN_DEG=['1','2','♭3','4','5','♭6','♭7'];
  var KEY_ROMAN=['I','II','III','IV','V','VI','VII'];
  var FUNC_JA={T:'トニック',SD:'サブドミナント',D:'ドミナント'};
  var FUNC_MAJ=['T','SD','T','SD','D','T','D'], FUNC_MIN=['T','SD','T','SD','D','SD','SD'];

  function parseKey(k){
    if(k==null) return null;
    if(k&&k._key) return k;
    var tonic=null, minor=false;
    if(typeof k==='object'&&k.tonic!=null){tonic=parseNote(k.tonic);minor=!!k.minor;}
    else{
      var s=String(k).trim();
      var j=/^(重嬰|重変|嬰|変)?([ハニホヘトイロ])(長調|短調)$/.exec(s);
      if(j){var a={'重嬰':2,'重変':-2,'嬰':1,'変':-1}[j[1]]||0;tonic=sp(IROHA.indexOf(j[2]),a,null);minor=j[3]==='短調';}
      else{
        var m=/^([A-Ga-g](?:##|bb|#|♯|b|♭)?)\s*(m|min|minor|-|major|maj|M)?$/.exec(s);
        if(!m) return null;
        tonic=parseNote(m[1]);minor=!!m[2]&&/^(m|min|minor|-)$/.test(m[2]);
      }
    }
    if(!tonic) return null;
    tonic=sp(tonic.l,tonic.a,null);
    var scale=scaleSpell(tonic,minor?MIN_DEG:MAJ_DEG);
    var sig=LFIFTH[tonic.l]+7*tonic.a-(minor?3:0);
    var order=sig>=0?[3,0,4,1,5,2,6]:[6,2,5,1,4,0,3];
    var accs=order.map(function(l){for(var i=0;i<7;i++)if(scale[i].l===l)return scale[i];}).filter(function(n){return n.a!==0;});
    return {_key:true,tonic:tonic,pc:spPc(tonic),minor:minor,sig:sig,scale:scale,accidentals:accs};
  }
  /* 調の中での綴り：音階の音はそのまま。外れる音は、長調なら ♭2 ♭3 ♭6 ♭7 と ♯4、短調なら ♭2 ♯3 ♯4 ♯6 ♯7 */
  function spellIn(pc,K){
    pc=mod(pc,12);
    if(!K) {var d=DEF_SPELL[pc];return sp(d[0],d[1],null);}
    for(var i=0;i<7;i++) if(spPc(K.scale[i])===pc) return sp(K.scale[i].l,K.scale[i].a,null);
    var d2=mod(pc-K.pc,12), up;
    if(K.minor) up=(d2===1); else up=(d2===1||d2===3||d2===8||d2===10);
    for(var j=0;j<7;j++){var n=K.scale[j];
      if(up&&spPc(n)===mod(pc+1,12)) return sp(n.l,n.a-1,null);
      if(!up&&spPc(n)===mod(pc-1,12)) return sp(n.l,n.a+1,null);
    }
    var dd=DEF_SPELL[pc];return sp(dd[0],dd[1],null);
  }
  function keyObj(k,opts){
    var K=parseKey(k); if(!K) return null;
    opts=opts||{};
    var tri=[], sev=[];
    for(var i=0;i<7;i++){
      var r=K.scale[i], t=[0,2,4].map(function(x){return spPc(K.scale[(i+x)%7]);}), s=[0,2,4,6].map(function(x){return spPc(K.scale[(i+x)%7]);});
      var tt=matchType(t.map(function(p){return mod(p-spPc(r),12);}),['maj','min','dim','aug']);
      var st=matchType(s.map(function(p){return mod(p-spPc(r),12);}),['maj7','min7','dom7','m7b5','dim7','minMaj7','augMaj7']);
      var f=(K.minor?FUNC_MIN:FUNC_MAJ)[i];
      [[tri,tt],[sev,st]].forEach(function(pair){
        var c=chordObj({root:r,type:pair[1]},{key:K,style:opts.style});
        c.roman=romanOf(c,K,opts);c.func=f;c.funcJa=FUNC_JA[f];pair[0].push(c);
      });
    }
    var rel=K.minor?sp(K.scale[2].l,K.scale[2].a,null):sp(K.scale[5].l,K.scale[5].a,null);
    return {
      name:keyName(K,opts), ja:keyJa(K), tonic:spStr(K.tonic,opts), pc:K.pc, minor:K.minor,
      sig:K.sig, sigText:K.sig===0?'なし':(K.sig>0?'♯'+K.sig+'つ':'♭'+(-K.sig)+'つ'),
      accidentals:K.accidentals.map(function(n){return spStr(n,opts);}),
      scale:K.scale.map(function(n){return spStr(n,opts);}),
      relative:keyName(parseKey({tonic:rel,minor:!K.minor}),opts),
      chords:tri, sevenths:sev, _k:K
    };
  }
  function keyName(K,opts){return spStr(K.tonic,opts)+(K.minor?'m':'');}
  function keyJa(K){var a={2:'重嬰',1:'嬰',0:'','-1':'変','-2':'重変'}[K.tonic.a];return a+IROHA[K.tonic.l]+(K.minor?'短調':'長調');}
  function toKey(k){if(k==null)return null;if(k._k)return k._k;return parseKey(k);}

  /* ───────── 音階 ───────── */
  var SCALES={
    major:{ja:'メジャースケール',sub:'長音階',deg:['1','2','3','4','5','6','7']},
    natminor:{ja:'ナチュラルマイナー',sub:'自然短音階',deg:['1','2','♭3','4','5','♭6','♭7']},
    harminor:{ja:'ハーモニックマイナー',sub:'和声的短音階',deg:['1','2','♭3','4','5','♭6','7']},
    melminor:{ja:'メロディックマイナー',sub:'旋律的短音階',deg:['1','2','♭3','4','5','6','7']},
    majpenta:{ja:'メジャーペンタトニック',sub:'5音',deg:['1','2','3','5','6']},
    minpenta:{ja:'マイナーペンタトニック',sub:'5音',deg:['1','♭3','4','5','♭7']},
    blues:{ja:'ブルーススケール',sub:'6音',deg:['1','♭3','4','♭5','5','♭7']},
    ionian:{ja:'アイオニアン',sub:'モード',deg:['1','2','3','4','5','6','7']},
    dorian:{ja:'ドリアン',sub:'モード',deg:['1','2','♭3','4','5','6','♭7']},
    phrygian:{ja:'フリジアン',sub:'モード',deg:['1','♭2','♭3','4','5','♭6','♭7']},
    lydian:{ja:'リディアン',sub:'モード',deg:['1','2','3','♯4','5','6','7']},
    mixolydian:{ja:'ミクソリディアン',sub:'モード',deg:['1','2','3','4','5','6','♭7']},
    aeolian:{ja:'エオリアン',sub:'モード',deg:['1','2','♭3','4','5','♭6','♭7']},
    locrian:{ja:'ロクリアン',sub:'モード',deg:['1','♭2','♭3','4','♭5','♭6','♭7']},
    wholetone:{ja:'ホールトーン',sub:'全音音階',deg:['1','2','3','♯4','♯5','♭7']},
    dim:{ja:'ディミニッシュ',sub:'全半',deg:['1','2','♭3','4','♭5','♭6','6','7']}
  };
  var SCALE_ALIAS={minor:'natminor',harmonicMinor:'harminor',melodicMinor:'melminor',majorPenta:'majpenta',minorPenta:'minpenta'};
  function scale(root,type,opts){
    var t=SCALES[type||'major']?(type||'major'):SCALE_ALIAS[type]; if(!t) return null;
    var r=isNum(root)?spellIn(root,toKey(opts&&opts.key)):parseNote(root); if(!r) return null;
    r=sp(r.l,r.a,null);
    var S=SCALES[t], notes=scaleSpell(r,S.deg);
    return {type:t,ja:S.ja,sub:S.sub,root:spStr(r,opts),
      notes:notes.map(function(n){return spStr(n,opts);}),
      pcs:notes.map(spPc),
      semis:S.deg.map(function(d){return parseDeg(d).semi;}),
      labels:S.deg.map(degLabel)};
  }

  /* ───────── 音程・度数 ───────── */
  var BASE_STEPS=[0,1,1,2,2,3,4,4,5,5,6,6]; // 半音数だけ分かる時の数え方（6は減5度）
  var QUAL_NAME={P:'完全',M:'長',m:'短',A:'増',d:'減',AA:'重増',dd:'重減'};
  function intervalOf(steps,semi){
    var dir=1; if(semi<0||(semi===0&&steps<0)){dir=-1;semi=-semi;steps=-steps;}
    var simple=mod(steps,7), ref=LPC[simple]+12*Math.floor(steps/7), diff=semi-ref;
    var perfect=(simple===0||simple===3||simple===4), q;
    if(perfect) q={0:'P',1:'A',2:'AA','-1':'d','-2':'dd'}[diff];
    else q={0:'M','-1':'m',1:'A',2:'AA','-2':'d','-3':'dd'}[diff];
    if(!q) return null;
    var num=steps+1;
    var lab=(simple===0&&diff===0&&num<=8)?'R':accSym(diff,false)+(num>8?num:(simple+1));
    return {semi:semi*dir,dir:dir,num:num,quality:q,name:QUAL_NAME[q]+num+'度',label:lab};
  }
  function interval(a,b){
    var A=noteLike(a), B=noteLike(b); if(!A||!B) return null;
    if(A.sp&&B.sp){
      var steps=(B.sp.l-A.sp.l), semi;
      if(A.sp.o!=null&&B.sp.o!=null){steps+=7*(B.sp.o-A.sp.o);semi=spMidi(B.sp)-spMidi(A.sp);}
      else{steps=mod(steps,7);semi=mod(spPc(B.sp)-spPc(A.sp),12);if(steps===0&&semi>6)semi-=12;}
      return intervalOf(steps,semi);
    }
    var s=B.midi-A.midi, abs=Math.abs(s), st=BASE_STEPS[abs%12]+7*Math.floor(abs/12);
    var r=intervalOf(s<0?-st:st,s);
    if(abs%12===6) r.alt='増'+(4+7*Math.floor(abs/12))+'度';
    return r;
  }
  /* ルートから見た度数の表記（R・♭3・5・♭7 など）。綴りが分かる時は ♯5・𝄫7 も区別する */
  function degree(note,root,opts){
    var N=noteLike(note), R=noteLike(root); if(!N||!R) return null;
    if(N.sp&&R.sp&&!(opts&&opts.plain)){var iv=interval(sp(R.sp.l,R.sp.a,null),sp(N.sp.l,N.sp.a,null));if(iv)return iv.label;}
    return DEG_LABEL[mod(N.pc-R.pc,12)];
  }
  function noteLike(x){
    if(isNum(x)) return {midi:x,pc:mod(Math.round(x),12),sp:null};
    var n=parseNote(x); if(!n) return null;
    return {midi:spMidi(n),pc:spPc(n),sp:n};
  }

  /* ───────── コード ─────────
     f：ルートからの度数、ja/en：コード名の書き方、name：日本語の呼び名、feel：響きのひとこと（ハーモニーツリーより） */
  var CHORDS={
    pow:{f:['1','5'],ja:'5',en:'5',name:'パワーコード'},
    maj:{f:['1','3','5'],ja:'',en:'',name:'メジャー',feel:'明るい'},
    min:{f:['1','♭3','5'],ja:'m',en:'m',name:'マイナー',feel:'暗い'},
    dom7:{f:['1','3','5','♭7'],ja:'7',en:'7',name:'セブンス',feel:'進みたい'},
    maj7:{f:['1','3','5','7'],ja:'M7',en:'maj7',name:'メジャーセブンス',feel:'おしゃれ'},
    min7:{f:['1','♭3','5','♭7'],ja:'m7',en:'m7',name:'マイナーセブンス',feel:'落ち着いた暗さ'},
    dim:{f:['1','♭3','♭5'],ja:'dim',en:'dim',name:'ディミニッシュ',feel:'不安定'},
    aug:{f:['1','3','♯5'],ja:'aug',en:'aug',name:'オーグメント',feel:'浮遊'},
    sus4:{f:['1','4','5'],ja:'sus4',en:'sus4',name:'サスフォー',feel:'保留'},
    sus2:{f:['1','2','5'],ja:'sus2',en:'sus2',name:'サスツー',feel:'開けた'},
    dom6:{f:['1','3','5','6'],ja:'6',en:'6',name:'シックス',feel:'柔らかい'},
    min6:{f:['1','♭3','5','6'],ja:'m6',en:'m6',name:'マイナーシックス',feel:'渋い'},
    m7b5:{f:['1','♭3','♭5','♭7'],ja:'m7(♭5)',en:'m7b5',name:'マイナーセブンス・フラットファイブ',feel:'翳り'},
    dim7:{f:['1','♭3','♭5','𝄫7'],ja:'dim7',en:'dim7',name:'ディミニッシュセブンス',feel:'緊張'},
    minMaj7:{f:['1','♭3','5','7'],ja:'mM7',en:'m(maj7)',name:'マイナーメジャーセブンス',feel:'妖しい'},
    aug7:{f:['1','3','♯5','♭7'],ja:'aug7',en:'7(#5)',name:'オーグメントセブンス'},
    augMaj7:{f:['1','3','♯5','7'],ja:'M7(♯5)',en:'maj7(#5)',name:'オーグメントメジャーセブンス'},
    dom7sus4:{f:['1','4','5','♭7'],ja:'7sus4',en:'7sus4',name:'セブンス・サスフォー',feel:'ふわり'},
    add9:{f:['1','3','5','9'],ja:'add9',en:'add9',name:'アドナインス',feel:'透明'},
    madd9:{f:['1','♭3','5','9'],ja:'m(add9)',en:'m(add9)',name:'マイナー・アドナインス'},
    dom9:{f:['1','3','5','♭7','9'],ja:'9',en:'9',name:'ナインス',feel:'厚みのある進みたい'},
    maj9:{f:['1','3','5','7','9'],ja:'M9',en:'maj9',name:'メジャーナインス',feel:'甘い'},
    min9:{f:['1','♭3','5','♭7','9'],ja:'m9',en:'m9',name:'マイナーナインス',feel:'都会的'},
    dom69:{f:['1','3','5','6','9'],ja:'6(9)',en:'6/9',name:'シックス・ナインス'},
    minMaj9:{f:['1','♭3','5','7','9'],ja:'mM9',en:'m(maj9)',name:'マイナーメジャーナインス'},
    dom7b9:{f:['1','3','5','♭7','♭9'],ja:'7(♭9)',en:'7(b9)',name:'セブンス・フラットナインス'},
    dom7s9:{f:['1','3','5','♭7','♯9'],ja:'7(♯9)',en:'7(#9)',name:'セブンス・シャープナインス'},
    dom9sus4:{f:['1','4','5','♭7','9'],ja:'9sus4',en:'9sus4',name:'ナインス・サスフォー'},
    dom7b5:{f:['1','3','♭5','♭7'],ja:'7(♭5)',en:'7(b5)',name:'セブンス・フラットファイブ'},
    maj7b5:{f:['1','3','♭5','7'],ja:'M7(♭5)',en:'maj7(b5)',name:'メジャーセブンス・フラットファイブ'},
    dom11:{f:['1','5','♭7','9','11'],ja:'11',en:'11',name:'イレブンス（3度なし）'},
    maj11:{f:['1','3','5','7','9','11'],ja:'M11',en:'maj11',name:'メジャーイレブンス'},
    min11:{f:['1','♭3','5','♭7','9','11'],ja:'m11',en:'m11',name:'マイナーイレブンス'},
    dom7s11:{f:['1','3','5','♭7','9','♯11'],ja:'7(♯11)',en:'7(#11)',name:'セブンス・シャープイレブンス'},
    maj7s11:{f:['1','3','5','7','9','♯11'],ja:'M7(♯11)',en:'maj7(#11)',name:'メジャーセブンス・シャープイレブンス'},
    dom13:{f:['1','3','5','♭7','9','13'],ja:'13',en:'13',name:'サーティーンス'},
    maj13:{f:['1','3','5','7','9','13'],ja:'M13',en:'maj13',name:'メジャーサーティーンス'},
    min13:{f:['1','♭3','5','♭7','9','11','13'],ja:'m13',en:'m13',name:'マイナーサーティーンス'},
    dom7b13:{f:['1','3','5','♭7','9','♭13'],ja:'7(♭13)',en:'7(b13)',name:'セブンス・フラットサーティーンス'},
    dom13s11:{f:['1','3','5','♭7','9','♯11','13'],ja:'13(♯11)',en:'13(#11)',name:'サーティーンス・シャープイレブンス'},
    alt:{f:['1','3','♯5','♭7','♭9','♯9'],ja:'7alt',en:'7alt',name:'オルタード'},
    dom7b9b13:{f:['1','3','5','♭7','♭9','♭13'],ja:'7(♭9,♭13)',en:'7(b9,b13)',name:'セブンス（♭9・♭13）'},
    dom7s9s11:{f:['1','3','5','♭7','♯9','♯11'],ja:'7(♯9,♯11)',en:'7(#9,#11)',name:'セブンス（♯9・♯11）'},
    dom7b9s11:{f:['1','3','5','♭7','♭9','♯11'],ja:'7(♭9,♯11)',en:'7(b9,#11)',name:'セブンス（♭9・♯11）'},
    dom7s9b13:{f:['1','3','5','♭7','♯9','♭13'],ja:'7(♯9,♭13)',en:'7(#9,b13)',name:'セブンス（♯9・♭13）'}
  };
  var ORDER=Object.keys(CHORDS);
  ORDER.forEach(function(k){var c=CHORDS[k];c.semis=c.f.map(function(d){return parseDeg(d).semi;});c.pcs=c.semis.map(function(s){return s%12;});});

  function matchType(pcs,only){
    var set=pcs.map(function(p){return mod(p,12);}).sort(function(a,b){return a-b;}).join(',');
    var list=only||ORDER;
    for(var i=0;i<list.length;i++){var c=CHORDS[list[i]];if(c.pcs.slice().sort(function(a,b){return a-b;}).join(',')===set)return list[i];}
    return null;
  }

  /* コード名の読み取り用：綴りをそろえる（♯→#、♭→b、Δ→maj、ø→m7b5 など） */
  function norm(s){
    s=String(s).replace(/[（]/g,'(').replace(/[）]/g,')').replace(/[、，]/g,',').replace(/\s+/g,'')
      .replace(/♯/g,'#').replace(/♭/g,'b').replace(/𝄫/g,'bb');
    s=s.replace(/^(-|min)(?=\d|$|\(|M|maj|sus|add|b|#)/,'m')
       .replace(/^\+/,'aug')
       .replace(/ø7?/,'m7b5').replace(/^(°|o)7/,'dim7').replace(/^(°|o)$/,'dim')
       .replace(/Δ/g,'maj').replace(/△/g,'maj')
       .replace(/(^|m)(MAJ|Maj|Ma|M)(?=\d|\(|$)/,'$1maj')
       .replace(/^m(?:maj|M)/,'mmaj')
       .replace(/(\d)-(\d)/g,'$1b$2').replace(/(\d)\+(\d)/g,'$1#$2')
       .replace(/sus(?![24])/,'sus4').replace(/add2/,'add9');
    return s;
  }
  function flat(s){return s.replace(/[(),]/g,'');}
  var DICT={};
  ORDER.forEach(function(k){var c=CHORDS[k];[c.ja,c.en].forEach(function(x){DICT[norm(x)]=k;DICT[flat(norm(x))]=k;});});
  [['maj',''],['M',''],['min','m'],['m7-5','m7b5'],['m7(-5)','m7b5'],['mmaj7','minMaj7'],['mM7','minMaj7'],['7#5','aug7'],['+7','aug7'],['maj7#5','augMaj7'],['maj7+5','augMaj7'],['7b5','dom7b5'],['maj7b5','maj7b5'],
   ['69','dom69'],['6/9','dom69'],['6add9','dom69'],['madd9','madd9'],['m9maj7','minMaj9'],['mmaj9','minMaj9'],['7sus','dom7sus4'],['9sus','dom9sus4'],['alt','alt'],['7b9','dom7b9'],['7#9','dom7s9'],['7#11','dom7s11'],['7b13','dom7b13'],['13#11','dom13s11'],
   ['maj7#11','maj7s11'],['dim7','dim7'],['7aug','aug7'],['augmaj7','augMaj7'],['5','pow'],['sus2','sus2']
  ].forEach(function(p){var t=p[1]===''?'maj':p[1];[norm(p[0]),flat(norm(p[0]))].forEach(function(k){if(DICT[k]==null)DICT[k]=t;});});
  DICT['']='maj';

  function readRoot(s){
    var m=/^([A-Ga-g])((?:##|bb|#|♯|b|♭|x)?)/.exec(s); if(!m) return null;
    var n=parseNote(m[1]+m[2]); return n?{n:n,len:m[0].length}:null;
  }
  function parseChord(str){
    if(str==null) return null;
    var t=String(str).trim(); if(!t) return null;
    if(/^(N\.?C\.?|なし)$/i.test(t)) return {nc:true,text:t};
    var r=readRoot(t); if(!r) return null;
    var suf=t.slice(r.len), bass=null;
    var si=suf.lastIndexOf('/');
    if(si>=0&&/^\s*[A-Ga-g]/.test(suf.slice(si+1))){
      var b=parseNote(suf.slice(si+1).trim()); if(!b) return null;
      bass=sp(b.l,b.a,null); suf=suf.slice(0,si);
    }
    var n=norm(suf), key=n;
    if(DICT[key]!=null) return {root:sp(r.n.l,r.n.a,null),type:DICT[key],bass:bass,tensions:[],text:t};
    /* 表にない書き方：土台の種類＋テンションに分け、音の組み合わせが同じ種類があればそれに寄せる */
    var tens=[], core=n.replace(/\(([^)]*)\)/g,function(_,inner){inner.split(',').forEach(function(x){if(x)tens.push(x);});return '';});
    var base=null,rest='';
    for(var L=core.length;L>=0;L--){var head=core.slice(0,L);if(DICT[head]!=null){base=DICT[head];rest=core.slice(L);break;}}
    if(base==null) return null;
    var tm, re=/(add)?(bb|b|#)?(2|4|5|6|9|11|13)/g, used=0;
    while((tm=re.exec(rest))){if(tm.index!==used)return null;used=re.lastIndex;tens.push((tm[2]||'')+tm[3]);}
    if(used!==rest.length) return null;
    var semis=CHORDS[base].semis.slice(), extra=[];
    for(var i=0;i<tens.length;i++){
      var x=tens[i].replace(/^add/,''); if(!/^(bb|b|#)?\d+$/.test(x)) return null;
      var q=parseDeg(x); if(q.n===5){ // ♭5・♯5 は5度を置き換える
        semis=semis.filter(function(s){return s!==7;}); }
      if(semis.indexOf(q.semi)<0){semis.push(q.semi);extra.push(x);}
    }
    var exact=null;
    for(var j=0;j<ORDER.length;j++){var c=CHORDS[ORDER[j]];
      if(c.semis.length===semis.length&&c.semis.every(function(s){return semis.indexOf(s)>=0;})){exact=ORDER[j];break;}}
    if(exact) return {root:sp(r.n.l,r.n.a,null),type:exact,bass:bass,tensions:[],text:t};
    if(extra.length)
      return {root:sp(r.n.l,r.n.a,null),type:base,bass:bass,tensions:extra.map(function(x){return x.replace(/bb/,'𝄫').replace(/b/,'♭').replace(/#/,'♯');}),text:t};
    return null;
  }

  function chordObj(x,opts){
    opts=opts||{};
    var K=toKey(opts.key), style=opts.style||STYLE, ascii=style==='en';
    var p;
    if(typeof x==='string') p=parseChord(x);
    else if(x&&x.type){
      var r=isNum(x.root)?spellIn(x.root,K):parseNote(x.root);
      var b=x.bass==null?null:(isNum(x.bass)?spellIn(x.bass,K):parseNote(x.bass));
      p=r&&CHORDS[x.type]?{root:sp(r.l,r.a,null),type:x.type,bass:b?sp(b.l,b.a,null):null,tensions:x.tensions||[]}:null;
    }
    if(!p) return null;
    if(p.nc) return {nc:true,name:'N.C.',text:p.text,notes:[],pcs:[]};
    var C=CHORDS[p.type], root=p.root;
    var degs=C.f.concat(p.tensions);
    var notes=scaleSpell(root,degs);
    var bass=p.bass&&spPc(p.bass)!==spPc(root)?p.bass:null;
    var sym=C[style==='en'?'en':'ja'];
    var tensTxt=p.tensions.length?'('+p.tensions.map(function(t){return ascii?t.replace('𝄫','bb').replace('♭','b').replace('♯','#'):t;}).join(',')+')':'';
    if(tensTxt&&/\)$/.test(sym)) {sym=sym.slice(0,-1)+','+tensTxt.slice(1);tensTxt='';}
    var name=spStr(root,{ascii:ascii})+sym+tensTxt+(bass?'/'+spStr(bass,{ascii:ascii}):'');
    return {
      name:name, text:p.text||name, type:p.type, ja:C.name, feel:C.feel||'',
      root:spStr(root,{ascii:ascii}), rootPc:spPc(root),
      bass:bass?spStr(bass,{ascii:ascii}):null, bassPc:bass?spPc(bass):null,
      tensions:p.tensions.slice(),
      notes:notes.map(function(n){return spStr(n,{ascii:ascii});}),
      pcs:notes.map(spPc),
      semis:degs.map(function(d){return parseDeg(d).semi;}),
      labels:degs.map(degLabel),
      _r:root,_b:bass
    };
  }

  /* 実際に鳴らす音の番号（閉じた並び）。oct：ルートのオクターブ、inv：転回の数。分数コードは低音を下に置く */
  function voice(x,opts){
    opts=opts||{};
    var c=(x&&x.semis&&x._r)?x:chordObj(x,opts); if(!c||c.nc) return null;
    var oct=opts.oct!=null?opts.oct:3;
    var base=(oct+1)*12+LPC[c._r.l]+c._r.a;
    var m=c.semis.map(function(s){return base+s;}).sort(function(a,b){return a-b;});
    for(var i=0;i<(opts.inv||0);i++){m.push(m.shift()+12);}
    if(c._b!=null){
      var bp=spPc(c._b), low=m[0], b=low-mod(low-bp,12); if(b===low) b-=12;
      if(opts.inv==null) m=m.filter(function(v){return mod(v,12)!==bp;});
      m.unshift(b);
    }
    return m;
  }

  /* 音の集まりからコード名を当てる（フレットボードトレーナーの判定が元）。
     一番低い音を低音とし、ルート＝低音 → 構成音が少ない → よく使う順 で並べる。5度の省略も認める */
  function identify(list,opts){
    opts=opts||{};
    var items=(list||[]).map(noteLike).filter(Boolean); if(!items.length) return [];
    var withMidi=items.filter(function(n){return n.midi!=null;});
    var bassItem=withMidi.length===items.length?items.slice().sort(function(a,b){return a.midi-b.midi;})[0]:items[0];
    var S={}; items.forEach(function(n){S[n.pc]=n;}); var keys=Object.keys(S).map(Number);
    if(keys.length<2) return [];
    var K=toKey(opts.key), res=[];
    function spell(pc){var it=S[pc];if(it&&it.sp)return sp(it.sp.l,it.sp.a,null);return spellIn(pc,K);}
    function scan(mode){
      for(var root=0;root<12;root++)for(var i=0;i<ORDER.length;i++){
        var k=ORDER[i], C=CHORDS[k], cp={}; C.pcs.forEach(function(p){cp[mod(root+p,12)]=1;});
        var cs=Object.keys(cp).map(Number), ok;
        if(mode==='exact') ok=cs.length===keys.length&&keys.every(function(p){return cp[p];});
        else{ var miss=cs.filter(function(p){return !S[p];});
          ok=cs.length>=4&&keys.every(function(p){return cp[p];})&&S[root]&&miss.length===1&&miss[0]===mod(root+7,12); }
        if(ok) res.push({root:root,type:k,size:cs.length,order:i,rootIsBass:root===bassItem.pc,omit:mode==='no5'?'5度省略':''});
      }
    }
    scan('exact'); if(!res.length) scan('no5');
    res.sort(function(a,b){if(a.rootIsBass!==b.rootIsBass)return a.rootIsBass?-1:1;if(a.size!==b.size)return a.size-b.size;return a.order-b.order;});
    return res.map(function(r){
      var c=chordObj({root:spell(r.root),type:r.type,bass:r.rootIsBass?null:spell(bassItem.pc)},opts);
      c.omit=r.omit; return c;
    });
  }

  /* 調の中での度数記号（Ⅰ・♭Ⅶ7 など。数字はローマ数字の英字で書く） */
  function romanOf(c,K,opts){
    var steps=mod(c._r.l-K.tonic.l,7), semi=mod(spPc(c._r)-K.pc,12), diff=mod(semi-LPC[steps]+6,12)-6;
    var sym=CHORDS[c.type][(opts&&opts.style||STYLE)==='en'?'en':'ja'];
    var s=accSym(diff,false)+KEY_ROMAN[steps]+sym;
    if(c.tensions.length) s+='('+c.tensions.join(',')+')';
    if(c._b){var bs=mod(c._b.l-K.tonic.l,7),bd=mod(mod(spPc(c._b)-K.pc,12)-LPC[bs]+6,12)-6;s+='/'+accSym(bd,false)+KEY_ROMAN[bs];}
    return s;
  }
  function roman(x,key,opts){
    var K=toKey(key); if(!K) return null;
    var c=(x&&x._r)?x:chordObj(x,{key:K,style:opts&&opts.style}); if(!c||c.nc) return null;
    return romanOf(c,K,opts);
  }

  /* 移調。音名・コード名・番号のどれでも。綴りは移った先の調（opts.key）か、調なしの慣用で決める */
  function transpose(x,semis,opts){
    opts=opts||{}; var K=toKey(opts.key);
    if(isNum(x)) return x+semis;
    var n=parseNote(x), c=opts.as==='note'?null:parseChord(x);
    if(!c&&n){var m=spMidi(n);var t=spellIn(spPc(n)+semis,K);
      if(m!=null)t=withOct(t,m+semis);return spStr(t,opts);}
    if(!c) return null; if(c.nc) return c.text;
    var o=chordObj({root:spPc(c.root)+semis,type:c.type,tensions:c.tensions,bass:c.bass?spPc(c.bass)+semis:null},{key:K,style:opts.style});
    return o&&o.name;
  }

  /* ───────── ギター ───────── */
  var TUNINGS=[
    {id:'std',name:'レギュラー',midi:[40,45,50,55,59,64]},
    {id:'half',name:'半音下げ',midi:[39,44,49,54,58,63]},
    {id:'whole',name:'全音下げ',midi:[38,43,48,53,57,62]},
    {id:'dropd',name:'ドロップD',midi:[38,45,50,55,59,64]},
    {id:'dropc',name:'ドロップC',midi:[36,43,48,53,57,62]},
    {id:'dadgad',name:'DADGAD',midi:[38,45,50,55,57,62]},
    {id:'openg',name:'オープンG',midi:[38,43,50,55,59,62]},
    {id:'opend',name:'オープンD',midi:[38,45,50,54,57,62]},
    {id:'opene',name:'オープンE',midi:[40,47,52,56,59,64]}
  ];
  function tuning(t){
    var o;
    if(Array.isArray(t)) o={id:'custom',name:'独自',midi:t.map(function(x){return midi(x);})};
    else o=TUNINGS.filter(function(x){return x.id===(t||'std');})[0];
    if(!o) return null;
    return {id:o.id,name:o.name,midi:o.midi.slice(),labels:o.midi.map(function(m){return name(m,{octave:false});})};
  }
  function fret(s,f,opts){
    opts=opts||{}; var T=tuning(opts.tuning); if(!T||s<0||s>=T.midi.length) return null;
    return T.midi[s]+(opts.capo||0)+f;
  }
  function positions(note,opts){
    opts=opts||{}; var m=midi(note), T=tuning(opts.tuning); if(m==null||!T) return [];
    var max=opts.maxFret!=null?opts.maxFret:22, out=[];
    for(var s=0;s<T.midi.length;s++){var f=m-T.midi[s]-(opts.capo||0);if(f>=0&&f<=max)out.push({s:s,f:f});}
    return out;
  }
  function stringName(s,count){return ((count||6)-s)+'弦';}

  /* ───────── 名前・番号 ───────── */
  function midi(x){if(isNum(x))return x;var n=parseNote(x);return n?spMidi(n):null;}
  function pc(x){var n=noteLike(x);return n?n.pc:null;}
  function name(x,opts){
    opts=opts||{}; var K=toKey(opts.key);
    if(isNum(x)){var m=Math.round(x);var n=withOct(spellIn(m,K),m);if(opts.octave===false)n.o=null;return spStr(n,opts);}
    var p=parseNote(x); if(!p) return null;
    if(opts.octave===false) p=sp(p.l,p.a,null);
    return spStr(p,opts);
  }
  function solfa(x,opts){
    var n=isNum(x)?spellIn(x,toKey(opts&&opts.key)):parseNote(x); if(!n) return null;
    return SOLFA[n.l]+accSym(n.a,false);
  }
  function freq(x,a4){var m=midi(x);return m==null?null:(a4||440)*Math.pow(2,(m-69)/12);}
  function fromFreq(hz,a4){return 69+12*Math.log(hz/(a4||440))/Math.LN2;}
  function style(s){if(s==='ja'||s==='en')STYLE=s;return STYLE;}

  DS.theory={
    version:'1.0',
    style:style,
    midi:midi, pc:pc, name:name, parse:function(s){var n=parseNote(s);if(!n)return null;return {letter:LET[n.l],acc:n.a,oct:n.o,pc:spPc(n),midi:spMidi(n),name:spStr(n)};},
    solfa:solfa, freq:freq, fromFreq:fromFreq,
    interval:interval, degree:degree, DEGREES:DEG_LABEL.slice(),
    key:keyObj, scale:scale, SCALES:SCALES,
    chord:chordObj, parseChord:function(s){var c=chordObj(String(s||''));return c;}, voice:voice, identify:identify, roman:roman, transpose:transpose, CHORDS:CHORDS,
    tuning:tuning, TUNINGS:TUNINGS, fret:fret, positions:positions, stringName:stringName
  };
})();
