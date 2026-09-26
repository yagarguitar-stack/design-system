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
