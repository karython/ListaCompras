-- DB schema for Lista de Compras

-- items
create table if not exists items (
  id bigserial primary key,
  name text not null,
  category text,
  price numeric default 0,
  created_at timestamptz default now()
);

-- markets
create table if not exists markets (
  id bigserial primary key,
  name text not null unique,
  created_at timestamptz default now()
);

-- price_history
create table if not exists price_history (
  id bigserial primary key,
  item_name text not null,
  market text not null,
  price numeric default 0,
  created_at timestamptz default now(),
  constraint uniq_item_market unique (item_name, market)
);
