# Payroll Submenus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 給与管理画面をSES管理と同じ子メニュー方式へ整理する。

**Architecture:** `src/App.vue` に給与子メニュー状態と権限マッピングを追加し、既存の給与テンプレートを子メニュー単位に表示制御する。計算関数、API、PDF/CSV関数は既存のまま使う。

**Tech Stack:** Vue 3, TypeScript, Vite, Hono, Prisma

## Global Constraints

- 給与計算、所得税計算、PDF出力、CSV出力、保存APIは変更しない。
- 既存の `PermissionMenu` を利用し、新しい権限項目は追加しない。
- 子メニューはSES管理と同じ `.sub-menu` スタイルを利用する。
- 実装後に `cmd /c npm run build` を実行する。

---

### Task 1: Add Payroll Submenu State

**Files:**
- Modify: `src/App.vue`

**Interfaces:**
- Produces: `PayrollSubMenu`, `payrollSubMenus`, `payrollSubMenuPermissions`, `activePayrollSubMenu`, `visiblePayrollSubMenus`

- [ ] Add a `PayrollSubMenu` union type.
- [ ] Add submenu metadata for employees, payroll input, bonus input, slips, rates, tax import.
- [ ] Add a computed `visiblePayrollSubMenus` that checks existing permissions through `canShowMenu`.
- [ ] Add watchers to pick the first visible submenu and clear messages when the submenu changes.

### Task 2: Move Payroll Header Controls by Submenu

**Files:**
- Modify: `src/App.vue`

**Interfaces:**
- Consumes: `activePayrollSubMenu`

- [ ] Render `.sub-menu` when `activeMenu === "payroll"`.
- [ ] Show支給月/社員検索 for employees, payroll, bonus, slips.
- [ ] Show PDF range controls only for slips.
- [ ] Show summary only for employees, payroll, bonus, slips.

### Task 3: Split Payroll Content Display

**Files:**
- Modify: `src/App.vue`

**Interfaces:**
- Consumes: `activePayrollSubMenu`

- [ ] Show employee list only where employee selection is needed.
- [ ] Show employee form only in employees submenu.
- [ ] Show payroll input only in payroll input submenu.
- [ ] Show bonus input only in bonus input submenu.
- [ ] Show rates only in rates submenu.
- [ ] Show tax import only in tax import submenu.
- [ ] Show payslip and bonus slip only in slips submenu.

### Task 4: Documentation and Release Notes

**Files:**
- Modify: `handoff.md`
- Modify: `docs/manual_payroll_ja.md`
- Modify: `docs/manual_payroll_zh.md`
- Modify: `docs/manual_payroll_ses_ja_zh.xlsx`

**Interfaces:**
- Consumes: implemented submenu names

- [ ] Update handoff release section.
- [ ] Update Japanese and Chinese payroll manuals.
- [ ] Regenerate Excel manual.

### Task 5: Verification

**Files:**
- Read: build output

- [ ] Run `cmd /c npm run build`.
- [ ] Confirm exit code is 0.
- [ ] Review `git diff` for unrelated changes.
- [ ] Commit and push.
