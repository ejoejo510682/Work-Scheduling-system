-- 新版崗位（時數制）兩個設定（Cynthia 2026-11-28）
-- 週六可以做的時間：null＝跟平日一樣。無包裝出貨週六從早上開始，橫跨上午、下午
alter table positions add column saturday_windows jsonb;
-- 上午、下午都要有人：時數平均分到上午、下午兩邊（只有可以做的時間兩邊都有才分）。箱出貨訂單上午、下午都會出
alter table positions add column split_halves boolean not null default false;

update positions set split_halves = true where hour_based and name in ('箱出貨', '無包裝出貨');
update positions set saturday_windows = '[["09:00","12:30"],["13:30","17:30"]]' where hour_based and name = '無包裝出貨';
