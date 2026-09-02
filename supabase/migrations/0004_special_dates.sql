-- 國定假日 + 自訂電商檔期提醒，讓排班時能一眼看到特殊日期
-- 電商檔期的「每月雙字日/18號/25號」規律是用程式算的，不用存進這張表；
-- 這張表放的是每年會變動的國定假日、以及規律之外的自訂檔期（例如黑色星期五）
create table special_dates (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  type text not null check (type in ('國定假日', '電商檔期')),
  name text not null,
  note text,
  created_at timestamptz not null default now()
);

alter table special_dates enable row level security;

create policy "後台帳號可讀取" on special_dates for select using (current_admin_role() is not null);
create policy "主管與排班人員可寫入" on special_dates for all
  using (current_admin_role() in ('主管', '排班人員'));
