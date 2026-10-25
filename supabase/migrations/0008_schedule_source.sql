-- 自動排班（GitHub issue #3 決議）：分出哪些格子是系統排的、哪些是 Cynthia 自己排的。
-- 自己排或改過的格子（manual）視為鎖定，重新自動排班時保留；系統排的（auto）每次重排都重新計算。
-- 既有的班表全部是手動排的，預設值 manual 剛好符合。

alter table daily_schedule
  add column source text not null default 'manual' check (source in ('manual', 'auto'));
