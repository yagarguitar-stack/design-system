/* yagarguitar-stack 共通デザイン v1 — 楽器の音
   使える楽器：acoustic（アコギ）／nylon（ナイロン）／electric（エレキ）／piano（ピアノ）／bass（ベース）／drums（ドラム）、ほかに click（クリック音）
   ナイロンとドラムは出典の表記が必要（CC BY-SA 3.0）。使うツールには DS.sound.creditsHtml([使う楽器]) の文を載せる。詳しくは README の「楽器の音」
   例：
     DS.sound.load('acoustic').then(function(){ DS.sound.chord('acoustic',['E2','B2','E3','G#3','B3','E4']); });
     DS.sound.play('piano','C4',{dur:1});
     DS.sound.drum('kick');  DS.sound.click(true);
*/
(function(){
  var DS=window.DS=window.DS||{};
  var BASE=(function(){var s=document.currentScript&&document.currentScript.src;return s?s.replace(/[^\/]*$/,'')+'sounds/':'sounds/';})();
  var MAP={"acoustic":[40,43,46,49,52,55,58,61,64,68,71,74,77,80,83],"electric":[40,42,45,48,51,54,57,60,63,66,69,72,75,78,81,84],"piano":[23,27,31,35,38,41,45,48,52,55,58,62,65,69,72,76,79,82,85,88,91,94,97,100,103,106],"bass":[24,30,36,42,48,54,60,66,69],"drums":["kick","rim","snare","hihat","hihat-open","crash","ride","tom-high","tom-low"],"nylon":[40,43,46,49,52,55,58,61,64,67,70,73,76,79,82,85,88]};
  /* 録音ごとの音程のずれ（セント）。鳴らす時に打ち消して、A=440Hz の正確な音程にそろえる */
  var TUNE={"acoustic":{"40":-18.1,"43":-7.7,"46":-7.6,"49":-10.4,"52":-8.7,"55":-8.7,"58":-12.7,"61":-11.4,"64":-15.4,"68":-11.7,"71":-12.7,"74":-13.8,"77":-12.3,"80":-13.6,"83":-15.4},"electric":{"40":-2.8,"42":-13.0,"45":-5.7,"48":-9.9,"51":-0.9,"54":1.9,"57":-3.2,"60":-1.2,"63":-1.6,"66":3.8,"69":-2.5,"72":-3.7,"75":2.6,"78":1.7,"81":1.0,"84":-2.1},"piano":{"41":-7.8,"45":-6.2,"48":3.5,"52":0.5,"55":2.7,"58":0.8,"62":3.6,"65":5.0,"69":3.6,"72":3.9,"76":4.1,"79":6.0,"82":5.8,"85":5.9,"88":10.8,"91":8.4,"94":11.8,"97":12.0,"100":21.0,"103":35.9,"106":32.9,"23":-12.4,"27":-9.7,"31":-5.5,"35":-6.6,"38":-1.6},"bass":{"24":4.1,"30":1.6,"36":10.8,"42":8.5,"48":7.6,"54":5.3,"60":1.1,"66":5.4,"69":3.4},"nylon":{"40":1.1,"43":10.1,"46":6.7,"49":4.9,"52":6.0,"55":5.5,"58":5.2,"61":10.3,"64":4.2,"67":7.0,"70":5.7,"73":7.4,"76":6.0,"79":6.1,"82":6.3,"85":8.8,"88":10.8}};
  /* 1音ずつの音量の補正。鳴り始め0.3秒の大きさを全楽器・全音でそろえてある */
  var LEVEL={"acoustic":{"40":0.376,"43":0.246,"46":0.447,"49":0.407,"52":0.36,"55":0.441,"58":0.616,"61":0.748,"64":0.982,"68":1.133,"71":1.331,"74":2.564,"77":0.971,"80":2.195,"83":1.373},"electric":{"40":0.873,"42":0.943,"45":0.855,"48":0.788,"51":0.915,"54":0.766,"57":0.437,"60":0.747,"63":0.697,"66":0.869,"69":1.047,"72":0.804,"75":0.99,"78":0.671,"81":0.52,"84":0.585},"piano":{"100":1.064,"103":1.155,"106":1.192,"23":0.59,"27":0.408,"31":0.467,"35":0.71,"38":0.476,"41":0.404,"45":0.343,"48":0.369,"52":0.467,"55":0.556,"58":0.262,"62":0.425,"65":0.255,"69":0.315,"72":0.253,"76":0.575,"79":0.979,"82":0.517,"85":0.55,"88":1.165,"91":1.185,"94":0.604,"97":1.376},"bass":{"24":0.26,"30":0.255,"36":0.34,"42":0.245,"48":0.503,"54":0.333,"60":0.446,"66":0.478,"69":0.461},"nylon":{"40":0.248,"43":0.27,"46":0.271,"49":0.306,"52":0.311,"55":0.366,"58":0.378,"61":0.283,"64":0.389,"67":0.299,"70":0.435,"73":0.313,"76":0.432,"79":0.458,"82":0.484,"85":0.516,"88":0.55}};
  /* 音源の出どころ。need:true は、使うツールに出典の表記が必要なもの */
  var CREDITS={
    acoustic:{label:'アコギ',name:'Martin HD28（Discord SFZ GM Bank）',license:'CC0',need:false},
    electric:{label:'エレキ',name:'Shinyguitar（Karoryfer Samples）',license:'CC0',need:false},
    piano:{label:'ピアノ',name:'Splendid Grand Piano',license:'パブリックドメイン',need:false},
    bass:{label:'ベース',name:'Killer Bass（Karoryfer Samples）',license:'CC0',need:false},
    nylon:{label:'ナイロン',name:'MusyngKite（midi-js-soundfonts）',license:'CC BY-SA 3.0',need:true,
      url:'https://github.com/gleitz/midi-js-soundfonts',licenseUrl:'https://creativecommons.org/licenses/by-sa/3.0/deed.ja'},
    drums:{label:'ドラム',name:'MusyngKite（midi-js-soundfonts）',license:'CC BY-SA 3.0',need:true,
      url:'https://github.com/gleitz/midi-js-soundfonts',licenseUrl:'https://creativecommons.org/licenses/by-sa/3.0/deed.ja'}
  };
  var NAMES={acoustic:'アコギ',nylon:'ナイロン',electric:'エレキ',piano:'ピアノ',bass:'ベース',drums:'ドラム'};
  var STRUM={acoustic:0.022,nylon:0.022,electric:0.018,piano:0,bass:0};
  var ctx=null,out=null,bank={},loading={},hatTurn=0;

  /* ツール側がすでに音の器を持っている時は、それを使う（同じ器でないと混ぜられない） */
  function use(o){o=o||{};if(o.context){ctx=o.context;out=o.output||null;if(!out){out=ctx.createGain();out.gain.value=0.8;out.connect(ctx.destination);}}else if(o.output){ac();out=o.output;}}
  function ac(){
    if(!ctx){var C=window.AudioContext||window.webkitAudioContext;ctx=new C();out=ctx.createGain();out.gain.value=0.8;out.connect(ctx.destination);}
    /* 書き出し専用の器（OfflineAudioContext）は再開できないので触らない */
    if(ctx.state==='suspended'&&!(window.OfflineAudioContext&&ctx instanceof OfflineAudioContext)){try{var r=ctx.resume();if(r&&r.catch)r.catch(function(){});}catch(e){}}
    return ctx;
  }
  /* スマホでは最初のタップまで音が出せないため、最初の操作で準備する */
  function unlock(){ac();document.removeEventListener('pointerdown',unlock,true);document.removeEventListener('keydown',unlock,true);}
  document.addEventListener('pointerdown',unlock,true);document.addEventListener('keydown',unlock,true);

  function decode(ab){return new Promise(function(res,rej){ac().decodeAudioData(ab,res,rej);});}
  /* 音の頭の無音（形式による差）を自動で詰める */
  function lead(b){var d=b.getChannelData(0),pk=0,i,n=Math.min(d.length,b.sampleRate);for(i=0;i<d.length;i++){var a=d[i]<0?-d[i]:d[i];if(a>pk)pk=a;}
    var th=pk*0.02;for(i=0;i<n;i++){if((d[i]<0?-d[i]:d[i])>th)break;}return Math.max(0,i-32)/b.sampleRate;}
  function load(inst){
    if(Array.isArray(inst))return Promise.all(inst.map(load));
    if(inst==='click')return Promise.resolve();
    if(!MAP[inst])return Promise.reject(new Error('楽器の名前が違います：'+inst));
    if(loading[inst])return loading[inst];
    bank[inst]={};
    loading[inst]=Promise.all(MAP[inst].map(function(k){
      return fetch(BASE+inst+'/'+k+'.mp3').then(function(r){if(!r.ok)throw new Error('音が読み込めません：'+inst+'/'+k);return r.arrayBuffer();})
        .then(decode).then(function(b){bank[inst][k]={buf:b,off:lead(b)};});
    })).then(function(){return inst;});
    return loading[inst];
  }
  function isReady(inst){return !!(bank[inst]&&MAP[inst]&&Object.keys(bank[inst]).length===MAP[inst].length);}

  var PC={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
  /* 'C4'・'F#3'・'Bb2'・60 のどれでも受け付ける（C4＝真ん中のド＝60） */
  function midi(n){if(typeof n==='number')return n;var m=/^([A-Ga-g])([#b]?)(-?\d)$/.exec(String(n).trim());if(!m)throw new Error('音名が読めません：'+n);
    return 12+PC[m[1].toUpperCase()]+(m[2]==='#'?1:m[2]==='b'?-1:0)+12*parseInt(m[3],10);}

  function voice(buf,off,rate,opt,lv){
    var c=ac(),t=Math.max(opt.time==null?c.currentTime:opt.time,c.currentTime);
    var s=c.createBufferSource(),g=c.createGain(),v=opt.vel==null?0.8:opt.vel;
    s.buffer=buf;s.playbackRate.value=rate;g.gain.value=v*v*(lv||1);s.connect(g);g.connect(opt.dest||out);
    s.start(t,off);
    if(opt.dur!=null){var rel=opt.release==null?0.15:opt.release;g.gain.setValueAtTime(v*v*(lv||1),t+opt.dur);g.gain.linearRampToValueAtTime(0,t+opt.dur+rel);s.stop(t+opt.dur+rel+0.05);}
    return {stop:function(when){var w=when==null?ac().currentTime:when;try{g.gain.setTargetAtTime(0,w,0.03);s.stop(w+0.2);}catch(e){}}};
  }
  function play(inst,note,opt){
    opt=opt||{};
    if(inst==='drums')return drum(note,opt);
    if(!isReady(inst)){var o={stop:function(){}};load(inst).then(function(){var v=play(inst,note,opt);o.stop=v.stop;});return o;}
    var m=midi(note),best=null,d=1e9;
    MAP[inst].forEach(function(k){var e=Math.abs(k-m);if(e<d){d=e;best=k;}});
    var e=bank[inst][best],c=(TUNE[inst]&&TUNE[inst][best])||0,lv=(LEVEL[inst]&&LEVEL[inst][best])||1;
    return voice(e.buf,e.off,Math.pow(2,(m-best)/12-c/1200),opt,lv);
  }
  /* 和音：strum で1音ずつずらす（ギターは自動で少しずらす）。up:true で上から */
  function chord(inst,notes,opt){
    opt=opt||{};var gap=opt.strum==null?(STRUM[inst]||0):opt.strum,list=notes.slice();if(opt.up)list.reverse();
    var t0=opt.time==null?ac().currentTime:opt.time;
    return list.map(function(n,i){var o={};for(var k in opt)o[k]=opt[k];o.time=t0+i*gap;return play(inst,n,o);});
  }
  /* ドラム：kick／snare／rim／hihat／hihat-open／crash／ride／tom-high／tom-low */
  function drum(name,opt){
    opt=opt||{};
    if(!isReady('drums')){var o={stop:function(){}};load('drums').then(function(){var v=drum(name,opt);o.stop=v.stop;});return o;}
    var k=name;if(k==='hihat'&&bank.drums.hihat2){k=(hatTurn++%2)?'hihat2':'hihat';}
    var e=bank.drums[k];if(!e)throw new Error('ドラムの名前が違います：'+name);
    return voice(e.buf,e.off,1,opt);
  }
  /* クリック音（電子音）：accent=true で1拍目の高い音 */
  function click(accent,opt){
    opt=opt||{};var c=ac(),t=Math.max(opt.time==null?c.currentTime:opt.time,c.currentTime);
    var o=c.createOscillator(),g=c.createGain(),v=opt.vel==null?0.8:opt.vel;
    o.frequency.value=accent?1600:1000;g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(0.0001,t+0.06);
    o.connect(g);g.connect(opt.dest||out);o.start(t);o.stop(t+0.07);
    return {stop:function(){try{o.stop();}catch(e){}}};
  }
  /* 出典の一覧：使う楽器を渡すと、表記が必要なものだけを返す（all:true で全部） */
  function credits(insts,opt){
    insts=insts||Object.keys(CREDITS);if(!Array.isArray(insts))insts=[insts];opt=opt||{};
    return insts.filter(function(i){return CREDITS[i]&&(opt.all||CREDITS[i].need);}).map(function(i){return CREDITS[i];});
  }
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  /* 画面に載せる出典の文（HTML）。表記が必要なものがなければ空文字 */
  function creditsHtml(insts,opt){
    var L=credits(insts,opt);if(!L.length)return '';
    if(!document.getElementById('ds-credits-css')){var st=document.createElement('style');st.id='ds-credits-css';
      st.textContent='.ds-credits{font-size:var(--fs-xs,11px);color:var(--c-text-muted,#8a8f96);line-height:1.6;margin:var(--sp-3,12px) 0 0;}.ds-credits a{color:inherit;}';document.head.appendChild(st);}
    return '<p class="ds-credits">'+L.map(function(c){
      var n=c.url?'<a href="'+esc(c.url)+'" target="_blank" rel="noopener">'+esc(c.name)+'</a>':esc(c.name);
      var l=c.licenseUrl?'<a href="'+esc(c.licenseUrl)+'" target="_blank" rel="noopener">'+esc(c.license)+'</a>':esc(c.license);
      return esc(c.label)+'の音：'+n+'（'+l+'）';}).join('<br>')+'</p>';
  }
  DS.sound={
    instruments:Object.keys(MAP),names:NAMES,
    use:use,load:load,isReady:isReady,credits:credits,creditsHtml:creditsHtml,play:play,chord:chord,drum:drum,click:click,midi:midi,
    now:function(){return ac().currentTime;},
    context:function(){return ac();},
    output:function(){ac();return out;},
    volume:function(v){ac();if(v!=null)out.gain.value=v;return out.gain.value;}
  };
})();
