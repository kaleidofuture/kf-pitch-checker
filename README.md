# KF-PitchChecker

> 楽器練習の音程をリアルタイムで可視化するピッチチェッカー。

## The Problem

楽器を練習しても、自分の音程がどれくらい正確なのか客観的に分からない。

## How It Works

1. マイクアクセスを許可
2. 「開始」ボタンで音声入力開始
3. 検出された音名（C4, A4等）とセント単位のずれをリアルタイム表示
4. チューニングメーター風UIで直感的に確認
5. 練習セッション中の音程精度ヒストグラムを表示
6. 結果をCSVダウンロード

## Technologies Used

- **HTML + CSS + JavaScript** — フレームワーク不要のバニラJS
- **Web Audio API** — リアルタイム音声入力と解析
- **Autocorrelation** — 自己相関法によるピッチ検出（外部ライブラリ不要）
- **Canvas API** — 音程精度ヒストグラムの描画

## Development

```bash
npx serve .
```

## Deployment

Hosted on [Vercel](https://vercel.com/) (static HTML).

---

Part of the [KaleidoFuture AI-Driven Development Research](https://kaleidofuture.com) — proving that everyday problems can be solved with existing libraries, no AI model required.
