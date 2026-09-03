import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import Icon from "../../components/Icon.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";

// Reused by Income Development's "Skill Catalog" tab via purpose=
// "income_development" (§8.2) -- not wired up there yet, but nothing here
// is skill_development-specific.
export default function SkillDevelopmentMember({ purpose = "skill_development", basePath = "/training/classes" }) {
  const {
    loading,
    error,
    data: classes,
  } = useSupabaseQuery(
    () => supabase.from("classes").select("id, title, description").eq("purpose", purpose).eq("status", "published").order("created_at", { ascending: false }),
    [purpose],
  );

  if (loading) return <Skeleton variant="card" height="100px" />;
  if (error) return <ErrorState description="Couldn't load classes." />;

  if (!classes || classes.length === 0) {
    return (
      <div className="card">
        <EmptyState icon={<Icon name="layers" size={26} />} title="No classes published yet" description="Check back soon — your office is still building this curriculum." />
      </div>
    );
  }

  return (
    <div>
      {classes.map((c) => (
        <Link key={c.id} to={`${basePath}/${c.id}`} className="card" style={{ display: "block", marginBottom: "10px", color: "inherit" }}>
          <div className="card-title" style={{ marginBottom: c.description ? "4px" : 0 }}>
            {c.title}
          </div>
          {c.description && <div style={{ fontSize: "13.5px", color: "var(--slate)" }}>{c.description}</div>}
        </Link>
      ))}
    </div>
  );
}
