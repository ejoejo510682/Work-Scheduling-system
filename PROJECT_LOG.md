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
- Phase 1 完成：
  - 直接用已確認的規劃資料，透過 Supabase API 建好 7 個崗位、對應訓練項目、標準需求人力、崗位×時段對照，以及 7 位 PT 名單（姜文雯、王瀞玉、張智為、楊鎔慈、李睿懷、熊庭漢、黃品甄）
  - 建立 /admin/positions（崗位管理，含新增）、/admin/pt（PT 名單管理，含新增）、/admin/abilities（能力等級 7×7 表格，直接調整一/二/三級）三個主管專用頁面
  - 後台導覽列依角色顯示不同連結
  - 使用者已用真實帳密測試登入成功
- 下一步：Phase 2 能力總表查詢頁（給主管與排班人員都能看的唯讀版本）
- 已部署到 Vercel：https://work-scheduling-system.vercel.app （使用者自行完成 GitHub/Vercel 連動與環境變數設定；已用瀏覽器確認登入頁正常運作、無錯誤）
- Phase 2 完成：/admin/ability-summary 能力總表查詢頁（主管與排班人員皆可看，唯讀彩色標籤），導覽列同步更新
- 下一步：Phase 3 訓練紀錄與升等核准
- Phase 3 完成：/admin/training 訓練紀錄頁（主管專用）——登記受訓自動把能力調成二級，核准完訓自動調成三級並記錄核准人/時間
- 下一步：Phase 4 可上班範圍登記（含半天班）
