-- 新版崗位的最高時數改成週一到週六每天分開填（Cynthia 2026-11-29），活動日照舊
-- 原本的「週一週二」「週四週五」改名成週一、週四，週二、週五先照抄原本的數字，之後再各自改
alter table positions rename column hours_mon_tue to hours_monday;
alter table positions rename column hours_thu_fri to hours_thursday;
alter table positions
  add column hours_tuesday numeric(5,1) check (hours_tuesday >= 0),
  add column hours_friday numeric(5,1) check (hours_friday >= 0);
update positions set hours_tuesday = hours_monday, hours_friday = hours_thursday where hour_based;
