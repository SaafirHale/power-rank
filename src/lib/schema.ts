/** Idempotent schema; safe to run on every start-up. */
export const SCHEMA = `
create table if not exists meta (
  key text primary key,
  value text not null
);

create table if not exists series (
  slug text primary key,
  name text not null,
  color text not null,
  sort int not null default 0
);

create table if not exists characters (
  id serial primary key,
  slug text not null unique,
  name text not null,
  form text,
  series text not null references series(slug),
  elo double precision not null default 1500,
  elo_games int not null default 0,
  active boolean not null default true
);

-- One row per vote. a_id < b_id always, so (a, b) and (b, a) are the same pair.
-- voter is an HMAC of the visitor cookie id, never the id itself.
create table if not exists votes (
  id bigserial primary key,
  a_id int not null references characters(id),
  b_id int not null references characters(id),
  winner_id int not null references characters(id),
  voter text not null,
  day date not null,
  created_at timestamptz not null default now(),
  check (a_id < b_id),
  check (winner_id = a_id or winner_id = b_id)
);
create unique index if not exists votes_one_per_pair_per_day on votes (voter, a_id, b_id, day);
create index if not exists votes_pair on votes (a_id, b_id);

-- Fixed-window counters. key embeds the rule name and a hashed, daily-salted
-- network key; rows older than two days are purged by the refit job.
create table if not exists rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

create table if not exists fits (
  id serial primary key,
  fitted_at timestamptz not null default now(),
  n_votes int not null,
  n_characters int not null,
  iterations int not null,
  converged boolean not null
);

create table if not exists ratings (
  fit_id int not null references fits(id) on delete cascade,
  character_id int not null references characters(id),
  theta double precision not null,
  se double precision not null,
  wins int not null,
  losses int not null,
  primary key (fit_id, character_id)
);
`;
