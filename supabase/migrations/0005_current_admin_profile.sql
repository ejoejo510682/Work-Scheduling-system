-- 效能優化：後台驗證身份時，原本要先問 Supabase Auth「這是誰」再查 admin_users「角色是什麼」，
-- 兩趟網路來回加起來拖慢每次換頁的速度。這個函式讓資料庫直接靠 auth.uid()（Supabase 已經幫我們
-- 驗證過的登入者 id）一次查出完整資料，省掉前面那一趟。跟既有的 current_admin_role() 是同一種寫法，
-- 純粹新增、不改動任何現有資料表或權限規則。
create or replace function public.current_admin_profile()
returns table (id uuid, role text, name text)
language sql security definer stable set search_path = public as $$
  select id, role, name from admin_users where id = auth.uid();
$$;
