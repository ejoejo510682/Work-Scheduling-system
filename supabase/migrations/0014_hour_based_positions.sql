-- 新版排班（時數制，2026-11-26 Cynthia 決議，規則見「新版排班規則（時數制）.md」）步驟 1：新崗位與設定
-- 新崗位標成 hour_based，舊版自動排班、單日頁、列印只讀 hour_based = false 的舊崗位，切換前兩套互不影響

-- 新舊崗位會同名（印訂單、車趟、無包裝出貨、處理批發訂單），名字改成在同一套裡不重複
alter table positions drop constraint positions_name_key;
alter table positions
  add column hour_based boolean not null default false,
  -- 可以做的時間：[["09:00","12:30"],["13:30","17:30"]]
  add column work_windows jsonb not null default '[]',
  -- 最高可以安排的時數（null＝還沒填）：活動日（出貨優先日）／週一週二／一般日／週六
  add column hours_event numeric(5,1) check (hours_event >= 0),
  add column hours_mon_tue numeric(5,1) check (hours_mon_tue >= 0),
  add column hours_normal numeric(5,1) check (hours_normal >= 0),
  add column hours_saturday numeric(5,1) check (hours_saturday >= 0);
alter table positions add constraint positions_name_hour_based_key unique (name, hour_based);

insert into positions (name, hour_based, work_windows, sort_order, included_in_auto_schedule, gender_restriction) values
  ('印訂單', true, '[["08:30","09:00"]]', 101, true, null),
  ('出貨', true, '[["09:00","12:30"],["13:30","17:30"]]', 102, true, null),
  ('箱出貨', true, '[["10:00","12:30"],["13:30","15:00"]]', 103, true, '男'),
  ('無包裝出貨', true, '[["14:30","17:30"]]', 104, true, null),
  ('車趟', true, '[["13:30","14:30"]]', 105, true, null),
  ('一倉進退貨處理', true, '[["08:30","12:30"],["13:30","17:30"]]', 106, true, null),
  ('二倉團購進出貨', true, '[["08:30","12:30"],["13:30","17:30"]]', 107, true, null),
  ('內勤窗口', true, '[["08:30","12:30"],["13:30","17:30"]]', 108, true, null),
  ('處理批發訂單', true, '[["09:00","12:30"],["13:30","17:30"]]', 109, false, null);

-- 主要崗位（最多兩個、一樣優先）跟 PT 每週最多時數
alter table pt_staff
  add column main_position_ids uuid[] not null default '{}' check (cardinality(main_position_ids) <= 2),
  add column weekly_max_hours numeric(4,1) not null default 24 check (weekly_max_hours > 0);

-- Cynthia 2026-11-26 給的主要崗位名單
update pt_staff s
set main_position_ids = array(
  select p.id from positions p
  join unnest(m.names) with ordinality as n(name, ord) on p.name = n.name and p.hour_based
  order by n.ord
)
from (values
  ('連陳軒', array['二倉團購進出貨']),
  ('黃盈珊', array['一倉進退貨處理']),
  ('許庭瑄', array['內勤窗口']),
  ('王瀞玉', array['出貨']),
  ('李睿懷', array['出貨', '箱出貨']),
  ('陳語姍', array['出貨', '無包裝出貨']),
  ('林清瑞', array['箱出貨']),
  ('葉翠茹', array['出貨', '無包裝出貨']),
  ('李玄鳳', array['出貨']),
  ('黃依婷', array['出貨', '無包裝出貨']),
  ('羅子甯', array['出貨']),
  ('沈素菁', array['出貨']),
  ('陳威誌', array['車趟', '箱出貨'])
) as m(staff_name, names)
where s.name = m.staff_name;
