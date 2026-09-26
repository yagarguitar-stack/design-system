# design-system## 音楽の計算（theory.js）

`<script src="https://yagarguitar-stack.github.io/design-system/v1/theory.js"></script>` を読み込むと `DS.theory` が使えます。画面には何も描きません。

### 決まりごと
- C4＝60（sound.js・notation.js と同じ）
- 弦は `0`＝6弦 〜 `5`＝1弦（notation.js・fretboard.js と同じ並び）
- 音名は調に合わせて綴る（ト長調なら F♯、ヘ長調なら G♭）。調を指定しない時は C♯・E♭・F♯・A♭・B♭
- コード名の書き方は 2通り。`'ja'`＝CM7・C7(♭9)（初期）、`'en'`＝Cmaj7・C7(b9)。`DS.theory.style('en')` で切り替え、1回だけなら `{style:'en'}`
- 読めなかった時は `null` を返す。ツール側で「読めませんでした」と出す

### 音名・音程
```js
DS.theory.midi('C#4')              // 61（'E♭3'・'Bb2'・'ド♯4' も可）
DS.theory.name(66,{key:'G'})       // 'F♯4'　{octave:false} で 'F♯'
DS.theory.solfa('C#')              // 'ド♯'
DS.theory.interval('C4','F#4')     // {name:'増4度', label:'♯4', semi:6, …}
DS.theory.degree('G#','C')         // '♯5'（数字で渡すと R・♭2…7 の12通り＝指板の度数色と同じ）
DS.theory.freq('A4')               // 440　／ DS.theory.fromFreq(261.63) → 60.0
```
sound.js には番号で渡してください（sound.js は ♯・♭ の記号を読みません）：`DS.sound.play('piano', DS.theory.midi('F♯4'))`

### 調・音階
```js
var k=DS.theory.key('G');          // 'Em'・'B♭'・'ト長調' も可
k.ja; k.sigText; k.accidentals;    // 'ト長調'・'♯1つ'・['F♯']
k.scale; k.relative;               // ['G','A',…,'F♯']・'Em'
k.chords; k.sevenths;              // ダイアトニック（name・roman・func：T/SD/D）
DS.theory.scale('A','blues').notes // ['A','C','D','E♭','E','G']
```
音階の種類：major・natminor・harminor・melminor・majpenta・minpenta・blues・ionian・dorian・phrygian・lydian・mixolydian・aeolian・locrian・wholetone・dim

### コード
```js
var c=DS.theory.chord('G7(♭9)/B');
c.name; c.notes; c.labels;         // 'G7(♭9)/B'・['G','B','D','F','A♭']・['R','3','5','♭7','♭9']
c.ja; c.feel;                      // 'セブンス・フラットナインス'・''
DS.theory.chord({root:'D',type:'min7'})   // 種類の名前で作る（一覧は DS.theory.CHORDS）
DS.theory.voice('C',{oct:4,inv:1}) // [64,67,72]（鳴らす音の番号。分数コードは低音を下へ）
DS.theory.identify([52,55,60])     // 当てはまるコードを近い順に。[0].name → 'C/E'
DS.theory.roman('D♭7','C')         // '♭II7'
DS.theory.transpose('Am7/G',3)     // 'Cm7/B♭'（音名を移す時は {as:'note'}）
```
- 対応するコードは45種（パワーコードを含む）（ScoreLineLead とフレットボードトレーナーを合わせたもの）
- `C7(♭9,13)` のように一覧にない組み合わせも、土台＋テンションとして読む
- `C(9)`・`Cm(9)` は add9 として読む

### ギター
```js
DS.theory.fret(0,3)                        // 43（6弦3フレット）
DS.theory.fret(0,0,{tuning:'dropd',capo:2}) // カポの位置から数える
DS.theory.positions('E4')                  // [{s:1,f:19},…,{s:5,f:0}]
DS.theory.tuning('opend').labels           // ['D','A','D','F♯','A','D']
DS.theory.stringName(0)                    // '6弦'
```
チューニング：std・half・whole・dropd・dropc・dadgad・openg・opend・opene（配列で独自の指定も可）

見本：theory-demo.html

## 拍を刻む仕組み（clock.js）

`<script src="https://yagarguitar-stack.github.io/design-system/v1/clock.js"></script>` を読み込むと `DS.clock` が使えます。sound.js と一緒に読み込むと、同じ音の器で刻み、既定でクリック音を鳴らします。

```js
var c=DS.clock.create({bpm:100, meter:[4,4], div:2, swing:0.6, countIn:1});
c.on('tick',function(t,p){ DS.sound.drum('hihat',{time:t}); });  // 鳴らす予約（書かなければクリック音）
c.on('draw',function(p){ light(p.beat); });                       // 実際に聞こえた瞬間に呼ばれる
c.start();  c.stop();  c.pause();  c.resume();
c.set({bpm:120});                                                 // 途中で変える
```

| 設定 | 中身 | 変えた時に効く所 |
|---|---|---|
| bpm | 4分音符で数えたテンポ（6/8 なら 8分の拍は bpm の倍の速さ） | 次の拍 |
| meter | 拍子 `[7,8]` など | 次の小節 |
| div | 1拍の細かさ（1＝そのまま、2＝8分、3＝3連、4＝16分） | 次の拍 |
| swing | 跳ねの割合 0.5（まっすぐ）〜0.75。67 のように％でも可。細かさが偶数の時だけ効く | 次の拍 |
| groups | 区切り `[2,2,3]`。区切りの頭が強くなる | 次の小節 |
| accents | 1小節ぶんの強さを直接指定 `[2,0,1,0,…]` | 次の小節 |
| countIn | カウントインの小節数（0〜2） | 次のスタート |
| sound | false で既定のクリック音を鳴らさない | すぐ |

位置 `p` の中身：`bar`（0 から。カウントインは −1・−2）・`beat`・`sub`（拍の中の何番目、0 から）・`head`（拍の頭）・`first`（小節の頭）・`level`（2＝小節の頭、1＝区切りの頭、0＝それ以外）・`countIn`・`time`

### タップの判定と、端末の遅れ
```js
btn.onpointerdown=function(e){ var r=c.judge(e); };   // r.diff：ずれ（ms、＋が遅い）、r.bar・r.beat・r.sub：一番近い音
c.judge(e,{grid:'beat'});                             // 拍の頭だけを相手にする
c.timeOf(2,0,0);  c.posAt(time);                      // 位置 ⇔ 時刻

DS.clock.latency.get();          // {ms, date} か null（まだ測っていない）
DS.clock.latency.fromTaps(ずれの並び);   // {ok, ms, sd}。最初の2回は除き、ばらつき ±70ms 超は不採用
DS.clock.latency.set(ms);
```
- 端末の遅れは、全ツールで1つの値を使います（同じ github.io の下なので共有されます）。ことりノームで測った値があれば、最初に自動で引き継ぎます
- 測っていない時は、ブラウザが申告する出力の遅れで仮に補正します
- 画面を切り替えた時・画面を消した時も止まらないよう、見回りを別の作業場所で回し、1.5秒先まで予約します。そのため画面の裏にいる間は、テンポを変えても最大1.5秒ほど遅れて効きます
- スマホの画面を完全に消すと、端末によっては音そのものが止まります（ブラウザの仕様）

見本：clock-demo.html

## リズム譜（rhythm.js）

`<script src="https://yagarguitar-stack.github.io/design-system/v1/rhythm.js"></script>` を読み込むと `DS.rhythm` が使えます。1本線の打楽器譜を描き、clock.js と一緒に読み込めば「譜面どおりに鳴らして縦の線を流す」までできます。sound.js もあれば、その音で鳴ります（無ければ合成音）。記号は五線譜と同じ Bravura を図形として内蔵しているので、フォントの読み込みを待ちません。

```js
var v = DS.rhythm.render(el, '4/4 q 8 8 qr 16 16 16 16 | 3(8 8 8) 8. 16 8r 8~ q');
var p = DS.rhythm.play(v, {bpm:90, countIn:1});   // p.stop() で止める
btn.onpointerdown = function(e){ var r = p.judge(e); };   // r.diff：一番近い音とのずれ（ms、＋が遅い）
```

### 書き方（文字で渡すとき）
| 書くもの | 書き方 |
|---|---|
| 長さ | `w`＝全 `h`＝2分 `q`＝4分 `8` `16` `32`。付点は `.`（複付点は `..`） |
| 休符 | 長さの後ろに `r`（`qr`・`8.r`） |
| タイ・アクセント | 後ろに `~`（次の音とつなぐ）・`>` |
| 連符 | `3(8 8 8)`・`5(16 16 16 16 16)`・`6(16 …)`・`3(q q q)`。比は `3:2(…)` |
| 拍子 | 小節の頭に `4/4`・`6/8`・`7/8:2+2+3`（書かなければ前と同じ） |
| 小節 | `\|` で区切る |

文字の代わりに `{bars:[{ts:[4,4], groups:[2,2,3], notes:[{len, rest, tie, accent, tu:{n:3,in:2}}]}]}` でも渡せます。長さは notation.js と同じ 4分音符＝1680（`DS.rhythm.T.QUARTER`）。

### 升目から（ことりノームの形）
```js
var score = DS.rhythm.fromGrid([1,0,1,0, 1,1,1,1, …], {div:4, ts:[4,4]});   // div：1拍の升の数（1・2・3・4・5・6・8）
DS.rhythm.render(el, score);
```
- 叩く所から次に叩く所まで音を伸ばします（`hold:false` で升1つぶんの音符＋休符）
- `div` が 3・5・6 のときは3連・5連・6連になります。拍まるごと伸ばす音は普通の4分音符で書きます

### 自動で整えること
- 連桁は拍ごと（6/8 などは付点4分ずつ、`7/8:2+2+3` のように区切りを書けばそのとおり）
- 拍の途中から拍をまたぐ音、4/4 で2拍目から小節の真ん中をまたぐ音は、タイで分けます。拍の頭から始まる付点4分などはそのまま
- 連符は、連桁がまとまっていれば数字だけ、そうでなければ括弧つき
- 休みだけの小節は全休符。画面の幅に合わせて段を折り返します
- 小節の長さが拍子と合わない時は、黙って直さず `v.errors` に理由を入れます（短い分は休符で埋めて描きます）

### 設定
| render の設定 | 中身 |
|---|---|
| `spacing` | `'time'`＝時間に比例（初期。縦の線が一定の速さで進む）／`'engraved'`＝楽譜らしい間隔 |
| `staff` | `1`＝1本線（初期）／`5`＝五線／`0`＝線なし |
| `sp` | 大きさ（線の間隔、初期 9） |
| `width` | 折り返す幅（初期は置き場所の幅） |

| play の設定 | 中身 |
|---|---|
| `bpm` | 4分音符で数えたテンポ |
| `countIn` | カウントインの小節数（初期 1） |
| `metronome` | 拍のクリック（初期 あり） |
| `show` | `'cursor'`＝縦の線（初期）／`'light'`＝鳴った音符が光る／`'both'` |
| `sound` | 音符の音。初期は sound.js のリム。`false` で鳴らさない、関数 `(t, 音符)` で自分で鳴らす |
| `loop`・`onEnd`・`onNote` | くり返し・終わった時・音符が鳴る時 |
（リズム譜の節の「設定」の表に1行、表の下に2行を足してください）

| `splitBeats` | `true` で、拍の頭から始まる付点4分・2分も拍ごとに分けてタイでつなぐ（初期は分けない） |

- 連符のまとまりは、文字の書き方では `( )` ごと、升目からは拍ごとに自動で分かれます。音の並びで渡すときは、同じまとまりの音に同じ `tu.id` を付けてください（付けなければ拍の頭で区切ります）
- `DS.rhythm.shape(長さ)` で、その長さが描ける形（記号と付点の数）かどうかを調べられます

- 縦の線と光の色は CSS の `--ds-rhy-hi`、記号の色は `--ds-rhy-ink` で変えられます
- clock.js が読めない時も、中の小さな刻みで鳴ります（画面の裏では途切れることがあります）

見本：rhythm-demo.html（sound.js・clock.js と同じフォルダで開く）
（リズム譜の節の「render の設定」の表に、次の行を足してください）

| `beatGuides` | `true` で拍の区切りに点線（色は CSS の `--ds-rhy-guide`） |
| `beamGroup` | `'beat'`＝1拍ずつ（初期）／`'half'`＝8分だけのときは2拍ずつ（4/4・2/4 など） |
| `beams` | `false` で連桁を付けず旗で描く |
| `split` | `false` で拍をまたぐ音も分けない（形が描ける長さならそのまま。出題用） |
| `timeSig` | `false` で拍子記号を出さない |
| `beatWidth` | 時間に比例のときの、4分音符1つぶんの幅（px） |

- 音に `ref`（元の番号）を付けて渡すと、`v.byRef(番号)` でその音の記号の位置（`x`・`y0`）が分かります。飾りを後から足すときに使います
- 音に `hidden:true` を付けると、場所だけ取って描きません（小節の足りない分を空けておくときなど）
- 版は 1.1 です（`DS.rhythm.version`）
（リズム譜の節に、次の3行を足してください）

- 音に `blank:true` を付けると、その長さぶんの点線の枠と「？」を描きます（穴埋めの出題用。色は `--ds-rhy-blank`・`--ds-rhy-blank-bg`）
- 音に `mark:'ok'` / `mark:'ng'` を付けると、その音を緑／赤で描きます（色は `--ds-rhy-ok`・`--ds-rhy-ng`）
- 小節の中身が拍子より長い時は、終わりの線を本来の位置に置き、はみ出した範囲に薄い帯と「はみ出し」を出します（文字は render の `overflowLabel` で変えられます）。版は 1.2 です
