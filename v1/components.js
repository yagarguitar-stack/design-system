/* yagarguitar-stack 共通デザイン v1 — 画面の部品（components.js）
   components.css と一緒に読み込む。部品は HTML に書いておき、DS.ui.init() で整える（読み込み時に自動で1回行う）。

   モチーフ：一番外の要素に <div class="ds-ui ds-score"> か <div class="ds-ui ds-plan">
     楽譜の紙の足元の文字：data-ds-foot="百合ヶ丘ギター教室"
     設計図の表題欄：data-ds-title="メトロノーム" data-ds-dwg="MT-01" data-ds-scale="1 : 1"

   部品（書き方の例は README と components-demo.html）
     <header class="ds-hd"><h1 class="ds-ttl">題</h1><p class="ds-sub">副題</p></header>
     <section class="ds-sec"><h2 class="ds-sh">見出し</h2> … </section>      番号（A B C…／1 2 3…）は自動
     <button class="ds-btn ds-big">スタート</button>                          大きなボタン
     <div class="ds-btnbar"><button class="ds-btn">設定</button>…</div>        ボタンを並べる
     <button class="ds-btn ds-danger" data-ds-hold="長押しで削除します">削除</button>   1秒押し続けると 'ds-hold' が起きる
     <div class="ds-choice" data-ds-value="1"><button value="1">4分</button>…</div>     1つ選ぶ（'change'）
     <label class="ds-toggle"><input type="checkbox" checked>ドラム</label>            オン・オフ
     <div class="ds-tempo" data-bpm="120" data-min="30" data-max="240" data-beats="4"></div>  テンポ（'change'）
     <div class="ds-slider" data-value="70" data-min="0" data-max="100" data-ds-dyn aria-label="音量"></div>
     <label class="ds-field"><span data-alt="Titolo" data-alt-plan="NAME">曲名</span><input value=""></label>
     <div class="ds-list"></div> → DS.ui.list(el, [{title, sub, value, date}], {onPick})
     <div class="ds-sheet" id="set" data-ds-title="設定"> … </div>  → DS.ui.sheet('#set').open()／data-ds-open="#set"
   お知らせ：DS.ui.toast(ツールの要素, '保存しました')、赤字は {ng:true}
   効果音：sound.js があれば DS.sound.ui を使って鳴る。DS.ui.sound(false) で止める（覚えておく）
*/
(function(){
  var G=window,DS=G.DS=G.DS||{};
  var reduce=G.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  var QN='<svg viewBox="0 0 16 40" aria-hidden="true"><ellipse cx="6.5" cy="33.5" rx="6" ry="4.4" transform="rotate(-22 6.5 33.5)" fill="currentColor"/><rect class="ds-stem" x="11" y="2" width="1.5" height="31" fill="currentColor"/></svg>';
  var SW='<svg class="ds-tg" viewBox="0 0 46 20" aria-hidden="true"><path d="M0 10H10M36 10H46" stroke="currentColor" stroke-width="1.25"/><circle cx="12" cy="10" r="2.2" fill="none" stroke="currentColor" stroke-width="1.25"/><circle cx="34" cy="10" r="2.2" fill="none" stroke="currentColor" stroke-width="1.25"/><path class="ds-lever" d="M14 10H32" stroke="currentColor" stroke-width="1.6"/></svg>';
  function h(tag,cls,html){var e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e;}
  function rootOf(el){return el&&el.closest?el.closest('.ds-ui'):null;}
  function motif(el){var r=rootOf(el)||el;return r&&r.classList.contains('ds-plan')?'plan':'score';}
  function pad2(n){return String(n).padStart(2,'0');}
  function fire(el,type,detail){el.dispatchEvent(new CustomEvent(type,{bubbles:true,detail:detail}));}

  /* ───── 効果音 ───── */
  var soundOn=true;try{soundOn=localStorage.getItem('ds_ui_sound')!=='0';}catch(e){}
  function sfx(n){if(soundOn&&DS.sound&&DS.sound.ui){try{DS.sound.ui(n);}catch(e){}}}
  function sound(v){if(v!=null){soundOn=!!v;try{localStorage.setItem('ds_ui_sound',soundOn?'1':'0');}catch(e){}}return soundOn;}

  /* ───── 文字がほどけて現れる ───── */
  var GLY='アイウエオカキクケコサシスセソ◆◇■□0123456789';
  function decode(el,text){if(!el)return;if(reduce){el.textContent=text;return;}var t0=performance.now(),d=320;
    (function f(now){var k=Math.min(1,(now-t0)/d),n=Math.floor(text.length*k),s=text.slice(0,n);
      for(var i=n;i<text.length;i++)s+=text[i]===' '?' ':GLY[Math.floor(Math.random()*GLY.length)];el.textContent=s;if(k<1)requestAnimationFrame(f);})(t0);}

  /* ───── お知らせ ───── */
  function toast(el,text,o){o=o||{};var r=rootOf(el)||el;if(!r)return;var t=r.querySelector(':scope>.ds-toast');
    if(!t){t=h('div','ds-toast');t.setAttribute('role','status');r.appendChild(t);}
    t.classList.toggle('ds-ng',!!o.ng);t.classList.add('ds-show');decode(t,text);clearTimeout(t._h);
    t._h=setTimeout(function(){t.classList.remove('ds-show');},o.ms||1700);}

  /* ───── 枠と飾り ───── */
  function frame(r){
    if(r.querySelector(':scope>.ds-deco'))return;
    if(motif(r)==='score'){
      r.insertBefore(h('div','ds-deco ds-brk','<i></i><i></i>'),r.firstChild);
      r.insertBefore(h('div','ds-deco ds-fin'),r.firstChild);
      var ft=r.getAttribute('data-ds-foot');if(ft!=null){var f=h('div','ds-deco ds-foot');f.appendChild(h('span',null)).textContent=ft;f.appendChild(h('i',null,'— '+(r.getAttribute('data-ds-page')||'1')+' —'));r.appendChild(f);}
    }else{
      r.insertBefore(h('div','ds-deco ds-frame'),r.firstChild);r.insertBefore(h('div','ds-deco ds-edge'),r.firstChild);
      ['a','b','c','d'].forEach(function(k){r.insertBefore(h('i','ds-deco ds-crop '+k),r.firstChild);});
      if(r.hasAttribute('data-ds-title')){var tb=h('div','ds-deco ds-tb');
        [['TITLE','data-ds-title',1],['DWG No.','data-ds-dwg'],['SCALE','data-ds-scale']].forEach(function(c){var d=h('div');d.appendChild(h('small')).textContent=c[0];var v=r.getAttribute(c[1])||'';if(c[2]){d.appendChild(h('b')).textContent=v;}else d.appendChild(document.createTextNode(v));tb.appendChild(d);});
        r.appendChild(tb);}
    }
  }

  /* ───── ボタン ───── */
  function button(b){
    if(b._ds)return;b._ds=1;var M=motif(b);
    if(b.classList.contains('ds-big')){
      if(!b.querySelector('.ds-tx')){var tx=h('span','ds-tx');while(b.firstChild)tx.appendChild(b.firstChild);b.appendChild(tx);}
      if(M==='score'){b.insertBefore(h('span','ds-bl l'),b.firstChild);b.appendChild(h('span','ds-bl r'));}
      else{b.insertBefore(h('i','ds-cl'),b.firstChild);['a','b','c','d'].forEach(function(k){b.appendChild(h('i','ds-tk '+k));});}
    }
    var hold=b.hasAttribute('data-ds-hold');
    b.addEventListener('pointerdown',function(e){if(b.disabled)return;b.classList.add('ds-dn');if(!hold)sfx(b.classList.contains('ds-big')?'big':'tap');});
    function up(){setTimeout(function(){b.classList.remove('ds-dn');},110);}
    b.addEventListener('pointerup',up);b.addEventListener('pointerleave',function(){b.classList.remove('ds-dn');});b.addEventListener('pointercancel',function(){b.classList.remove('ds-dn');});
    if(b.hasAttribute('data-ds-open'))b.addEventListener('click',function(){sheet(b.getAttribute('data-ds-open')).open();});
    if(b.hasAttribute('data-ds-close'))b.addEventListener('click',function(){var s=b.closest('.ds-sheet');if(s)sheet(s).close();});
    if(hold){var ht=null,held=false,t0=0;
      b.addEventListener('pointerdown',function(){if(b.disabled)return;held=false;t0=performance.now();b.classList.add('ds-holding');sfx('tap');
        ht=setTimeout(function(){held=true;b.classList.remove('ds-holding');sfx('del');if(navigator.vibrate)try{navigator.vibrate(20);}catch(e){}fire(b,'ds-hold');},1000);});
      function cancel(){clearTimeout(ht);b.classList.remove('ds-holding');}
      b.addEventListener('pointerup',function(){cancel();if(!held&&performance.now()-t0<600){sfx('ng');b.classList.remove('ds-shake');void b.offsetWidth;b.classList.add('ds-shake');
        toast(b,b.getAttribute('data-ds-hold')||'1秒ほど押し続けてください',{ng:true});}});
      b.addEventListener('pointerleave',cancel);b.addEventListener('contextmenu',function(e){e.preventDefault();});
      b.addEventListener('keydown',function(e){if(e.key==='Enter'&&e.repeat)return;});}
  }
  /* 大きなボタンの文字を替える（文字がほどけて変わる）。押した状態にするなら pressed:true */
  function label(b,text,o){o=o||{};decode(b.querySelector('.ds-tx')||b,text);if(o.pressed!=null)b.setAttribute('aria-pressed',o.pressed?'true':'false');}

  /* ───── 1つ選ぶ ───── */
  function choice(el){
    if(typeof el==='string')el=document.querySelector(el);if(!el)return null;
    if(el._dsc)return el._dsc;var M=motif(el),bs=Array.prototype.slice.call(el.querySelectorAll(':scope>button')),n=bs.length;
    el.setAttribute('role','radiogroup');
    var mk=h('div','ds-mk',M==='score'?QN:'');mk.style.width=(100/n)+'%';el.appendChild(mk);
    bs.forEach(function(b,i){b.setAttribute('role','radio');if(!b.hasAttribute('value'))b.value=String(i);
      if(M==='plan'){var t=b.textContent;b.innerHTML='';b.appendChild(h('b')).textContent=pad2(i+1);b.appendChild(h('span')).textContent=t;}});
    var cur=-1;
    function set(i,silent){i=Math.max(0,Math.min(n-1,i));if(i===cur)return;var first=cur<0;cur=i;
      bs.forEach(function(b,k){b.setAttribute('aria-checked',k===i?'true':'false');b.tabIndex=k===i?0:-1;});
      if(M==='score'&&!first){mk.classList.add('ds-go');void mk.offsetWidth;setTimeout(function(){mk.classList.remove('ds-go');},200);}
      mk.style.transform='translateX('+(i*100)+'%)';
      if(!silent){sfx('select');fire(el,'change',{index:i,value:bs[i].value});}}
    bs.forEach(function(b,i){b.addEventListener('click',function(){set(i);});});
    el.addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key==='ArrowDown'){e.preventDefault();set(cur+1);bs[cur].focus();}
      else if(e.key==='ArrowLeft'||e.key==='ArrowUp'){e.preventDefault();set(cur-1);bs[cur].focus();}});
    var init=el.getAttribute('data-ds-value'),ii=0;bs.forEach(function(b,k){if(init!=null&&b.value===init)ii=k;});set(ii,true);
    el._dsc={set:function(i){set(i,true);},get index(){return cur;},get value(){return bs[cur].value;}};return el._dsc;
  }

  /* ───── オン・オフ ───── */
  function toggle(l,no){if(l._ds)return;l._ds=1;var inp=l.querySelector('input');if(!inp)return;
    if(motif(l)==='score'){var s=h('span','ds-tg');s.setAttribute('aria-hidden','true');inp.parentNode.insertBefore(s,inp.nextSibling);}
    else{var t=document.createElement('template');t.innerHTML=SW+'<small>SW'+no+'</small>';inp.parentNode.insertBefore(t.content,inp.nextSibling);}
    inp.addEventListener('change',function(){sfx(inp.checked?'on':'off');});}

  /* ───── テンポ ───── */
  function termOf(b){return b<60?'Largo':b<66?'Larghetto':b<76?'Adagio':b<108?'Andante':b<120?'Moderato':b<156?'Allegro':b<176?'Vivace':b<200?'Presto':'Prestissimo';}
  function tempo(el){
    if(typeof el==='string')el=document.querySelector(el);if(!el)return null;if(el._dst)return el._dst;
    var S=motif(el)==='score',min=+(el.getAttribute('data-min')||30),max=+(el.getAttribute('data-max')||240),beats=+(el.getAttribute('data-beats')||4);
    var bpm=+(el.getAttribute('data-bpm')||120),shown=bpm,subs=[],noTerm=el.getAttribute('data-ds-term')==='off';
    var html;
    if(S){html=(noTerm?'':'<div class="ds-term"></div>')+'<div class="ds-trow"><div class="ds-mm">'+QN.replace('class="ds-stem" ','')+'<span class="ds-eq">=</span><span class="ds-bpm ds-num"></span></div>'+
        '<div style="display:flex;gap:8px"><button class="ds-btn ds-step" data-d="-1" aria-label="テンポを下げる">−</button><button class="ds-btn ds-step" data-d="1" aria-label="テンポを上げる">＋</button></div></div>'+
        '<div class="ds-lane"><span class="ds-ln"></span><span class="ds-done"></span>';
      for(var i=0;i<beats;i++)html+=QN.replace('<svg','<svg style="left:calc(14px + '+i+' * (100% - 28px) / '+beats+' - 6.5px)"').replace('class="ds-stem" ','');
      html+='<span class="ds-ph"></span></div>';}
    else{html='<div class="ds-trow"><button class="ds-btn ds-step" data-d="-1" aria-label="テンポを下げる">−</button><div class="ds-dim"><span class="ds-ex l"></span><span class="ds-ex r"></span><span class="ds-ln"></span><span class="ds-cap">'+(el.getAttribute('data-ds-cap')||'テンポ')+'</span><div class="ds-bpm ds-num"></div><div class="ds-u">BPM</div></div><button class="ds-btn ds-step" data-d="1" aria-label="テンポを上げる">＋</button></div>'+
        (noTerm?'':'<div class="ds-term"></div>')+'<div class="ds-lane" style="--ds-beats:'+beats+'">';
      for(var j=0;j<beats;j++)html+='<i></i>';html+='<span class="ds-trk"></span><span class="ds-ph"></span></div>';}
    el.innerHTML=html;
    var num=el.querySelector('.ds-bpm'),term=el.querySelector('.ds-term'),lane=el.querySelector('.ds-lane'),ph=lane.querySelector('.ds-ph'),done=lane.querySelector('.ds-done');
    var marks=lane.querySelectorAll(S?'svg':'i');
    el.querySelectorAll('.ds-step').forEach(function(b){button(b);b.addEventListener('click',function(){set(bpm+(+b.getAttribute('data-d')),true);});});
    num.setAttribute('role','button');num.setAttribute('tabindex','0');num.setAttribute('aria-label','テンポを入力');num.title='押すと数字を入れられます';
    function paint(){num.textContent=shown;if(term)term.textContent=termOf(bpm);}
    var rollT=0;
    function set(v,user){v=Math.round(Math.max(min,Math.min(max,v)));if(v===bpm&&!user){paint();return;}var from=shown,to=v,t0=performance.now(),dur=reduce?0:220;
      if(run&&!follow){var bar0=60000/bpm*beats,p0=((performance.now()-start0)%bar0)/bar0;start0=performance.now()-p0*60000/v*beats;}
      bpm=v;cancelAnimationFrame(rollT);
      (function f(now){var k=dur?Math.min(1,(now-t0)/dur):1;shown=Math.round(from+(to-from)*(1-Math.pow(1-k,3)));paint();if(k<1)rollT=requestAnimationFrame(f);})(t0);
      if(user)fire(el,'change',{bpm:bpm});subs.forEach(function(f){f(bpm);});}
    function edit(){
      if(el.querySelector('.ds-bpmin'))return;
      var inp=h('input','ds-bpmin');inp.type='text';inp.inputMode='numeric';inp.maxLength=3;inp.value=bpm;inp.setAttribute('aria-label','テンポ（'+min+'〜'+max+'）');
      var hint=h('div','ds-hint');hint.textContent=S?min+' – '+max+'　Enter で決定':min+'–'+max+' / ENTER';
      num.style.display='none';num.parentNode.insertBefore(inp,num.nextSibling);var row=el.querySelector('.ds-trow');row.parentNode.insertBefore(hint,row.nextSibling);
      sfx('tap');inp.focus();inp.select();var fin=false;
      function finish(ok){if(fin)return;fin=true;var v=parseInt(String(inp.value).replace(/[０-９]/g,function(c){return String.fromCharCode(c.charCodeAt(0)-65248);}),10);
        inp.remove();hint.remove();num.style.display='';if(!ok)return;
        if(isNaN(v)){sfx('ng');num.classList.remove('ds-shake');void num.offsetWidth;num.classList.add('ds-shake');toast(el,'数字で入れてください',{ng:true});return;}
        if(v<min||v>max){v=Math.max(min,Math.min(max,v));sfx('ng');toast(el,v+' にしました（'+min+'〜'+max+'）',{ng:true});}else sfx('select');
        set(v,true);}
      inp.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();finish(true);}else if(e.key==='Escape'){finish(false);}});
      inp.addEventListener('input',function(){inp.value=inp.value.replace(/[^0-9０-９]/g,'');});
      inp.addEventListener('blur',function(){finish(true);});}
    num.addEventListener('click',edit);num.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();edit();}});
    /* 拍の表示と再生の線。start() は画面だけで刻む。follow(時計) は clock.js の時計に合わせて動く */
    var run=false,raf=0,start0=0,last=-1,follow=null;
    function draw(p){var b=Math.floor(p*beats);
      ph.style.left=S?'calc(14px + '+p+' * (100% - 28px))':(p*100)+'%';if(done)done.style.width='calc(14px + '+p+' * (100% - 28px))';
      if(b!==last){marks.forEach(function(x,i){x.classList.toggle('ds-now',i===b);});last=b;}}
    function heard(c){if(c.getOutputTimestamp){var ts=c.getOutputTimestamp();if(ts&&ts.contextTime>0)return ts.contextTime+(performance.now()-ts.performanceTime)/1000;}return c.currentTime-(c.outputLatency||0);}
    function frame(now){
      if(follow){var c=follow.context(),t=heard(c),p=follow.posAt(t);
        if(p&&p.bar>=0){var tb=follow.timeOf(p.bar,p.beat,0),tn=follow.timeOf(p.bar,p.beat+1,0),fr=Math.max(0,Math.min(.999,(t-tb)/(tn-tb)));draw(((p.beat+fr)%beats)/beats);}}
      else{var bar=60000/bpm*beats;draw(((now-start0)%bar)/bar);}
      raf=requestAnimationFrame(frame);}
    function start(clk){if(run)stop();run=true;follow=clk||null;start0=performance.now();last=-1;lane.classList.add('ds-on');raf=requestAnimationFrame(frame);}
    function stop(){run=false;follow=null;cancelAnimationFrame(raf);lane.classList.remove('ds-on');marks.forEach(function(x){x.classList.remove('ds-now');});if(done)done.style.width='0';last=-1;}
    paint();
    el._dst={get bpm(){return bpm;},set:function(v){set(v,false);},onChange:function(f){subs.push(f);},start:function(){start(null);},follow:function(clk){start(clk);},stop:stop,get playing(){return run;}};
    return el._dst;
  }

  /* ───── つまみ ───── */
  function dynOf(t){return t<.15?'pp':t<.35?'p':t<.5?'mp':t<.65?'mf':t<.85?'f':'ff';}
  function slider(el){
    if(typeof el==='string')el=document.querySelector(el);if(!el)return null;if(el._dss)return el._dss;
    var S=motif(el)==='score',min=+(el.getAttribute('data-min')||0),max=+(el.getAttribute('data-max')||100),val=+(el.getAttribute('data-value')||min),dyn=el.hasAttribute('data-ds-dyn');
    el.setAttribute('role','slider');el.tabIndex=0;el.setAttribute('aria-valuemin',min);el.setAttribute('aria-valuemax',max);
    var box=h('div'),sv=h('div','ds-sv');el.appendChild(box);el.appendChild(sv);
    function svg(t){
      if(S){var x=40+240*t,hh=14*t;return '<svg viewBox="0 0 320 56"><text class="ds-dyn" x="4" y="34">'+(dyn?'pp':'')+'</text><text class="ds-dyn" x="290" y="34">'+(dyn?'ff':'')+'</text>'+
        '<path d="M40 28L280 14M40 28L280 42" stroke="currentColor" stroke-width="1.2" fill="none"/><polygon points="40,28 '+x+','+(28-hh)+' '+x+','+(28+hh)+'" fill="currentColor" opacity=".18"/>'+
        '<line x1="'+x+'" y1="'+(28-hh-7)+'" x2="'+x+'" y2="'+(28+hh+7)+'" stroke="var(--ds-accent)" stroke-width="2"/></svg>';}
      var x2=20+280*t,tk='';for(var i=0;i<=50;i++){var xx=20+280*i/50,mj=i%5===0,bg=i%25===0;tk+='<line x1="'+xx+'" y1="20" x2="'+xx+'" y2="'+(20-(bg?12:mj?8:4))+'" stroke="currentColor" stroke-width="'+(bg?1.2:.8)+'"/>';
        if(bg)tk+='<text x="'+xx+'" y="44" text-anchor="middle" font-size="9" font-family="IBM Plex Mono,monospace" fill="currentColor" opacity=".75">'+Math.round(min+(max-min)*i/50)+'</text>';}
      return '<svg viewBox="0 0 320 56"><line x1="20" y1="20" x2="300" y2="20" stroke="currentColor" stroke-width="1"/>'+tk+'<line x1="20" y1="21.5" x2="'+x2+'" y2="21.5" stroke="var(--ds-accent)" stroke-width="2.5"/><polygon points="'+x2+',23 '+(x2-5)+',32 '+(x2+5)+',32" fill="var(--ds-accent)"/></svg>';}
    function set(v,how){v=Math.round(Math.max(min,Math.min(max,v)));var t=(v-min)/(max-min||1);val=v;box.innerHTML=svg(t);el.setAttribute('aria-valuenow',v);
      sv.textContent=S?(dyn?dynOf(t)+'　（'+v+'）':String(v)):(el.getAttribute('aria-label')?'':'')+(dyn?'VOL ':'')+String(v).padStart(3,'0');
      if(how)fire(el,how,{value:v});}
    function at(e){var r=el.getBoundingClientRect(),x=(e.clientX-r.left)*320/r.width,t=S?(x-40)/240:(x-20)/280;return min+(max-min)*t;}
    var drag=false;
    el.addEventListener('pointerdown',function(e){el.setPointerCapture(e.pointerId);drag=true;set(at(e),'input');});
    el.addEventListener('pointermove',function(e){if(drag)set(at(e),'input');});
    el.addEventListener('pointerup',function(){if(!drag)return;drag=false;sfx('select');fire(el,'change',{value:val});});
    el.addEventListener('keydown',function(e){var st=(max-min)/20;if(e.key==='ArrowRight'||e.key==='ArrowUp'){e.preventDefault();set(val+st,'change');}else if(e.key==='ArrowLeft'||e.key==='ArrowDown'){e.preventDefault();set(val-st,'change');}});
    set(val);
    el._dss={get value(){return val;},set:function(v){set(v);}};return el._dss;
  }

  /* ───── 入力欄 ───── */
  function field(l){if(l._ds)return;l._ds=1;var lab=l.querySelector(':scope>span'),inp=l.querySelector('input,textarea');if(!inp)return;
    if(lab){lab.classList.add('ds-fl');var alt=lab.getAttribute(motif(l)==='plan'?'data-alt-plan':'data-alt');if(alt){lab.setAttribute('aria-hidden','true');inp.setAttribute('aria-label',lab.textContent);lab.textContent=alt;}}   // 見出しの別の書き方：楽譜の紙は data-alt、設計図は data-alt-plan
    if(motif(l)==='score')l.appendChild(h('span','ds-ul'));else{l.appendChild(h('i','ds-tk a'));l.appendChild(h('i','ds-tk d'));}}

  /* ───── 一覧 ───── */
  function list(el,items,o){
    if(typeof el==='string')el=document.querySelector(el);if(!el)return;o=o||{};var S=motif(el)==='score';el.innerHTML='';el.classList.add('ds-list');
    if(!items||!items.length){el.appendChild(h('div','ds-empty')).textContent=o.empty||'まだ記録がありません';return;}
    if(!S){var hd=h('div','ds-lh');(o.cols||['NO.','名称','値','日付']).forEach(function(c){hd.appendChild(h('span')).textContent=c;});el.appendChild(hd);}
    items.forEach(function(it,i){var r=h(S?'button':'div','ds-rec');r.setAttribute('role','button');r.tabIndex=0;
      if(S){r.appendChild(h('i')).textContent=i+1;var b=h('b');b.textContent=it.title||'';if(it.sub||it.date){b.appendChild(h('small')).textContent=it.sub||it.date;}r.appendChild(b);r.appendChild(h('span')).textContent=it.value==null?'':it.value;}
      else{[[pad2(i+1),'n'],[it.title||''],[it.value==null?'':it.value,'r'],[it.date||'','r']].forEach(function(c){var s=h('span',c[1]||null);s.textContent=c[0];r.appendChild(s);});}
      r.addEventListener('pointerdown',function(){r.classList.add('ds-dn');sfx('tap');});
      r.addEventListener('pointerleave',function(){r.classList.remove('ds-dn');});
      function pick(){setTimeout(function(){r.classList.remove('ds-dn');},140);if(o.onPick)o.onPick(it,i);}
      r.addEventListener('pointerup',pick);r.addEventListener('keydown',function(e){if(e.key==='Enter'){pick();}});
      el.appendChild(r);});
  }

  /* ───── 設定の引き出し ───── */
  function sheet(el){
    if(typeof el==='string')el=document.querySelector(el);if(!el)return null;if(el._dsh)return el._dsh;
    var r=rootOf(el),veil=h('div','ds-veil');r.appendChild(veil);veil.appendChild(el);el.classList.add('ds-inveil');
    el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');
    if(el.hasAttribute('data-ds-title')&&!el.querySelector(':scope>.ds-st')){var st=h('h2','ds-st');st.textContent=el.getAttribute('data-ds-title');
      if(el.hasAttribute('data-ds-sub')&&motif(el)==='plan')st.appendChild(h('small')).textContent=el.getAttribute('data-ds-sub');el.insertBefore(st,el.firstChild);}
    var last=null;
    function open(){last=document.activeElement;veil.classList.add('ds-open');sfx('open');var f=el.querySelector('button,input,[tabindex="0"]');if(f)setTimeout(function(){f.focus({preventScroll:true});},60);fire(el,'ds-open');}
    function close(){if(!veil.classList.contains('ds-open'))return;veil.classList.remove('ds-open');sfx('close');if(last&&last.focus)last.focus({preventScroll:true});fire(el,'ds-close');}
    veil.addEventListener('click',function(e){if(e.target===veil)close();});
    el.addEventListener('keydown',function(e){if(e.key==='Escape')close();});
    el._dsh={open:open,close:close,get isOpen(){return veil.classList.contains('ds-open');}};return el._dsh;
  }

  /* ───── 画面が開く時 ───── */
  function enter(r){r.classList.remove('ds-enter');void r.offsetWidth;r.classList.add('ds-enter');var t=r.querySelector('.ds-ttl');if(t)decode(t,t.textContent);setTimeout(function(){r.classList.remove('ds-enter');},1400);}

  /* ───── まとめて整える ───── */
  function init(root){
    var roots=root?[root]:Array.prototype.slice.call(document.querySelectorAll('.ds-ui'));
    roots.forEach(function(r){
      if(r._dsr)return;r._dsr=1;frame(r);
      r.querySelectorAll('.ds-sheet').forEach(function(s){sheet(s);});
      r.querySelectorAll('.ds-btn').forEach(button);
      r.querySelectorAll('.ds-choice').forEach(choice);
      var no=0;r.querySelectorAll('.ds-toggle').forEach(function(l){toggle(l,++no);});
      r.querySelectorAll('.ds-tempo').forEach(tempo);
      r.querySelectorAll('.ds-slider').forEach(slider);
      r.querySelectorAll('.ds-field').forEach(field);
      if(r.getAttribute('data-ds-enter')!=='off')enter(r);
    });
  }
  DS.ui={version:'1.0',init:init,toast:toast,sheet:sheet,choice:choice,tempo:tempo,slider:slider,list:list,label:label,enter:enter,decode:decode,sound:sound,sfx:sfx,termOf:termOf};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){init();});else init();
})();
