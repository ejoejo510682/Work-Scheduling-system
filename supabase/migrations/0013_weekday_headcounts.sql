-- 崗位需求人數可以照週一到週五分開設定；留空（null）代表跟平常一樣（週一欄位 0006 已經有）
alter table position_headcount
  add column tuesday_headcount smallint check (tuesday_headcount >= 1),
  add column wednesday_headcount smallint check (wednesday_headcount >= 1),
  add column thursday_headcount smallint check (thursday_headcount >= 1),
  add column friday_headcount smallint check (friday_headcount >= 1);
