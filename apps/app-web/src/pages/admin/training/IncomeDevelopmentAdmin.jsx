import SkillDevelopmentAdmin from "./SkillDevelopmentAdmin.jsx";

// Per the spec's role table (§3): milestones/portfolio/income are
// per-member and self-managed -- admin's only lever here is the Skill
// Catalog, which reuses the exact Skill Development class editor with
// purpose="income_development" (§8.2). Nothing else to author.
export default function IncomeDevelopmentAdmin() {
  return (
    <div>
      <p style={{ color: "var(--slate)", marginBottom: "16px" }}>
        Members manage their own skill, portfolio, income log and milestones. The Skill Catalog below is the one thing your office authors for this stage — the
        same class editor as Skill Development, with its own separate set of classes.
      </p>
      <SkillDevelopmentAdmin purpose="income_development" />
    </div>
  );
}
