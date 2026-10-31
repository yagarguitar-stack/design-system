/* ══════════════════════════════════════════════════════════════
   ScoreLine の道具どうしの行き来（共通）— design-system v1/scoreline-link.js
   ScoreLine TAB・Lead・Compass が、今の曲を持って互いに移るための部品。

   L様——「同ツールの中から行き来したい」「移る時は今の曲を持って移る」
          「同じ曲をもう一度持っていった時は、移るたびに尋ねる」。

   ══ 流れ ══
     移る側   … 自分の曲を「共通の曲」（下の形）に直し、carry(相手, 共通の曲) で預けて移る
     受ける側 … 起動の終わりに take(自分) で受け取り、自分の曲の形に直して開く
   三つは同じ住所（yagarguitar-stack.github.io）の下にあるので、端末の控えを共にできる。

   ══ 共通の曲の形（v:1）══
     { v, from, link, title, key:{root,qual}, ts:{n,d}, bpm, capo, tuning,
       secs:[{name,n}],                     … 区切りの名と小節の数（並び順）
       bars:[{ ts:{n,d}|null,               … その小節だけの拍子（無ければ曲の拍子）
               chords:[{tick,root,type,bass}],  … type は TAB・Lead の種類の名
               lyric:'',                    … 小節の歌詞（一行の文字）
               notes:[…]|null }],           … メロディ（TAB の形）。持たない道具は null
       melody:bool }                        … メロディを持ってきたか（Lead からは false）
     音符の形は TAB と同じ：{start,len,kind:'chord'|'rest',stops:[{s,f,t}],sym,lyric}
     タイは「出ていく側」の t.tie=true（TAB の決まり）。Compass は「受ける側」の
     t.link='tie' なので、出し入れの時に noteTiesToCompass / noteTiesFromCompass で付け替える。

   ══ 同じ曲の見分け ══
   移る時、元の曲に「繋ぎの印」（link）を付ける。受けた側で作った曲にも同じ印を付ける。
   次に同じ曲を持っていけば、印で見つけて「書き換える／新しい曲として足す」を尋ねる。
   ══════════════════════════════════════════════════════════════ */
(function(){
const KEY='scoreline.carry.v1';
const FRESH_MS=10*60*1000;                 /* 預けてから10分を過ぎた物は受け取らない */
const BASE='https://yagarguitar-stack.github.io/';
const TOOLS=[
  { id:'tab',     name:'ScoreLine TAB',     url:BASE+'ScoreLineTab/',     note:'TAB譜' },
  { id:'lead',    name:'ScoreLine Lead',    url:BASE+'ScoreLineLead/',    note:'コード譜' },
  { id:'compass', name:'ScoreLine Compass', url:BASE+'ScoreLineCompass/', note:'作曲' }
];
function tool(id){ return TOOLS.find(t=>t.id===id)||null; }
function newLink(){ return 'sl'+Date.now().toString(36)+Math.random().toString(36).slice(2,8); }

/* 預ける・受け取る */
function carry(to,cs){
  const t=tool(to); if(!t) return false;
  try{ localStorage.setItem(KEY,JSON.stringify({to,at:Date.now(),cs})); }
  catch(e){ return false; }
  location.href=t.url+'#sl-carry';
  return true;
}
function take(me){
  let o=null;
  try{ o=JSON.parse(localStorage.getItem(KEY)||'null'); }catch(_){ o=null; }
  if(!o||o.to!==me||!o.cs) return null;
  try{ localStorage.removeItem(KEY); }catch(_){}
  try{ if(location.hash==='#sl-carry') history.replaceState(null,'',location.pathname+location.search); }catch(_){}
  if(Date.now()-(o.at||0)>FRESH_MS) return null;
  return o.cs;
}

/* ══ コード名（Compass は文字で持つ）══
   TAB・Lead の種類の名 ⇄ Compass の書き方。Compass に無い種類は近い物へ寄せる。 */
const ROOT_NAMES=['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
const TO_CMP={ maj:'', min:'m', dom7:'7', maj7:'maj7', min7:'m7', dom9:'9', maj9:'maj9', min9:'m9',
  dim:'dim', aug:'aug', sus2:'sus2', sus4:'sus4', dom7sus4:'7sus4', m7b5:'m7b5', dim7:'dim7',
  aug7:'aug', minMaj7:'mM7', dom7b9:'7', dom7s9:'7', dom7s11:'7', dom13:'9', alt:'7',
  add9:'add9', dom6:'6', min6:'m6', min11:'m9', dom9sus4:'7sus4', maj7s11:'maj7', dom11:'9' };
const FROM_CMP={ '':'maj', 'm':'min', '7':'dom7', 'maj7':'maj7', 'M7':'maj7', 'mM7':'minMaj7',
  'm7b5':'m7b5', 'm7-5':'m7b5', 'dim7':'dim7', 'dim':'dim', 'aug':'aug', '+':'aug',
  'm7':'min7', 'm6':'min6', 'm9':'min9', '7sus4':'dom7sus4', 'sus4':'sus4', 'sus2':'sus2',
  'add9':'add9', '69':'dom6', '6':'dom6', 'maj9':'maj9', '9':'dom9' };
const PC={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
function pcOf(l,acc){ let v=PC[l]; if(v==null) return null; if(acc==='#'||acc==='♯') v++; if(acc==='b'||acc==='♭') v--; return (v+12)%12; }
function chordToCompass(c){
  if(!c||c.root==null) return null;
  const suf=(c.type in TO_CMP)?TO_CMP[c.type]:'';
  let s=ROOT_NAMES[((c.root%12)+12)%12]+suf;
  if(typeof c.bass==='number'&&c.bass!==c.root) s+='/'+ROOT_NAMES[((c.bass%12)+12)%12];
  return s;
}
function chordFromCompass(name){
  const m=/^([A-G])([#b♯♭]?)(.*?)(?:\/([A-G])([#b♯♭]?))?$/.exec(String(name||'').trim());
  if(!m) return null;
  const root=pcOf(m[1],m[2]); if(root==null) return null;
  const type=(m[3] in FROM_CMP)?FROM_CMP[m[3]]:'maj';
  const bass=m[4]?pcOf(m[4],m[5]):null;
  return { root, type, bass:(bass==null||bass===root)?null:bass };
}

/* ══ タイの付け方の違い ══
   seq は小節をまたいで弾く順に並べた音符の列（同じ配列の参照）。 */
function noteTiesToCompass(seq){
  /* TAB：出ていく側 t.tie → Compass：受ける側 t.link='tie' */
  for(let i=0;i<seq.length;i++){
    const n=seq[i]; if(!n||!n.stops) continue;
    n.stops.forEach(o=>{
      if(!o||!o.t||!o.t.tie) return;
      delete o.t.tie;
      const nx=seq[i+1]; if(!nx||!nx.stops) return;
      const q=nx.stops.find(x=>x&&x.s===o.s&&x.f===o.f);
      if(q){ q.t=q.t||{}; if(!q.t.link) q.t.link='tie'; }
    });
  }
}
function noteTiesFromCompass(seq){
  for(let i=0;i<seq.length;i++){
    const n=seq[i]; if(!n||!n.stops) continue;
    n.stops.forEach(o=>{
      if(!o||!o.t||o.t.link!=='tie') return;
      delete o.t.link;
      const pv=seq[i-1]; if(!pv||!pv.stops) return;
      const q=pv.stops.find(x=>x&&x.s===o.s&&x.f===o.f);
      if(q){ q.t=q.t||{}; q.t.tie=true; }
    });
  }
}

/* 共通の曲を、深く写す（受けた側で手を入れても、預けた物を汚さない） */
function clone(o){ return JSON.parse(JSON.stringify(o)); }

window.SLLink={ version:'1.0', TOOLS, tool, newLink, carry, take,
  chordToCompass, chordFromCompass, noteTiesToCompass, noteTiesFromCompass, clone };
})();
