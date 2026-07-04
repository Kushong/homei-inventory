-- ============================================================
-- HOME+I (홈) 재고 관리 시스템 - Supabase DB 스키마
-- ============================================================

-- 확장 기능: UUID 생성
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. 카테고리
-- ------------------------------------------------------------
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. 거래처 (공급처 / 고객사 등)
-- ------------------------------------------------------------
create table partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text, -- 예: SUPPLIER, CUSTOMER
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. 상품
-- ------------------------------------------------------------
create table products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  category_id uuid references categories(id),
  partner_id uuid references partners(id),
  price numeric(12,2) default 0,
  safety_stock integer not null default 0,
  image_url text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 4. 관리자 프로필 (auth.users 확장)
-- ------------------------------------------------------------
create table admin_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 5. 재고 거래 로그 (핵심 테이블)
--    direction: IN / OUT / ADJUST
--    reason   : PURCHASE, SALE, SAMPLE, RETURN,
--               EXCHANGE_OUT, EXCHANGE_IN, ADJUSTMENT
-- ------------------------------------------------------------
create table inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  direction text not null check (direction in ('IN', 'OUT', 'ADJUST')),
  reason text not null check (reason in (
    'PURCHASE', 'SALE', 'SAMPLE', 'RETURN',
    'EXCHANGE_OUT', 'EXCHANGE_IN', 'ADJUSTMENT'
  )),
  quantity integer not null check (quantity > 0),
  exchange_group_id uuid, -- 교환(EXCHANGE_OUT + EXCHANGE_IN) 짝을 묶는 키
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index idx_inventory_transactions_product on inventory_transactions(product_id);
create index idx_inventory_transactions_created_at on inventory_transactions(created_at);

-- ------------------------------------------------------------
-- 6. 실시간 재고 뷰 (저장하지 않고 항상 집계로 계산)
-- ------------------------------------------------------------
create view current_stock as
select
  p.id as product_id,
  p.sku,
  p.name,
  p.safety_stock,
  coalesce(sum(
    case
      when t.direction = 'IN' then t.quantity
      when t.direction = 'OUT' then -t.quantity
      when t.direction = 'ADJUST' then t.quantity -- 조정은 +/- 부호 그대로 사용
      else 0
    end
  ), 0) as stock_quantity
from products p
left join inventory_transactions t on t.product_id = p.id
group by p.id, p.sku, p.name, p.safety_stock;

-- ------------------------------------------------------------
-- 7. 저재고 알림 뷰
-- ------------------------------------------------------------
create view low_stock_alert as
select *
from current_stock
where stock_quantity <= safety_stock;

-- ============================================================
-- 8. Row Level Security (RLS)
-- ============================================================
alter table products enable row level security;
alter table categories enable row level security;
alter table partners enable row level security;
alter table inventory_transactions enable row level security;
alter table admin_profiles enable row level security;

-- 공개(비로그인) 조회 허용: 메인 리스트/검색용
create policy "public read products"
  on products for select
  to anon
  using (true);

create policy "public read categories"
  on categories for select
  to anon
  using (true);

-- 거래 등록/이력 조회는 로그인한 관리자만
create policy "authenticated read transactions"
  on inventory_transactions for select
  to authenticated
  using (true);

create policy "authenticated insert transactions"
  on inventory_transactions for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "authenticated read partners"
  on partners for select
  to authenticated
  using (true);

create policy "authenticated read admin profiles"
  on admin_profiles for select
  to authenticated
  using (true);

-- 참고: current_stock / low_stock_alert 뷰는 기반 테이블(products)의
-- RLS를 상속하므로 anon도 조회 가능합니다.
