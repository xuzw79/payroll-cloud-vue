# 給与管理クラウド Vue版

Vue 3 + Vite + Hono + PostgreSQL + Prisma + Railway を使った、小規模向け給与管理システムの雛形です。

## 機能

- 管理者ログイン
- 社員管理
- 月別給与入力
- 所得税率、社会保険率、雇用保険率、残業割増率の設定
- 給与計算結果のDB保存
- 社員名・社員番号検索
- 月別給与一覧
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
```

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
