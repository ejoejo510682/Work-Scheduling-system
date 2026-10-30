-- 進貨組的人勾了這個，出貨優先日就不會被自動排去支援出貨，整天做進貨（Cynthia 2026-10-31）。週六不受影響
alter table pt_staff add column skip_priority_shipping_support boolean not null default false;
