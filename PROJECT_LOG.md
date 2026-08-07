# 開發進度紀錄

## 2026/08/07

- 完成規劃書（v0.8），確認所有核心功能設計：崗位與能力（三級制）、5 個時段結構、崗位×時段對照、崗位標準需求人力、每日可上班範圍（含半天班）、週排班＋臨時異動邏輯、本週追加任務、班表匯出 PDF、新增崗位/PT 流程
- Phase 0 環境建置開始：
  - 用 `create-next-app` 建立 Next.js 專案（TypeScript + Tailwind + App Router + src 目錄），資料夾位置 `C:\Users\Cynthia\Desktop\claude project\排班系統`
  - 建立 CLAUDE.md、SKILL.md、PROJECT_LOG.md
  - 待辦：git 初始化、GitHub repo、Supabase 專案（使用者自行建立後提供金鑰）
- git repo 初始化並完成第一個 commit（身份沿用訂餐系統：ejoejo510682）
- GitHub remote 設定完成：https://github.com/ejoejo510682/Work-Scheduling-system（尚未 push，待使用者確認）
- 寫好第一份資料庫 migration `supabase/migrations/0001_init.sql`：12 張表 + RLS 政策（主管全權限；排班人員可寫入可上班範圍／班表／追加任務指派；兩者皆可讀取）。同一 date+slot+pt_id 用 unique constraint 防止重複指派。待使用者提供 Supabase 專案金鑰後即可執行
- Supabase 專案建立完成（沿用 lunch-order-system 這個 organization），`.env.local` 已設定，migration 已執行並驗證 RLS 正常運作
- 建立第一個主管帳號：ejoejo510682@gmail.com（Cynthia，role=主管），已寫入 admin_users 表
- 完成登入頁面（/login）與後台外殼（/admin，requireRole 檢查登入與角色，顯示姓名/角色/登出）；根目錄 / 依登入狀態自動導向
- 密碼錯誤的錯誤提示已用瀏覽器測試確認正常；登入成功流程待使用者自行用密碼測試
- 下一步：崗位／能力／PT 名單基礎資料管理頁面（Phase 1 剩餘部分）
