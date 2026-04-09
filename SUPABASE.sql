-- ═══════════════════════════════════════════════
-- PUNA STUDIO — Supabase Database Schema
-- Paste this into Supabase → SQL Editor → Run
-- ═══════════════════════════════════════════════

-- Rights Holders (platform accounts)
create table rights_holders (
  id          uuid primary key default gen_random_uuid(),
  email       text unique not null,
  name        text not null,
  created_at  timestamptz default now()
);

-- Studio auth tokens (magic links)
create table studio_tokens (
  id                  uuid primary key default gen_random_uuid(),
  token               text unique not null,
  rights_holder_id    uuid references rights_holders(id) on delete cascade,
  expires_at          timestamptz not null,
  used                boolean default false,
  created_at          timestamptz default now()
);

-- Projects
create table projects (
  id                uuid primary key default gen_random_uuid(),
  rights_holder_id  uuid references rights_holders(id) on delete cascade,
  title             text not null,
  type              text not null default 'series', -- series, film, documentary, short, music, other
  description       text,
  rh_name           text not null,   -- rights holder display name
  rh_pct            numeric not null default 60,
  kt_pct            numeric not null default 30,  -- key team pool %
  crew_pct          numeric not null default 10,  -- crew pool %
  locked            boolean default false,
  created_at        timestamptz default now()
);

-- Project members (key team + crew)
create table members (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects(id) on delete cascade,
  pool        text not null,   -- 'key_team' or 'crew'
  name        text,
  role        text,
  email       text,
  pct         numeric not null default 0,
  status      text not null default 'pending',  -- pending, accepted, declined
  signed_name text,
  created_at  timestamptz default now()
);

-- Invite tokens (sent to crew/team)
create table invite_tokens (
  id              uuid primary key default gen_random_uuid(),
  token           text unique not null,
  project_id      uuid references projects(id) on delete cascade,
  member_name     text,
  member_email    text,
  member_role     text,
  member_pool     text,   -- 'key_team' or 'crew'
  member_pct      numeric,
  rh_name         text,
  sender_name     text,
  status          text not null default 'pending',  -- pending, accepted, declined
  signed_name     text,
  expires_at      timestamptz not null,
  responded_at    timestamptz,
  created_at      timestamptz default now()
);

-- ── INDEXES ──────────────────────────────────────
create index on studio_tokens(token);
create index on studio_tokens(rights_holder_id);
create index on projects(rights_holder_id);
create index on members(project_id);
create index on invite_tokens(token);
create index on invite_tokens(project_id);

-- ── ROW LEVEL SECURITY ───────────────────────────
-- Enable RLS (service key bypasses this — safe for server-side only)
alter table rights_holders enable row level security;
alter table projects enable row level security;
alter table members enable row level security;
alter table studio_tokens enable row level security;
alter table invite_tokens enable row level security;
