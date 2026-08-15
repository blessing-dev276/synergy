-- Business Path v2, part 2 of 3: the new schema. Replaces the whole
-- stage/track/rank-ladder/specialization shape 0058 just tore down with
-- something much simpler -- an admin creates any ranks they want, freely
-- named (no fixed ladder, no seed data), and attaches whole Learning Hub
-- paths to each one. Each member has exactly one rank at a time, set
-- directly by an admin (a plain column on profiles, not a join table --
-- mirrors how participation_path already lives directly on profiles, 0043).
--
-- Members see only their rank's attached paths, plus (reusing 0047's
-- "unattached = visible to everyone" convention, the same rule that used to
-- gate specialization-locked paths) any path never attached to any rank at
-- all -- so the Learning Hub isn't empty before an admin configures
-- anything. learning_paths.is_skill is the fresh, minimal replacement for
-- the dropped specialization_id column (also dropped here) as the thing
-- participation_path = 'network_marketing_only' filters out -- the old
-- skill/business/freelancing "track" concept is gone, so this is just a
-- boolean now.
--
-- All the read/write logic (get_learning_paths, the admin CRUD RPCs) lands
-- in 0060 -- this file is schema + RLS only.

-- ---------- ranks: admin free text, no fixed set, no seed data ----------
create table public.ranks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  order_index int not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ranks_order_idx on public.ranks (order_index);

alter table public.ranks enable row level security;
grant select on public.ranks to authenticated;
create policy ranks_select on public.ranks for select using (auth.uid() is not null);
-- no client insert/update/delete grant: rows are written only by
-- admin_create_rank/admin_update_rank/admin_delete_rank (0060), all
-- SECURITY DEFINER -- same no-client-write convention business_path_tracks
-- and friends used (0050).

-- ---------- rank_learning_paths: which Learning Hub paths a rank attaches ----------
create table public.rank_learning_paths (
  rank_id uuid not null references public.ranks(id) on delete cascade,
  learning_path_id uuid not null references public.learning_paths(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (rank_id, learning_path_id)
);
create index rank_learning_paths_learning_path_idx on public.rank_learning_paths (learning_path_id);

alter table public.rank_learning_paths enable row level security;
grant select on public.rank_learning_paths to authenticated;
create policy rank_learning_paths_select on public.rank_learning_paths for select using (auth.uid() is not null);
-- no client insert/update/delete grant: rows are written only by
-- admin_set_rank_learning_paths (0060), SECURITY DEFINER.

-- ---------- profiles.rank_id: exactly one rank at a time, admin-set ----------
alter table public.profiles add column rank_id uuid references public.ranks(id) on delete set null;
create index profiles_rank_id_idx on public.profiles (rank_id);

-- ---------- learning_paths: is_skill replaces the dropped specialization_id ----------
-- Same participation_path = 'network_marketing_only' filter target
-- specialization_id used to serve (0038/0043), just a plain boolean now that
-- the track/specialization taxonomy is gone entirely.
alter table public.learning_paths add column is_skill boolean not null default false;
alter table public.learning_paths drop column specialization_id;
