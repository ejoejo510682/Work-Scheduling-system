-- Phase 0/1：初始 schema，對照 CLAUDE.md 第五節

create extension if not exists pgcrypto;

-- 1. 崗位
create table positions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  sort_order int not null default 0
);

-- 2. PT 人員
create table pt_staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true
);

-- 3. PT 能力對照（一／二／三級）
create table pt_abilities (
  id uuid primary key default gen_random_uuid(),
  pt_id uuid not null references pt_staff(id),
  position_id uuid not null references positions(id) on delete restrict,
  level smallint not null default 1 check (level in (1, 2, 3)),
  unique (pt_id, position_id)
);

-- 4. 訓練項目清單（跟崗位一一對應）
create table training_items (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references positions(id) on delete restrict,
  name text not null
);

-- 5. 訓練紀錄
create table training_records (
  id uuid primary key default gen_random_uuid(),
  pt_id uuid not null references pt_staff(id),
  training_item_id uuid not null references training_items(id) on delete restrict,
  status text not null default '進行中' check (status in ('進行中', '已完成')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

-- 6. 每日可上班範圍（全天／半天／休假 統一欄位）
create table pt_daily_availability (
  id uuid primary key default gen_random_uuid(),
  pt_id uuid not null references pt_staff(id),
  date date not null,
  range text not null default '全天' check (range in ('全天', '只上午', '只下午', '全天休假')),
  unique (pt_id, date)
);

-- 7. 崗位標準需求人力
create table position_headcount (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references positions(id) on delete cascade,
  headcount smallint not null default 1,
  unique (position_id)
);

-- 8. 崗位 × 時段對照
create table position_slot_map (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references positions(id) on delete cascade,
  slot text not null check (slot in ('上午出訂單前', '上午出訂單後', '下午出訂單前', '下午出訂單後', '出貨完成後')),
  unique (position_id, slot)
);

-- 9. 每日班表（同一 date+slot+pt_id 只能對應一個崗位，防止重複指派）
create table daily_schedule (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  slot text not null check (slot in ('上午出訂單前', '上午出訂單後', '下午出訂單前', '下午出訂單後', '出貨完成後')),
  position_id uuid not null references positions(id) on delete restrict,
  pt_id uuid not null references pt_staff(id),
  unique (date, slot, pt_id)
);

-- 10. 本週追加任務
create table weekly_tasks (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  name text not null,
  note text,
  required_position_id uuid references positions(id),
  required_level smallint check (required_level in (1, 2, 3)),
  status text not null default '待處理' check (status in ('待處理', '進行中', '已完成')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- 11. 追加任務指派（一個任務可指派給多人）
create table weekly_task_assignments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references weekly_tasks(id) on delete cascade,
  pt_id uuid not null references pt_staff(id),
  assigned_by uuid references auth.users(id),
  unique (task_id, pt_id)
);

-- 12. 後台帳號（對應 Supabase Auth 使用者）
create table admin_users (
  id uuid primary key references auth.users(id),
  email text not null unique,
  name text not null,
  role text not null check (role in ('主管', '排班人員'))
);

-- ────────────────────────────────────
-- RLS
-- ────────────────────────────────────

alter table positions enable row level security;
alter table pt_staff enable row level security;
alter table pt_abilities enable row level security;
alter table training_items enable row level security;
alter table training_records enable row level security;
alter table pt_daily_availability enable row level security;
alter table position_headcount enable row level security;
alter table position_slot_map enable row level security;
alter table daily_schedule enable row level security;
alter table weekly_tasks enable row level security;
alter table weekly_task_assignments enable row level security;
alter table admin_users enable row level security;

-- 判斷目前登入者的角色
create function current_admin_role() returns text
language sql security definer stable as $$
  select role from admin_users where id = auth.uid();
$$;

-- 兩個角色都能讀取所有後台資料
create policy "後台帳號可讀取" on positions for select using (current_admin_role() is not null);
create policy "後台帳號可讀取" on pt_staff for select using (current_admin_role() is not null);
create policy "後台帳號可讀取" on pt_abilities for select using (current_admin_role() is not null);
create policy "後台帳號可讀取" on training_items for select using (current_admin_role() is not null);
create policy "後台帳號可讀取" on training_records for select using (current_admin_role() is not null);
create policy "後台帳號可讀取" on pt_daily_availability for select using (current_admin_role() is not null);
create policy "後台帳號可讀取" on position_headcount for select using (current_admin_role() is not null);
create policy "後台帳號可讀取" on position_slot_map for select using (current_admin_role() is not null);
create policy "後台帳號可讀取" on daily_schedule for select using (current_admin_role() is not null);
create policy "後台帳號可讀取" on weekly_tasks for select using (current_admin_role() is not null);
create policy "後台帳號可讀取" on weekly_task_assignments for select using (current_admin_role() is not null);
create policy "本人可讀取自己的帳號資料" on admin_users for select using (current_admin_role() is not null);

-- 主管專屬寫入：基礎設定、能力等級、訓練紀錄、帳號管理
create policy "主管可寫入" on positions for all using (current_admin_role() = '主管');
create policy "主管可寫入" on pt_staff for all using (current_admin_role() = '主管');
create policy "主管可寫入" on pt_abilities for all using (current_admin_role() = '主管');
create policy "主管可寫入" on training_items for all using (current_admin_role() = '主管');
create policy "主管可寫入" on training_records for all using (current_admin_role() = '主管');
create policy "主管可寫入" on position_headcount for all using (current_admin_role() = '主管');
create policy "主管可寫入" on position_slot_map for all using (current_admin_role() = '主管');
create policy "主管可寫入" on admin_users for all using (current_admin_role() = '主管');

-- 主管與排班人員皆可寫入：可上班範圍、班表、追加任務指派
create policy "主管與排班人員可寫入" on pt_daily_availability for all
  using (current_admin_role() in ('主管', '排班人員'));
create policy "主管與排班人員可寫入" on daily_schedule for all
  using (current_admin_role() in ('主管', '排班人員'));
create policy "主管與排班人員可寫入" on weekly_task_assignments for all
  using (current_admin_role() in ('主管', '排班人員'));

-- 追加任務：主管建立/刪除，兩者都能更新進度狀態
create policy "主管可建立與刪除" on weekly_tasks for insert with check (current_admin_role() = '主管');
create policy "主管可刪除" on weekly_tasks for delete using (current_admin_role() = '主管');
create policy "主管與排班人員可更新進度" on weekly_tasks for update
  using (current_admin_role() in ('主管', '排班人員'));
