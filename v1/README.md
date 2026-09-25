# 共通デザイン v1

ツールごとに、必要なものだけ読み込みます。読み込んだだけでは見た目は変わらず、ツールの CSS で `var(--…)` を使った箇所にだけ効きます。

| ファイル | 中身 |
|---|---|
| fonts.css | 看板（Rye）・見出し（Zen Old Mincho）・本文（Zen Kaku Gothic New） |
| colors.css | 工房の色（真鍮・木・紙など）と、役割ごとの色 |
| scale.css | 文字の大きさ7段階・余白・角の丸み・影 |
| icons.js | 線のアイコン（Phosphor＋ギター用の自作5点）。`ic('guitar')` で呼び出す |
| motion.css ＋ motion.js | 押したときの動き（2つセットで使う） |
| sound.js ＋ sounds/ | 楽器の音（アコギ・ナイロン・エレキ・ピアノ・ベース・ドラム・クリック） |

## 読み込み方（`<head>` に、使うものだけ書く）

```html
<link rel="stylesheet" href="https://yagarguitar-stack.github.io/design-system/v1/fonts.css">
<link rel="stylesheet" href="https://yagarguitar-stack.github.io/design-system/v1/colors.css">
<link rel="stylesheet" href="https://yagarguitar-stack.github.io/design-system/v1/scale.css">
<script src="https://yagarguitar-stack.github.io/design-system/v1/icons.js"></script>
<link rel="stylesheet" href="https://yagarguitar-stack.github.io/design-system/v1/motion.css">
<script src="https://yagarguitar-stack.github.io/design-system/v1/motion.js"></script>
```

## 押したときの動き

| 部品 | 動き | 付け方 |
|---|---|---|
| 大きなボタン | 光が走る（押し込みつき） | `class="ds-shine"`、または既存のボタンに `DS.use({shine:'.btn-brass'})` |
| 札 | 裏返ってから開く | `DS.open(札, URL)` |
| 切り替え | ランプが灯る | `<label class="ds-lamp"><input type="checkbox"><span class="ds-led"></span><span>文言</span></label>` |
| 注意のボタン | 1秒の長押しで確定 | `class="ds-hold"`。文言は「長押しで削除」のように書く |

端末で「動きを減らす」を選んでいる方には、光・裏返り・揺れを出しません。

## 楽器の音

`<script src="https://yagarguitar-stack.github.io/design-system/v1/sound.js"></script>` を読み込むと使えます。音は sounds/ フォルダから、使う楽器の分だけ読み込まれます。

```js
DS.sound.load(['acoustic','drums']);                 // 先に読み込んでおく（しなくても初回に自動で読み込む）
DS.sound.play('piano','C4',{dur:1});                 // 1音。音名は 'C4'・'F#3'・'Bb2' か数字（C4＝60）
DS.sound.chord('acoustic',['E2','B2','E3','G#3','B3','E4']);   // 和音。ギターは自動で少しずらしてストローク
DS.sound.chord('electric',[...],{up:true});          // 上から弾き下ろす（アップストローク）
DS.sound.drum('kick');                               // kick／snare／rim／hihat／hihat-open／crash／ride／tom-high／tom-low
DS.sound.click(true);                                // メトロノームの電子音。true で1拍目の高い音
DS.sound.play('bass','E1',{time:DS.sound.now()+0.5,vel:0.6});  // 鳴らす時刻と強さ（0〜1）
DS.sound.volume(0.6);                                // 全体の音量
```

- 楽器の名前：`acoustic`（アコギ）・`nylon`（ナイロン）・`electric`（エレキ）・`piano`（ピアノ）・`bass`（ベース）・`drums`（ドラム）
- 音程は A＝440Hz にそろえてあります（録音ごとのずれを自動で補正）。`60.25` のような小数の高さも正確に鳴ります
- 1音ずつの大きさ（鳴り始め0.3秒）を全楽器・全音でそろえてあります。高さや楽器で大きさが変わりません
- ツールがすでに自分の音の器（AudioContext）を持っている時は、`DS.sound.use({context:器, output:出口})` でつなぎます
- スマホでは最初のタップまで音が出ません。最初の操作で自動的に準備します
- 音の出どころは sounds/SOURCES.md に記載
- **ナイロンとドラムは出典の表記が必要**（CC BY-SA 3.0）。使うツールでは、設定画面の下などに次の1行を入れます

```js
el.innerHTML += DS.sound.creditsHtml(['drums']);   // 使う楽器を渡すと、表記が必要なものだけ文にして返す
```

## 一部だけ変えたいとき

共通ファイルの後に、そのツールで上書きします。

```html
<style>:root{ --c-accent:#6fb3d2; }</style>
```

## 版について

v1 の中身を大きく変えるときは v2 フォルダを新しく作り、ツールごとに切り替えます。一度に全ツールが崩れるのを防ぐためです。
