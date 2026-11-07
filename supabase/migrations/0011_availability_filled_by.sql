-- 可上班範圍是誰填的：員工自己填寫＝「本人」，後台改的＝那個後台帳號的名字，只記最後改的人（Cynthia 2026-11-07）
alter table pt_daily_availability add column filled_by text;

-- 由資料庫自己判斷，前端不能亂填：有登入後台（auth.uid() 有值）就是那個帳號；員工頁面走伺服器端，帶「本人」進來。
-- 內容沒變（例如員工重送整個月、沒動到後台改過的那天）就保留原本是誰填的
create function set_availability_filled_by() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.range = old.range and old.filled_by is not null then
    new.filled_by := old.filled_by;
  elsif auth.uid() is not null then
    new.filled_by := coalesce((select name from admin_users where id = auth.uid()), '後台');
  end if;
  return new;
end;
$$;

create trigger availability_filled_by
before insert or update on pt_daily_availability
for each row execute function set_availability_filled_by();
