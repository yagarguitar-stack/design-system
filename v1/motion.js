/* yagarguitar-stack 共通デザイン v1 — 押したときの動き（motion.css とセットで使う）
   ・大きなボタン：class="ds-shine" か、DS.use({shine:'.btn-brass'}) で指定
   ・札：DS.open(札, URL) で「裏返ってから開く」／DS.flip(要素) で裏返るだけ
   ・注意のボタン：class="ds-hold" を付けると、1秒の長押しで確定。軽く押すと案内が出る */
(function(){
  var DS=window.DS=window.DS||{};
  var HOLD_MS=1000;
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  var shineSel='.ds-shine';
  function again(el,c){el.classList.remove(c);void el.offsetWidth;el.classList.add(c);}
  function near(e,sel){return e.target&&e.target.closest?e.target.closest(sel):null;}

  /* ツールごとの指定：既存のボタンに動きを当てる */
  DS.use=function(o){
    if(o&&o.shine){
      shineSel+=','+o.shine;
      var st=document.createElement('style');
      st.textContent=o.shine+'{position:relative;overflow:hidden;transition:transform .08s,box-shadow .08s;}'+
        o.shine.split(',').map(function(s){return s+':active';}).join(',')+'{transform:translateY(3px);box-shadow:0 0 0 transparent;}';
      document.head.appendChild(st);
    }
  };

  /* 大きなボタン：光が走る */
  document.addEventListener('pointerdown',function(e){var b=near(e,shineSel);if(b&&!reduce)again(b,'ds-shine-go');},true);

  /* 札：裏返る */
  DS.flip=function(el){return new Promise(function(res){
    if(reduce||!el){res();return;}
    again(el,'ds-flip-go');setTimeout(function(){el.classList.remove('ds-flip-go');res();},400);
  });};
  DS.open=function(el,url){DS.flip(el).then(function(){var w=window.open(url,'_blank');if(!w)location.href=url;});};

  /* 注意のボタン：長押しで確定 */
  var cur=null,timer=null;
  function stop(){if(cur)cur.classList.remove('ds-holding');cur=null;clearTimeout(timer);}
  function bubble(b,msg){
    var r=b.getBoundingClientRect(),d=document.createElement('div');
    d.className='ds-bubble';d.textContent=msg;d.style.left=(r.left+r.width/2)+'px';d.style.top=(r.top-8)+'px';
    document.body.appendChild(d);setTimeout(function(){d.remove();},1650);
  }
  document.addEventListener('pointerdown',function(e){
    var b=near(e,'.ds-hold');if(!b||b.disabled)return;
    stop();cur=b;b.style.setProperty('--ds-hold-ms',HOLD_MS+'ms');b.classList.add('ds-holding');
    b.addEventListener('pointerleave',stop,{once:true});
    timer=setTimeout(function(){
      var t=cur;stop();if(!t)return;
      t.dataset.dsSkip='1';setTimeout(function(){delete t.dataset.dsSkip;},700);
      if(navigator.vibrate)try{navigator.vibrate(25);}catch(_){}
      t.click();
    },HOLD_MS);
  },true);
  document.addEventListener('pointerup',stop,true);
  document.addEventListener('pointercancel',stop,true);
  document.addEventListener('contextmenu',function(e){if(near(e,'.ds-hold'))e.preventDefault();},true);
  document.addEventListener('click',function(e){
    var b=near(e,'.ds-hold');if(!b)return;
    if(e.detail===0)return;                                   /* 長押しの確定・キーボード操作は通す */
    e.preventDefault();e.stopImmediatePropagation();
    if(b.dataset.dsSkip){delete b.dataset.dsSkip;return;}     /* 長押し直後に指を離した分は無視 */
    again(b,'ds-shake');bubble(b,'長押しで確定します');
  },true);
})();
