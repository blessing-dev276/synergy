// "Status" -- a fixed leadership/pin title (0103), separate from the
// free-form Rank Journey ladder and from a member's account status
// (active/pending/suspended/removed). Admin-assigned only; a member can
// also have none at all (null = "No status"). Order here is the real
// ladder order, for anything that needs to compare "at least X" later.
export const DISTRIBUTOR_STATUSES = [
  { key: "distributor", label: "Distributor" },
  { key: "manager", label: "Manager" },
  { key: "senior_manager", label: "Senior Manager" },
  { key: "executive_manager", label: "Executive Manager" },
  { key: "director", label: "Director" },
  { key: "emerald_director", label: "Emerald Director" },
  { key: "sapphire_director", label: "Sapphire Director" },
];

export const DISTRIBUTOR_STATUS_LABEL = Object.fromEntries(DISTRIBUTOR_STATUSES.map((s) => [s.key, s.label]));
