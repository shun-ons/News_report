# 週次ニュース自動収集システム

医用画像処理・AI分野の最新情報を自動収集し、Gemini APIで要約してNotionに保存するシステムです。

## 背景・モチベーション

修士研究（医用画像処理）と就職活動を並行する中で、専門分野の情報収集を効率化する必要がありました。毎日手動でニュースを確認する時間的コストを削減するため、本システムを開発しました。

## システム構成

```
Gmail
  ├── 企業ニュース（label: news-company）
  ├── AI動向　　　（label: news-AI）
  └── 論文　　　　（label: news-paper）
          ↓
  Google Apps Script
  （毎週土曜日 自動実行）
          ↓
  Gemini API
  （カテゴリ別に要約・圧縮）
          ↓
  Notion API
  （データベースに自動保存）
```

## 使用技術

- **Google Apps Script**（JavaScript）：自動実行・Gmail操作・API連携
- **Gemini API**（gemini-2.5-flash-lite）：メール内容の要約生成
- **Notion API**：週次まとめのデータベース保存
- **Gmail**：Scholar Inbox・Googleアラートのメール収集

## 機能

- 毎週土曜日に自動実行（GASトリガー）
- 3カテゴリ別にメールを収集・要約
  - 企業ニュース（富士フイルム・キヤノン等）
  - AI動向（OpenAI・Google・Anthropic等）
  - 論文トレンド（Scholar Inbox経由）
- Geminiによる2段階要約
  - 箇条書き要約（ページ本文）
  - 2〜3文の圧縮要約（データベースカラム）
- 元記事へのリンク付き保存
- 処理メール件数の記録

## Notionの保存イメージ

| 名前 | 期間 | ラベル | 要約 | メール件数 |
|---|---|---|---|---|
| 週次まとめ 2026/05/24 | 2026/05/17〜05/24 | 企業ニュース | 富士フイルムが… | 7 |
| 週次まとめ 2026/05/24 | 2026/05/17〜05/24 | AI動向 | OpenAIが… | 5 |
| 週次まとめ 2026/05/24 | 2026/05/17〜05/24 | 論文 | Diffusion… | 12 |

各行を開くと箇条書きの詳細要約と元記事へのリンクが確認できます。

## セットアップ

### 必要なもの

- Googleアカウント（Gmail使用）
- Notionアカウント
- Gemini APIキー（[Google AI Studio](https://aistudio.google.com)で取得）
- Notion APIトークン（[notion.so/my-integrations](https://notion.so/my-integrations)で取得）

### 手順

**1. GmailのラベルとGoogleアラートを設定**

Gmailで以下のラベルを作成し、フィルターで自動振り分けを設定します。

```
news/company  ← 企業名キーワードのGoogleアラート
news/AI       ← AI関連キーワードのGoogleアラート
news/paper    ← Scholar Inboxからの論文メール
```

**2. NotionのデータベースとAPIトークンを設定**

Notionに以下のプロパティを持つデータベースを作成します。

| プロパティ名 | 種類 |
|---|---|
| 名前 | タイトル |
| 期間 | テキスト |
| ラベル | マルチセレクト |
| 要約 | テキスト |
| メール件数 | 数値 |

**3. Google Apps ScriptにAPIキーを設定**

GASのスクリプトプロパティに以下を追加します。

```
NOTION_TOKEN       : NotionのAPIトークン
GEMINI_API_KEY     : GeminiのAPIキー
NOTION_DATABASE_ID : NotionデータベースのID
```

**4. トリガーを設定**

GASのトリガー機能で`weeklyNewsSummary`を毎週土曜日に自動実行するよう設定します。

## ファイル構成

```
weekly-news-summary/
├── main.gs           # メイン処理（メール取得・要約・Notion保存）
├── test.gs           # テスト用関数
├── appsscript.json   # GASプロジェクト設定
└── .gitignore
```

## 注意事項

APIキーはGASのスクリプトプロパティで管理しており、コードには含まれていません。
