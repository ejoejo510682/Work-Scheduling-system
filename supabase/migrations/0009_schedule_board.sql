-- 週排班表 B3 版面（GitHub issue #5 結論）＋進貨組支援出貨的崗位（2026-10-25）
-- 包在同一個交易裡：中間任何一步失敗就全部不套用

begin;

-- 鎖定分兩種顯示：照系統排的直接鎖住（locked）跟手動改過（manual）；重排時兩種都保留
alter table daily_schedule drop constraint daily_schedule_source_check;
alter table daily_schedule add constraint daily_schedule_source_check check (source in ('manual', 'auto', 'locked'));

-- 每週最後一次自動排班的紀錄：
--   special_dates：排班當時用的假日資料，之後假日有變動時提醒重排
--   notes：系統自己處理掉的情況（安排休假、印單有人頂上、任務代班……），放在「其他提示」
--   status／error：排班失敗時週排班表頁要提示（每週五自動排班也寫這裡）
create table auto_schedule_runs (
  week_start date primary key,
  ran_at timestamptz not null default now(),
  trigger text not null check (trigger in ('manual', 'cron')),
  status text not null check (status in ('success', 'failed')),
  error text,
  special_dates jsonb not null default '[]',
  notes jsonb not null default '[]'
);

alter table auto_schedule_runs enable row level security;
create policy "後台帳號可讀取" on auto_schedule_runs for select using (current_admin_role() is not null);
create policy "主管與排班人員可寫入" on auto_schedule_runs for all using (current_admin_role() in ('主管', '排班人員'));

-- 進貨組的人支援出貨時只排這個崗位；null＝不限
alter table pt_staff add column shipping_support_position_id uuid references positions(id) on delete set null;

update pt_staff set shipping_support_position_id = (select id from positions where name = '撿貨')
where name = '連陳軒';

commit;
