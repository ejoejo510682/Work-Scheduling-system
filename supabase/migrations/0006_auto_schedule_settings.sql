-- 自動排班要用的設定（GitHub issue #3、#4、#5 的決議），全部放進既有的「人員名單管理」「崗位管理」
-- 「假日與檔期」頁面讓 Cynthia 自己改。排班順序、出貨優先日怎麼算、印單輪排、備援對照這類很少變的
-- 規則寫在程式裡，不在這裡。
-- 包在同一個交易裡：中間任何一步失敗就全部不套用，不會留下改到一半的資料

begin;

-- ────────────────────────────────────
-- 人員
-- ────────────────────────────────────
alter table pt_staff
  add column primary_group text not null default '出貨組' check (primary_group in ('出貨組', '進貨組')),
  add column gender text not null default '女' check (gender in ('男', '女')),
  add column can_work_saturday boolean not null default true,
  -- 週六 PT 一次排「多」組 2 位＋「少」組 1 位（多＝三級崗位多的人）；正職不分組，只看 can_work_saturday
  add column saturday_group text check (saturday_group in ('多', '少')),
  add column auto_schedule_weekdays boolean not null default true,
  -- 週一、正職第三天固定由這位正職印訂單
  add column is_weekday_printer boolean not null default false;

-- 性別沒有合理的預設值，新增人員時一定要選
alter table pt_staff alter column gender drop default;

update pt_staff set primary_group = '進貨組' where name in ('連陳軒', '李玄鳳');
update pt_staff set gender = '男' where name in ('連陳軒', '李睿懷', '林清瑞');
update pt_staff set can_work_saturday = false where name in ('黃盈珊', '連陳軒');
update pt_staff set saturday_group = '多' where name in ('李睿懷', '楊鎔慈', '葉翠茹');
update pt_staff set saturday_group = '少' where name in ('林清瑞', '陳語姍', '黃依婷', '李玄鳳');
update pt_staff set auto_schedule_weekdays = false where name = '許庭瑄';
update pt_staff set is_weekday_printer = true where name = '王瀞玉';

-- ────────────────────────────────────
-- 崗位
-- ────────────────────────────────────
alter table positions
  add column work_group text not null default '出貨組' check (work_group in ('出貨組', '進貨組')),
  -- 任務型崗位（處理批發訂單、處理退貨、盤點）不自動排，改用任務登記
  add column included_in_auto_schedule boolean not null default true,
  add column gender_restriction text check (gender_restriction in ('男', '女')),
  -- 同一時段的上限，備援也算在內（包裝站只有 4 個工位）
  add column max_headcount smallint check (max_headcount >= 1),
  -- 下午出訂單後，每個出貨崗位先各 1 人，接著先把這個崗位排滿，再排其他崗位
  add column fill_first boolean not null default false;

update positions set work_group = '進貨組' where name in ('處理進貨', '處理團購訂單');
update positions set included_in_auto_schedule = false where name in ('處理批發訂單', '處理退貨', '盤點');
update positions set gender_restriction = '男' where name = '出箱貨';
update positions set max_headcount = 4 where name = '包裝';
update positions set fill_first = true where name = '無包裝出貨';

-- 崗位優先人選：排這個崗位時先照 rank（小的先）挑，都排不了才用一般挑人順序
create table position_preferred_staff (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references positions(id) on delete cascade,
  pt_id uuid not null references pt_staff(id) on delete cascade,
  rank smallint not null,
  unique (position_id, pt_id)
);

alter table position_preferred_staff enable row level security;
create policy "後台帳號可讀取" on position_preferred_staff for select using (current_admin_role() is not null);
create policy "主管可寫入" on position_preferred_staff for all using (current_admin_role() = '主管');

insert into position_preferred_staff (position_id, pt_id, rank)
select p.id, s.id, r.rank
from (values ('林清瑞', 1), ('李睿懷', 2)) as r(name, rank)
join pt_staff s on s.name = r.name
cross join positions p
where p.name = '出箱貨';

-- ────────────────────────────────────
-- 崗位需求人數：改成每個時段各自設定，並可另外設定週一、出貨優先日的人數
-- ────────────────────────────────────
-- slot 為 null 的那一列只給沒有綁定時段的「彈性」崗位用
alter table position_headcount
  add column slot text check (slot in ('上午出訂單前', '上午出訂單後', '下午出訂單前', '下午出訂單後', '出貨完成後')),
  -- null＝跟平常一樣
  add column monday_headcount smallint check (monday_headcount >= 1),
  add column priority_headcount smallint check (priority_headcount >= 1);

alter table position_headcount drop constraint position_headcount_position_id_key;
alter table position_headcount add constraint position_headcount_position_slot_key unique nulls not distinct (position_id, slot);

-- 有綁定時段的崗位：原本的一個人數複製到每個時段，再刪掉原本那一列
insert into position_headcount (position_id, slot, headcount)
select h.position_id, m.slot, h.headcount
from position_headcount h
join position_slot_map m on m.position_id = h.position_id
where h.slot is null;

delete from position_headcount h
where h.slot is null
  and exists (select 1 from position_slot_map m where m.position_id = h.position_id);

update position_headcount set headcount = 3, priority_headcount = 4
where slot = '上午出訂單後' and position_id = (select id from positions where name = '撿貨');
update position_headcount set headcount = 2, priority_headcount = 3
where slot = '下午出訂單後' and position_id = (select id from positions where name = '撿貨');
update position_headcount set priority_headcount = 3
where position_id = (select id from positions where name = '包裝');
update position_headcount set priority_headcount = 2
where position_id = (select id from positions where name = '出箱貨');
update position_headcount set monday_headcount = 3, priority_headcount = 3
where position_id = (select id from positions where name = '無包裝出貨');

-- ────────────────────────────────────
-- 假日與檔期：新增「出貨優先日」「颱風假／臨時停班」
-- ────────────────────────────────────
alter table special_dates drop constraint special_dates_type_check;
alter table special_dates add constraint special_dates_type_check
  check (type in ('國定假日', '電商檔期', '出貨優先日', '颱風假／臨時停班'));

update special_dates set type = '颱風假／臨時停班' where name = '颱風假';

commit;
