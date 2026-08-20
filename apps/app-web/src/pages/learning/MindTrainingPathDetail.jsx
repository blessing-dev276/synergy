import { Link, useParams } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";
import Icon from "../../components/Icon.jsx";
import ProgressRing from "../../components/ProgressRing.jsx";

// Order these render in under "Recommended Personal Development" -- pd/pd
// resource_type set (0068_personal_development.sql), grouped exactly like
// Part 11's spec example (Books, then Podcasts, Videos, then everything
// else as "Resources").
const RESOURCE_TYPE_META = {
  book: { label: "Books", icon: "book" },
  podcast: { label: "Podcasts", icon: "podcast" },
  video: { label: "Videos", icon: "video" },
  pdf: { label: "PDFs", icon: "clipboard" },
  workbook: { label: "Workbooks", icon: "clipboard" },
  article: { label: "Articles", icon: "link" },
  template: { label: "Templates", icon: "clipboard" },
  other: { label: "Other Resources", icon: "folder" },
};
const RESOURCE_ORDER = ["book", "podcast", "video", "pdf", "workbook", "article", "template", "other"];

function countLevel(level) {
  let total = 0;
  let done = 0;
  for (const m of level.modules ?? []) {
    for (const l of m.lessons ?? []) {
      total++;
      if (l.done) done++;
    }
    for (const a of m.activities ?? []) {
      total++;
      if (a.done) done++;
    }
    if (m.assessment) {
      total++;
      if (m.assessment.passed) done++;
    }
  }
  return { total, done };
}

function countPath(levels) {
  let total = 0;
  let done = 0;
  for (const level of levels ?? []) {
    const c = countLevel(level);
    total += c.total;
    done += c.done;
  }
  return { total, done, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

function ItemRow({ icon, title, done, meta, to }) {
  return (
    <li className="today-task-row mt-item-row">
      <span className={`today-task-check${done ? " done" : ""}`} aria-hidden="true">
        {done && <Icon name="check" size={13} />}
      </span>
      <Link to={to} className="today-task-body" style={{ minWidth: 0 }}>
        <div className="today-task-title">
          <Icon name={icon} size={14} style={{ color: "var(--slate)", flexShrink: 0 }} />
          {title}
        </div>
      </Link>
      <div className="today-task-meta">{meta}</div>
    </li>
  );
}

function ModuleBlock({ pathId, levelId, module: m }) {
  return (
    <div className="mt-module">
      <div className="mt-module-title">{m.title}</div>
      {m.description && <p style={{ fontSize: "13px", color: "var(--slate)", marginBottom: "8px" }}>{m.description}</p>}
      <ul className="today-task-list">
        {m.lessons.map((l) => (
          <ItemRow
            key={l.id}
            icon="book"
            title={l.title}
            done={l.done}
            meta={
              <>
                {l.hasPdf && (
                  <span className="badge badge-neutral" title="Includes a downloadable PDF">
                    <Icon name="clipboard" size={11} />
                  </span>
                )}
                <span className="badge badge-neutral">{l.estimatedMinutes} min</span>
              </>
            }
            to={`/learning/mind-training/${pathId}/${levelId}/${m.id}/lesson/${l.id}`}
          />
        ))}
        {m.activities.map((a) => (
          <ItemRow
            key={a.id}
            icon="target"
            title={a.title}
            done={a.done}
            meta={<span className="badge badge-neutral">Activity</span>}
            to={`/learning/mind-training/${pathId}/${levelId}/${m.id}/activity/${a.id}`}
          />
        ))}
        {m.assessment && (
          <ItemRow
            icon="award"
            title={m.assessment.title}
            done={m.assessment.passed}
            meta={<span className="badge badge-neutral">Assessment</span>}
            to={`/learning/mind-training/${pathId}/${levelId}/${m.id}/assessment`}
          />
        )}
      </ul>
    </div>
  );
}

export default function MindTrainingPathDetail() {
  const { pathId } = useParams();

  const { loading, error, data } = useSupabaseQuery(
    () => supabase.rpc("get_my_mind_training_path", { p_path_id: pathId }),
    [pathId],
  );

  if (loading) {
    return (
      <div>
        <Skeleton variant="text" width="240px" height="28px" />
        <div style={{ marginTop: "20px" }}>
          <Skeleton variant="card" height="160px" />
        </div>
      </div>
    );
  }
  if (error) {
    return <ErrorState description="Couldn't load this path — it may not be available to you." />;
  }
  if (!data) return null;

  const { total, done, percent } = countPath(data.levels);
  const resourceGroups = RESOURCE_ORDER.filter((key) => (data.recommendedResources?.[key] ?? []).length > 0).map((key) => ({
    key,
    ...RESOURCE_TYPE_META[key],
    items: data.recommendedResources[key],
  }));

  return (
    <div>
      <Link to="/learning/mind-training" style={{ color: "var(--slate)", fontSize: "13.5px" }}>
        ← Back to Mind Training
      </Link>

      <div className="hero-banner rise-in" style={{ marginTop: "12px" }}>
        <div className="mt-hero">
          <div className="mt-hero-ring">
            <ProgressRing percent={percent} size={80} strokeWidth={7} fillColor="#fff" trackColor="rgba(255,255,255,0.25)" />
          </div>
          <div className="mt-hero-copy">
            <h1>{data.title}</h1>
            <p>{data.description || (total > 0 ? `${done} of ${total} complete` : "A Mind Training learning path")}</p>
          </div>
        </div>
      </div>

      {total === 0 && (
        <EmptyState icon={<Icon name="brain" size={26} />} title="Nothing published in this path yet" description="Check back soon." />
      )}

      {data.levels.map((level) => {
        const c = countLevel(level);
        const levelPercent = c.total === 0 ? 0 : Math.round((c.done / c.total) * 100);
        return (
          <div key={level.id} className="card-elevated mt-level">
            <div className="mt-level-header">
              <div className="mt-level-title">{level.title}</div>
              <div className="mt-level-percent">{c.total > 0 ? `${levelPercent}%` : "—"}</div>
            </div>
            {level.description && <p className="mt-level-desc">{level.description}</p>}
            {level.modules.length === 0 && (
              <p style={{ color: "var(--slate)", fontSize: "13.5px" }}>No modules published yet.</p>
            )}
            {level.modules.map((m) => (
              <ModuleBlock key={m.id} pathId={pathId} levelId={level.id} module={m} />
            ))}
          </div>
        );
      })}

      {resourceGroups.length > 0 && (
        <div className="mt-resources">
          <h2 style={{ marginBottom: "4px" }}>📚 Recommended Personal Development</h2>
          <p style={{ color: "var(--slate)", marginBottom: "18px" }}>Curated by your admin to go with this path.</p>
          {resourceGroups.map((g) => (
            <div key={g.key} className="mt-resources-group">
              <div className="mt-resources-group-title">
                <Icon name={g.icon} size={15} />
                {g.label}
              </div>
              <div className="mt-resources-grid">
                {g.items.map((r) => (
                  <Link key={r.id} to={`/learning/personal-development/${r.id}`} className="card pd-resource-card">
                    <div className="pd-resource-thumb">
                      {r.thumbnailUrl ? <img src={r.thumbnailUrl} alt="" /> : <Icon name={g.icon} size={26} />}
                    </div>
                    <div className="card-title" style={{ fontSize: "14px", marginBottom: 0 }}>
                      {r.title}
                    </div>
                    {r.author && <div className="pd-resource-meta">{r.author}</div>}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
