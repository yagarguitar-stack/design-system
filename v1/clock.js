/* yagarguitar-stack 共通デザイン v1 — 拍を正確に刻む仕組み（clock.js）
   メトロノーム・リズム練習・譜面の再生で、同じ刻み方を使うための時計。画面には何も描かない。
   sound.js と一緒に読み込むと、同じ音の器（AudioContext）で刻み、既定でクリック音を鳴らす。

   しくみ
     ・音の器の時計だけを物差しにして、少し先まで音を予約する（画面が重くても拍がずれない）
     ・画面を切り替えた時・画面を消した時も止まらないよう、見回りを別の作業場所（Worker）で回し、予約を長めにとる
     ・画面の光らせ方は「今まさに聞こえている拍」を描き換えごとに確かめて呼ぶ（draw）
     ・テンポ・細かさ・跳ねの変更は次の拍から、拍子・区切り・強弱の変更は次の小節から効く
     ・端末の遅れ（タップの補正）は全ツール共通で1つ。ことりノームで測った値も引き継ぐ

   例：
     var c=DS.clock.create({bpm:100,meter:[4,4],div:2,swing:0.6,countIn:1});
     c.on('draw',function(p){ light(p.beat); });   // 聞こえた瞬間に光らせる
     c.start();
     btn.onpointerdown=function(e){ var r=c.judge(e); show(r.diff); };   // タップのずれ（ms、＋が遅い）
*/
(function(){
  var G=window, DS=G.DS=G.DS||{};
  var AC=G.AudioContext||G.webkitAudioContext;
  var LOOK=0.1, LOOK_HIDDEN=1.5, EVERY=25;

  /* ───────── 端末の遅れ（全ツール共通） ───────── */
  var LS='ds_latency', OLD='kotori_calib';
  var latency={
    /* 測った値 {ms, date} か、まだなら null。ことりノームの値があれば引き継ぐ */
    get:function(){
      try{var d=JSON.parse(localStorage.getItem(LS));if(d&&typeof d.ms==='number')return d;}catch(e){}
      try{var k=JSON.parse(localStorage.getItem(OLD));
        if(k&&typeof k.delay==='number'){var v={ms:k.delay,date:k.date||'',from:'ことりノーム'};latency.set(v.ms,v.date,v.from);return v;}}catch(e){}
      return null;
    },
    set:function(ms,date,from){
      var d=new Date();
      var v={ms:Math.round(ms),date:date||((d.getMonth()+1)+'/'+d.getDate()+' '+d.getHours()+':'+('0'+d.getMinutes()).slice(-2))};
      if(from)v.from=from;
      try{localStorage.setItem(LS,JSON.stringify(v));}catch(e){}
      return v;
    },
    clear:function(){try{localStorage.removeItem(LS);}catch(e){}},
    /* 補正に使う値（ms）。測っていなければ、ブラウザが申告する出力の遅れで仮に補正する */
    ms:function(ctx){var d=latency.get();if(d)return d.ms;return ctx&&ctx.outputLatency!=null?ctx.outputLatency*1000:10;},
    /* タップのずれの並び（ms）から補正値を出す。最初の lead 回は除き、ばらつきが大きければ採用しない */
    fromTaps:function(diffs,opt){
      opt=opt||{};var lead=opt.lead!=null?opt.lead:2, limit=opt.sdLimit!=null?opt.sdLimit:70;
      var d=(diffs||[]).slice(lead);
      if(d.length<3) return {ok:false,reason:'回数が足りません'};
      var mean=d.reduce(function(a,b){return a+b;},0)/d.length;
      var sd=Math.sqrt(d.reduce(function(a,b){return a+(b-mean)*(b-mean);},0)/d.length);
      var s=d.slice().sort(function(a,b){return a-b;}), n=s.length, med=n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2;
      if(sd>limit) return {ok:false,reason:'ばらつきが大きすぎます',sd:Math.round(sd),ms:Math.round(med)};
      return {ok:true,ms:Math.round(med),sd:Math.round(sd),count:n};
    }
  };

  /* ───────── 見回りの時計（Worker が使えなければ普通のタイマー） ───────── */
  function makeTimer(fn){
    var w=null, id=null;
    try{
      var src='var id=null;onmessage=function(e){if(e.data==="go"){if(!id)id=setInterval(function(){postMessage(0);},'+EVERY+');}else{clearInterval(id);id=null;}};';
      w=new Worker(URL.createObjectURL(new Blob([src],{type:'text/javascript'})));
      w.onmessage=fn;
    }catch(e){w=null;}
    return {
      start:function(){if(w)w.postMessage('go');else if(!id)id=setInterval(fn,EVERY);},
      stop:function(){if(w)w.postMessage('stop');if(id){clearInterval(id);id=null;}}
    };
  }

  function num(v,d){return (typeof v==='number'&&isFinite(v))?v:d;}
  function swingOf(v){v=num(v,0.5);if(v>1)v=v/100;if(v===0)v=0.5;return Math.min(0.75,Math.max(0.5,v));}
  /* 拍の中で sub 番目の音が、拍の頭から何秒後か。跳ねは偶数の細かさの時だけ、2つずつ組にして長短をつける */
  function offset(sub,div,swing,dur){
    var st=dur/div;
    if(div%2===0&&swing!==0.5){var pair=Math.floor(sub/2);return pair*2*st+(sub%2?2*st*swing:0);}
    return sub*st;
  }
  function beatDur(bpm,meter){return 60/bpm*4/meter[1];}

  /* ───────── 時計 ───────── */
  function create(o){
    o=o||{};
    var S={
      bpm:num(o.bpm,100), meter:(o.meter||[4,4]).slice(), div:Math.max(1,Math.round(num(o.div,1))),
      swing:swingOf(o.swing), groups:o.groups||null, accents:o.accents||null,
      countIn:Math.max(0,Math.round(num(o.countIn,0))), sound:o.sound!==false
    };
    var ctx=o.context||null, handlers={tick:[],draw:[],start:[],stop:[]};
    var timer=makeTimer(pump), running=false, raf=0;
    var segs=[], beatStart=0, beatIdx=0, sub=0, bar=0, beatInBar=0, cur=null, pendBeat={}, pendBar={};
    var drawQ=[], held=[], lastPos=null;

    function audio(){
      if(!ctx) ctx=(DS.sound&&DS.sound.context)?DS.sound.context():new AC();
      if(ctx.state==='suspended'){try{var r=ctx.resume();if(r&&r.catch)r.catch(function(){});}catch(e){}}
      return ctx;
    }
    function snap(){return {bpm:S.bpm,meter:S.meter.slice(),div:S.div,swing:S.swing,groups:S.groups,accents:S.accents,dur:beatDur(S.bpm,S.meter)};}

    /* 小節の中の強さ：2＝小節の頭、1＝区切りの頭（区切りの指定がなければ各拍の頭）、0＝それ以外 */
    function levelOf(c,beat,sb){
      if(c.accents){var v=c.accents[beat*c.div+sb];if(v!=null)return v;}
      if(sb!==0) return 0;
      if(beat===0) return 2;
      if(c.groups){var a=0;for(var i=0;i<c.groups.length;i++){if(a===beat)return 1;a+=c.groups[i];}return 0;}
      return 1;
    }

    function pump(){
      if(!running||!ctx) return;
      var ahead=(G.document&&document.hidden)?LOOK_HIDDEN:LOOK, until=ctx.currentTime+ahead;
      while(true){
        var t=beatStart+offset(sub,cur.div,cur.swing,cur.dur);
        if(t>=until) break;
        var p={bar:bar,beat:beatInBar,sub:sub,time:t,countIn:bar<0,
          head:sub===0,first:sub===0&&beatInBar===0,level:levelOf(cur,beatInBar,sub),
          bpm:cur.bpm,meter:cur.meter.slice(),div:cur.div};
        emitTick(t,p);
        drawQ.push(p);
        sub++;
        if(sub>=cur.div){
          sub=0; beatStart+=cur.dur; beatIdx++; beatInBar++;
          var changed=false, k;
          if(beatInBar>=cur.meter[0]){
            beatInBar=0; bar++;
            for(k in pendBar){cur[k]=pendBar[k];changed=true;} pendBar={};
            if(bar===0&&S.countIn){changed=true;}   /* 本番の頭で区切りを入れ直す（判定の物差しのため） */
          }
          for(k in pendBeat){cur[k]=pendBeat[k];changed=true;} pendBeat={};
          if(changed){cur.dur=beatDur(cur.bpm,cur.meter);segs.push({t:beatStart,b:beatIdx,bar:bar,beat:beatInBar,c:copy(cur)});if(segs.length>64)segs.shift();}
        }
      }
      /* 鳴り終わった分の控えを片付ける */
      var now=ctx.currentTime;held=held.filter(function(h){return h.t>now-0.2;});
    }
    function copy(c){return {bpm:c.bpm,meter:c.meter.slice(),div:c.div,swing:c.swing,groups:c.groups,accents:c.accents,dur:c.dur};}

    function emitTick(t,p){
      var hs=handlers.tick, r;
      if(hs.length){for(var i=0;i<hs.length;i++){r=hs[i](t,p);if(r&&r.stop)held.push({t:t,h:r});}}
      else if(S.sound&&(!p.countIn||p.head)){
        if(DS.sound&&DS.sound.click) r=DS.sound.click(p.level===2,{time:t,vel:p.level>=1?0.8:0.35});
        else r=beep(t,p.level);
        if(r&&r.stop)held.push({t:t,h:r});
      }
    }
    function beep(t,lv){
      var c=ctx,osc=c.createOscillator(),g=c.createGain(),v=lv>=1?0.8:0.35;
      osc.frequency.value=lv===2?1600:1000;g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(0.0001,t+0.06);
      osc.connect(g);g.connect(c.destination);osc.start(t);osc.stop(t+0.07);
      return {stop:function(){try{osc.stop();}catch(e){}}};
    }

    /* 今まさに聞こえている時刻（音の器の時計で）。出力の遅れを差し引く */
    function heardNow(){
      if(!ctx) return 0;
      if(ctx.getOutputTimestamp&&G.performance){
        var ts=ctx.getOutputTimestamp();
        if(ts&&ts.contextTime>0) return ts.contextTime+(performance.now()-ts.performanceTime)/1000;
      }
      return ctx.currentTime-(ctx.outputLatency||ctx.baseLatency||0);
    }
    function frame(){
      raf=0; if(!running) return;
      /* 描き換えは約16msごとなので、半コマ先までを「今」とみなして前後のずれを散らす */
      var now=heardNow()+0.008, due=[];
      while(drawQ.length&&drawQ[0].time<=now) due.push(drawQ.shift());
      /* 画面の裏から戻った時などにたまった分は、最後の1つだけ描く */
      if(due.length>2) due=due.slice(-1);
      for(var i=0;i<due.length;i++){lastPos=due[i];fire('draw',due[i]);}
      raf=requestAnimationFrame(frame);
    }
    function fire(ev,a,b){var hs=handlers[ev]||[];for(var i=0;i<hs.length;i++){try{hs[i](a,b);}catch(e){if(G.console)console.error(e);}}}

    function begin(at,fromBar,fromBeat){
      audio();
      cur=snap(); pendBeat={}; pendBar={}; drawQ=[]; held=[];
      bar=fromBar; beatInBar=fromBeat; sub=0; beatIdx=0;
      beatStart=Math.max(at!=null?at:ctx.currentTime+0.05,ctx.currentTime+0.01);
      segs=[{t:beatStart,b:0,bar:bar,beat:beatInBar,c:copy(cur)}];
      running=true; timer.start(); pump();
      if(!raf&&G.requestAnimationFrame) raf=requestAnimationFrame(frame);
    }
    function halt(){
      running=false; timer.stop();
      if(raf&&G.cancelAnimationFrame){cancelAnimationFrame(raf);raf=0;}
      var now=ctx?ctx.currentTime:0;
      held.forEach(function(h){if(h.t>now-0.001){try{h.h.stop();}catch(e){}}}); held=[];
      drawQ=[];
    }
    function onVis(){if(running)pump();}
    if(G.document) document.addEventListener('visibilitychange',onVis);

    /* 拍の通し番号 → 時刻、時刻 → 位置（判定の物差し） */
    function segFor(t){var s=segs[0];for(var i=1;i<segs.length;i++){if(segs[i].t<=t+1e-9)s=segs[i];else break;}return s;}
    function posAt(t){
      if(!segs.length) return null;
      var s=segFor(t), c=s.c, rel=Math.floor((t-s.t)/c.dur+1e-9), bt=s.beat+rel;
      var bb=s.bar+Math.floor(bt/c.meter[0]); bt=((bt%c.meter[0])+c.meter[0])%c.meter[0];
      var into=t-(s.t+rel*c.dur), sb=0, best=Infinity;
      for(var k=0;k<=c.div;k++){var d=Math.abs(into-offset(k,c.div,c.swing,c.dur));if(d<best){best=d;sb=k;}}
      return {bar:bb,beat:bt,sub:sb,beatTime:s.t+rel*c.dur,c:c};
    }
    function timeOf(b,beat,sb){
      if(!segs.length) return null;
      sb=sb||0;
      for(var i=segs.length-1;i>=0;i--){
        var s=segs[i], c=s.c, rel=(b-s.bar)*c.meter[0]+(beat-s.beat);
        if(rel>=0||i===0) return s.t+rel*c.dur+offset(sb,c.div,c.swing,c.dur);
      }
    }
    /* タップのずれ。e はイベント（pointerdown など）か、音の器の時計での時刻。
       grid：'sub'（細かさの単位で一番近い音）／'beat'（拍の頭）。diff は ms、＋が遅い */
    function judge(e,opt){
      opt=opt||{}; if(!ctx||!segs.length) return null;
      var t;
      if(typeof e==='number') t=e;
      else{
        var ago=(e&&e.timeStamp&&G.performance)?Math.max(0,(performance.now()-e.timeStamp)/1000):0;
        t=ctx.currentTime-ago;
      }
      t-=(opt.latency!=null?opt.latency:latency.ms(ctx))/1000;
      var p=posAt(t), c=p.c, cand=[];
      function add(bb,bt,sb){var tt=timeOf(bb,bt,sb);cand.push({bar:bb,beat:bt,sub:sb,t:tt});}
      var beatSel=opt.grid==='beat';
      [-1,0,1].forEach(function(d){
        var bt=p.beat+d, bb=p.bar;
        if(bt<0){bb--;bt+=c.meter[0];} else if(bt>=c.meter[0]){bb++;bt-=c.meter[0];}
        if(beatSel) add(bb,bt,0); else for(var k=0;k<c.div;k++) add(bb,bt,k);
      });
      cand.sort(function(a,b){return Math.abs(t-a.t)-Math.abs(t-b.t);});
      var r=cand[0]; r.diff=Math.round((t-r.t)*1000); r.countIn=r.bar<0;
      return r;
    }

    var api={
      on:function(ev,fn){if(handlers[ev])handlers[ev].push(fn);return api;},
      off:function(ev,fn){if(handlers[ev])handlers[ev]=fn?handlers[ev].filter(function(f){return f!==fn;}):[];return api;},
      /* 始める。at：音の器の時計での開始時刻（省略時はすぐ）。カウントインがあれば その小節数だけ前から数える */
      start:function(at){if(running)halt();begin(at,-S.countIn,0);fire('start',{time:beatStart});return api;},
      stop:function(){if(!running)return api;halt();lastPos=null;api._resumeAt=null;fire('stop');return api;},
      /* 止めて位置を覚える。resume で次の拍から続ける（カウントインはしない） */
      pause:function(){if(!running)return api;var now=ctx.currentTime, p=posAt(now);halt();api._resumeAt=p?{bar:p.bar,beat:p.beat}:null;fire('stop');return api;},
      resume:function(at){
        var r=api._resumeAt;if(!r)return api.start(at);
        var bt=r.beat+1,bb=r.bar;if(bt>=S.meter[0]){bt=0;bb++;}
        api._resumeAt=null;begin(at,bb,bt);fire('start',{time:beatStart});return api;
      },
      /* 設定を変える。bpm・div・swing は次の拍から、meter・groups・accents は次の小節から */
      set:function(ch){
        ch=ch||{};var b={},m={};
        if(ch.bpm!=null)b.bpm=S.bpm=Math.max(10,Math.min(400,+ch.bpm));
        if(ch.div!=null)b.div=S.div=Math.max(1,Math.round(ch.div));
        if(ch.swing!=null)b.swing=S.swing=swingOf(ch.swing);
        if(ch.meter)m.meter=S.meter=ch.meter.slice();
        if('groups' in ch)m.groups=S.groups=ch.groups;
        if('accents' in ch)m.accents=S.accents=ch.accents;
        if(ch.countIn!=null)S.countIn=Math.max(0,Math.round(ch.countIn));
        if(ch.sound!=null)S.sound=!!ch.sound;
        if(running){for(var k in b)pendBeat[k]=b[k];for(var j in m)pendBar[j]=m[j];}
        return api;
      },
      get:function(){var c=snap();c.countIn=S.countIn;c.sound=S.sound;c.running=running;return c;},
      now:function(){return ctx?ctx.currentTime:0;},
      heard:function(){return lastPos;},        // 最後に聞こえた位置
      posAt:function(t){var p=posAt(t);if(!p)return null;return {bar:p.bar,beat:p.beat,sub:p.sub};},
      timeOf:timeOf,
      judge:judge,
      context:function(){return audio();},
      destroy:function(){halt();if(G.document)document.removeEventListener('visibilitychange',onVis);handlers={tick:[],draw:[],start:[],stop:[]};}
    };
    return api;
  }

  DS.clock={version:'1.0',create:create,latency:latency,beatDur:beatDur,swingOffset:offset};
})();
