-- 同一時段內，一個人可以有「第一任務」跟「第二任務（備援）」

alter table daily_schedule
  add column priority smallint not null default 1 check (priority in (1, 2));

alter table daily_schedule
  drop constraint daily_schedule_date_slot_pt_id_key;

alter table daily_schedule
  add constraint daily_schedule_date_slot_pt_id_priority_key unique (date, slot, pt_id, priority);
