-- 新版崗位的最高時數改成五種日子（Cynthia 2026-11-27）：活動日／週一週二／週三／週四週五／週六
-- 原本的「一般日」還沒有人填過，直接拆成週三、週四週五兩格
alter table positions drop column hours_normal;
alter table positions
  add column hours_wednesday numeric(5,1) check (hours_wednesday >= 0),
  add column hours_thu_fri numeric(5,1) check (hours_thu_fri >= 0);
