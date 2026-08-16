-- 正職也會協助出貨工作，需要跟 PT 排進同一套崗位/能力/排班系統
-- 用同一張表加身份別欄位，不另外開一張表，能力/可上班範圍/排班指派的邏輯完全不用重做
alter table pt_staff
  add column employment_type text not null default 'PT' check (employment_type in ('PT', '正職'));
