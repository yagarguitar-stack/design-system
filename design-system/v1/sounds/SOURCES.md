# 楽器の音の出どころ

ナイロンとドラム以外は、出典の表記なしで自由に使える音源です（CC0・パブリックドメイン）。ナイロンとドラムは出典の表記が必要です（CC BY-SA 3.0）。軽い形式（MP3・モノラル）に変換し、頭の無音を詰め、長さと音量をそろえています。音程のずれは sound.js で補正しています。

| フォルダ | 楽器 | 元の音源 | 利用条件 |
|---|---|---|---|
| acoustic | アコギ | Martin HD28（Jeff Learman 録音）— Discord SFZ GM Bank | CC0 |
| nylon | ナイロン弦 | MusyngKite サウンドフォントのナイロンギター — midi-js-soundfonts 経由 | CC BY-SA 3.0 |
| electric | エレキ（クリーン） | Shinyguitar（エレキ）— Karoryfer Samples | CC0 |
| piano | ピアノ | Splendid Grand Piano（AKAI 提供のスタインウェイ）— danigb/samples 経由 | パブリックドメイン |
| bass | ベース | Killer Bass — Karoryfer Samples（Discord SFZ GM Bank 経由） | CC0 |
| drums | ドラム | MusyngKite サウンドフォントの打楽器 — midi-js-soundfonts 経由 | CC BY-SA 3.0 |

- https://github.com/sfzinstruments/Discord-SFZ-GM-Bank
- https://github.com/sfzinstruments/karoryfer.shinyguitar
- https://github.com/danigb/samples
- https://github.com/gleitz/midi-js-soundfonts

## ナイロンとドラムの利用条件について

nylon・drums フォルダの音は MusyngKite を加工（頭の無音を詰め、長さと音量をそろえて変換）したものです。CC BY-SA 3.0 に従い、これらのフォルダの音も同じ CC BY-SA 3.0 で公開します。ナイロンやドラムを鳴らすツールには、出典の表記（`DS.sound.creditsHtml([使う楽器])` の文）を載せてください。

## ドラムの追加の音（2026-10-31）

drums フォルダに、MusyngKite の打楽器から次の11音を同じ加工（左右を混ぜてモノラル化・頭の無音を詰める・長さをそろえる・元の音量の比率のまま変換）で追加しました。利用条件は既存のドラムと同じ CC BY-SA 3.0 です。

| ファイル | 楽器 | 元の番号（GM） |
|---|---|---|
| hihat-pedal | ハイハット（フット） | 44 |
| crash2 | クラッシュ2 | 57 |
| china | チャイナ | 52 |
| splash | スプラッシュ | 55 |
| ride-bell | ライド（カップ） | 53 |
| tom-mid | タム（2番目に高い） | 48 |
| tom-mid-low | タム（3番目に高い） | 45 |
| tom-floor | フロアタム（いちばん低い） | 41 |
| clap | クラップ | 39 |
| cowbell | カウベル | 56 |
| tambourine | タンバリン | 54 |

既存のタムは tom-high が 50 番、tom-low が 43 番です。
