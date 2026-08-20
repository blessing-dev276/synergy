-- One-off cleanup: "ZZZ Test Rank A"/"ZZZ Test Rank B" and the advancement
-- request between them were created to verify 0082's auto-fire end-to-end
-- (a member finishing the one path attached to Rank A correctly filed a
-- request to Rank B, which an admin then approved). rank_advancement_
-- requests intentionally has no delete grant or RPC, same as rank_task_
-- submissions -- it's meant to be permanent history -- so the test ranks
-- can't be removed through admin_delete_rank while that row still
-- references them. Deleting both here, once, rather than leaving
-- obviously-fake ranks sitting in the live Business Path Builder.
delete from public.rank_advancement_requests
  where from_rank_id in (select id from public.ranks where title in ('ZZZ Test Rank A', 'ZZZ Test Rank B'))
     or to_rank_id in (select id from public.ranks where title in ('ZZZ Test Rank A', 'ZZZ Test Rank B'));

delete from public.ranks where title in ('ZZZ Test Rank A', 'ZZZ Test Rank B');
