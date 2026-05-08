# Reversi Desktop

Mac と Windows 配布を見据えた Reversi の Tauri デスクトップ版です。
ブラウザ版は GitHub Pages で `https://hashimototakuma0.github.io/codex-test/` として公開できます。

## 今あるもの

- 依存なしで動く Web フロントエンド
- 強い CPU 対戦
- Tauri によるデスクトップ包装
- ローカル確認用の小さな Node サーバー

## 開発起動

```bash
cd /Users/thashimoto/projects/codex-test/ReversiDesktop
npm install
npm run tauri:dev
```

ブラウザだけで確認したい場合は `npm run dev` で `http://127.0.0.1:4173` を開くと遊べます。

## 配布用ビルド

```bash
cd /Users/thashimoto/projects/codex-test/ReversiDesktop
npm run tauri:build
```

macOS では配布物が次に出力されます。

- `/Users/thashimoto/projects/codex-test/ReversiDesktop/src-tauri/target/release/bundle/macos/Reversi Desktop.app`
- `/Users/thashimoto/projects/codex-test/ReversiDesktop/src-tauri/target/release/bundle/macos/Reversi Desktop_0.1.0_aarch64.zip`
- `/Users/thashimoto/projects/codex-test/ReversiDesktop/src-tauri/target/release/bundle/macos/Reversi Desktop_0.1.0_aarch64_simple.dmg`

## Windows について

Windows 版は [windows-build.yml](/Users/thashimoto/projects/codex-test/.github/workflows/windows-build.yml:1) を追加してあります。
GitHub Actions で実行すると、次の配布物を Artifact として取得できます。

- `bundle/nsis/*.exe`
- `bundle/msi/*.msi`

ローカルで Windows 実機がある場合も、`ReversiDesktop` で `npm run tauri:build` を実行すれば同じ形式を生成できます。
