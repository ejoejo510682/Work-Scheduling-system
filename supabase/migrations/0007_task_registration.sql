-- 任務登記（GitHub issue #3 第十二次補充決議、#4 第十五輪、#5 結論）：取代舊的「本週追加任務」。
-- 舊的 weekly_tasks／weekly_task_assignments 保留不刪，頁面上還看得到過去的紀錄，只是不再新增。
-- 包在同一個交易裡：中間任何一步失敗就全部不套用

begin;

-- 本週任務（單次）：哪一天、哪個時段、哪個崗位要幾個人。自動排班不會自己挑人，
-- 沒指定滿的位子只會提醒 Cynthia 手動指定
create table task_requests (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  slot text not null check (slot in ('上午出訂單前', '上午出訂單後', '下午出訂單前', '下午出訂單後', '出貨完成後')),
  position_id uuid not null references positions(id) on delete restrict,
  headcount smallint not null default 1 check (headcount >= 1),
  note text,
  created_at timestamptz not null default now()
);

create table task_request_staff (
  request_id uuid not null references task_requests(id) on delete cascade,
  pt_id uuid not null references pt_staff(id),
  primary key (request_id, pt_id)
);

-- 固定任務（每週重複）：一列＝一個人在某個時段固定做某件事。週六不排任務，所以星期只有 1～5（1＝週一）
create table task_templates (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references positions(id) on delete restrict,
  slot text not null check (slot in ('上午出訂單前', '上午出訂單後', '下午出訂單前', '下午出訂單後', '出貨完成後')),
  weekdays smallint[] not null check (cardinality(weekdays) > 0 and weekdays <@ array[1, 2, 3, 4, 5]::smallint[]),
  pt_id uuid not null references pt_staff(id),
  -- 負責人請假時由誰代班；留空＝那個位子空著並提醒
  substitute_pt_id uuid references pt_staff(id),
  created_at timestamptz not null default now()
);

alter table task_requests enable row level security;
alter table task_request_staff enable row level security;
alter table task_templates enable row level security;

create policy "後台帳號可讀取" on task_requests for select using (current_admin_role() is not null);
create policy "後台帳號可讀取" on task_request_staff for select using (current_admin_role() is not null);
create policy "後台帳號可讀取" on task_templates for select using (current_admin_role() is not null);
create policy "主管與排班人員可寫入" on task_requests for all using (current_admin_role() in ('主管', '排班人員'));
create policy "主管與排班人員可寫入" on task_request_staff for all using (current_admin_role() in ('主管', '排班人員'));
create policy "主管與排班人員可寫入" on task_templates for all using (current_admin_role() in ('主管', '排班人員'));

-- 處理退貨：週一～週五，上午出訂單前王瀞玉、黃盈珊（請假不代），出貨完成後兩人（請假由許庭瑄代）
insert into task_templates (position_id, slot, weekdays, pt_id, substitute_pt_id)
select p.id, t.slot, array[1, 2, 3, 4, 5]::smallint[], s.id, sub.id
from (values
  ('上午出訂單前', '王瀞玉', null),
  ('上午出訂單前', '黃盈珊', null),
  ('出貨完成後', '王瀞玉', '許庭瑄'),
  ('出貨完成後', '黃盈珊', '許庭瑄')
) as t(slot, name, substitute_name)
join pt_staff s on s.name = t.name
left join pt_staff sub on sub.name = t.substitute_name
cross join positions p
where p.name = '處理退貨';

commit;
