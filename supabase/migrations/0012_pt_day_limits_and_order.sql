-- 控制人力成本（Cynthia 2026-11-18 決議）：排班順序＋每週最多天數

-- 排班順序：人多要砍班時「最後」的人先砍，缺人時照樣會排
alter table pt_staff add column schedule_order text not null default '一般'
  check (schedule_order in ('優先', '一般', '最後'));

-- 每週最多天數：在可上班範圍登記頁設定，沒設的週沿用最近一次設定；max_days 為 null＝回到系統規則（最多 4 天）
create table pt_weekly_day_limits (
  pt_id uuid not null references pt_staff(id) on delete cascade,
  week_start date not null,
  max_days int check (max_days between 1 and 4),
  updated_at timestamptz not null default now(),
  primary key (pt_id, week_start)
);

alter table pt_weekly_day_limits enable row level security;
create policy "後台帳號可讀取" on pt_weekly_day_limits for select using (current_admin_role() is not null);
create policy "主管與排班人員可寫入" on pt_weekly_day_limits for all using (current_admin_role() in ('主管', '排班人員'));
