// Shared multi-select toggle helper -- used by OnboardingFlow.jsx's skill
// picker. The static INTERESTS list this file used to export is gone: it
// had drifted from the real Freelancing catalog (section key: skill_set;
// half its entries -- Freelancing (the old generic category, not this
// section), Network Marketing, Leadership, Business Development -- were
// never actual learning_paths.section='skill_set' rows), so
// OnboardingFlow.jsx now fetches the live published list instead of a
// hand-maintained one.
export function toggleOption(list, value) {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}
