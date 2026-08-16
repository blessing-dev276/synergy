-- Opt-in per-module sequencing: when true, lesson N+1 is locked (in the
-- frontend) until lesson N is completed. Defaults false so every existing
-- module -- none of which were built with a strict watch-in-order intent --
-- is completely unaffected; an admin turns it on per module (chapter sets
-- of one shared video are the obvious case, but any module can use it).
alter table public.modules add column sequential boolean not null default false;
