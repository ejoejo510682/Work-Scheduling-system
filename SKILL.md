# 本專案開發守則 (For Claude Code)

> 這份文件是 Claude Code 開發本專案時必須遵守的規則。每次對話開始前先讀過。

## 一、溝通原則

- **使用者非程式背景**，回覆時：
  - 用中文，避免艱深的技術術語
  - 解釋要白話、用比喻、舉例子
  - 不要假設使用者懂 Git / SQL / API / Schema
- **每個決策先確認**，不要直接實作大段功能——尤其是會影響資料結構的決定（新增欄位、改變判斷邏輯），先問清楚實際情況再動手
- **每個 Phase 結束做一次 Git commit**，並提示使用者 push

## 二、開發節奏

1. **先做能跑的最小版本**：崗位/PT/能力總表 → 排班 → 看到班表
2. 之後再回頭加：訓練紀錄、追加任務、PDF 匯出
3. 每完成一個小步驟（不是 Phase）就更新 `PROJECT_LOG.md`
4. 每次對話開始先讀：`CLAUDE.md` + `PROJECT_LOG.md`（看上次做到哪）

## 三、資料庫鐵則

### 同一時段防重複指派
`daily_schedule` 寫入時，後端 API 必須檢查同一個 `date + slot + pt_id` 沒有已存在的其他 `position_id`；有衝突要擋下並回傳清楚的錯誤訊息，不能讓同一人在同一時段被排進兩個崗位。

### Foreign Key 設定
- `pt_abilities.pt_id` / `daily_schedule.pt_id` → `pt_staff.id`：pt_staff 用 `is_active` 停用，不做實體刪除，歷史班表要保留
- `training_records.pt_id` → `pt_staff.id`：同上
- `daily_schedule.position_id` → `positions.id`：`ON DELETE RESTRICT`（崗位有歷史班表就不可刪除，只能停用）

### RLS (Row Level Security)
- 所有表都啟用 RLS
- 後台透過 Supabase Auth + `admin_users.role` 判斷可寫入的範圍（主管 vs 排班人員），對照 CLAUDE.md 第二節的權限矩陣
- 只有主管能寫入：`pt_abilities` 等級、`training_records`、`positions`/`training_items`/`position_headcount`/`position_slot_map` 基礎設定、`weekly_tasks` 建立、`admin_users`
- 主管與排班人員都能寫入：`pt_daily_availability`、`daily_schedule`、`weekly_task_assignments`

## 四、安全鐵則

### 環境變數
- 所有 Supabase 金鑰放 `.env.local`，**不可 commit 到 git**（`.gitignore` 必含）
- Supabase service role key 只能在後端 API Routes 用，**絕不暴露給前端**
- 上 Vercel 時把 env vars 放 Vercel 後台

### 權限邊界
- 只有主管能改能力等級、核准訓練、建立追加任務項目、管理帳號
- 排班人員能排班、指派追加任務、登記可上班範圍，但不能改動 PT 的能力等級

## 五、檔案結構規範

```
/src
  /app
    /api/...           ← 所有後端邏輯，不要在 client component 直接寫資料庫
    /admin/...         ← 後台頁面，layout 內驗證登入 + role
  /lib
    /supabase
      client.ts        ← 給 client component 用（anon key）
      server.ts        ← 給 API Routes 用（service role key）
    /auth
      requireRole.ts   ← 中介層，檢查後台使用者 role
  /components/ui       ← 純 UI 元件（按鈕、表格、Modal）
  /components/admin    ← 後台專用元件
/supabase
  /migrations          ← 每次 schema 改動建一個 .sql 檔
```

## 六、Git 規範

- 每個 Phase 結束 commit 一次（最小單位）
- 重要決策變更也獨立 commit
- Commit message 用中文，格式：
  ```
  Phase X: 簡短描述

  - 細節 1
  - 細節 2
  ```
- 使用者要求才 push，不要自動 push

## 七、UI/UX 原則

- 後台桌機優先操作（排班需要看表格、勾選），但不要破壞手機可讀（主管可能用手機查詢）
- Tailwind 用 mobile-first 原則
- 日期顯示用 `YYYY/MM/DD`
- 建議名單掛零時要有明顯的「人力缺口」警示，不能安靜顯示空名單
- 能力等級用顏色區分：一級（灰／無）、二級（琥珀色／訓練中）、三級（綠色／可獨立執行）

## 八、不要做的事

- ❌ 不要為了「未來可能用到」加欄位／加表
- ❌ 不要寫過度抽象的 helper / 通用元件（先重複，三次以上才抽）
- ❌ 不要加 try/catch 包裹「不可能失敗」的程式碼
- ❌ 不要在 commit 訊息加「Generated with Claude」「Co-Authored-By」（除非使用者要求）
- ❌ 不要建立 README.md（CLAUDE.md 已足夠）
- ❌ 不要寫多行註解。必要的單行註解只解釋 **為什麼**，不解釋 **做什麼**
- ❌ 不要參考「訂餐系統」那個專案的程式碼或資料庫——兩者完全獨立

## 九、測試原則

- 第一階段不寫單元測試（成本高，使用者不熟）
- 每個 Phase 結束**手動測試**主要流程，並寫進 PROJECT_LOG.md
