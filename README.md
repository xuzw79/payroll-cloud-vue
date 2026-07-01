# 給与管理クラウド Vue版

Vue 3 + Vite + Hono + PostgreSQL + Prisma + Railway を使った、小規模向け給与管理システムです。

## 主な機能

- 管理者ログイン
- 社員管理
- 社員ごとの既定扶養人数
- 月別給与入力
- 給与入力時の扶養人数
- 年度別の税率・社会保険料率マスタ
- 所得税表CSVインポート
- 支給月、扶養人数、課税対象額による所得税の自動参照
- 給与計算結果のDB保存
- 社員名・社員番号検索
- 月別給与一覧
- 給与明細PDFのメール送信
- CSV出力
- Railwayデプロイ設定

## ローカル起動

```bash
npm install
cp .env.example .env
npm run prisma:migrate
npm run db:seed
npm run dev:api
npm run dev
```

開発時は API が `http://127.0.0.1:3000`、Vue が `http://127.0.0.1:5173` で動きます。

## Railwayで使う環境変数

RailwayにPostgreSQLを追加し、以下を設定してください。

```env
DATABASE_URL=Railway PostgreSQL の接続URL
ADMIN_EMAIL=管理者メールアドレス
ADMIN_PASSWORD=管理者パスワード
SESSION_SECRET=長いランダム文字列
PORT=3000
SMTP_HOST=SMTPサーバー
SMTP_PORT=587
SMTP_USER=SMTPユーザー
SMTP_PASS=SMTPパスワード
MAIL_FROM=送信元メールアドレス
SMTP_STARTTLS=true
```

## 所得税表CSVインポート

画面の「所得税表インポート」にCSVを貼り付けて取り込みます。

```csv
fiscalYear,dependentCount,minTaxable,maxTaxable,taxAmount
2026,0,0,88000,0
2026,0,88001,99000,130
2026,1,0,99000,0
```

給与保存時は以下の順で所得税を決めます。

1. 支給月から年度を判定
2. 総支給額から社会保険と雇用保険を引いて課税対象額を算出
3. 年度、扶養人数、課税対象額に一致する所得税表を検索
4. 一致すれば表の税額を使用
5. 一致しなければ年度料率の所得税率で簡易計算

## PDFメール送信

給与を保存したあと、社員にメールアドレスが設定されていれば、給与明細PDFを添付してメール送信できます。

PDFは外部ライブラリなしの簡易PDFとして生成します。日本語フォント埋め込みまでは未対応なので、PDF本文の一部は英語ラベルで出力します。メール本文は日本語です。

## デプロイの流れ

1. GitHubにこのプロジェクトをpush
2. RailwayでNew Project
3. GitHub repoを選択
4. PostgreSQLを追加
5. 環境変数を設定
6. Deploy

`railway.json` により、デプロイ時にPrisma migrationを適用してからアプリを起動します。

## 注意

この雛形の給与計算は簡易版です。正式運用では、税額表、社会保険の等級、扶養人数、住民税、年末調整、監査ログ、バックアップ方針を追加してください。
