import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { useDebouncedValue } from "../../lib/useDebouncedValue.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";
import Icon from "../../components/Icon.jsx";

const TYPE_FILTERS = [
  { key: "all", label: "All" },
  { key: "pdf", label: "PDFs" },
  { key: "podcast", label: "Podcasts" },
  { key: "video", label: "Videos" },
  { key: "resource", label: "Resources" },
];
// "Resources" bundles everything that isn't a pdf/podcast/video into one
// filter tab, per Part 13's 5-tab spec (originally All/Books/Podcasts/
// Videos/Resources -- Books was later dropped in favor of PDF, 0071).
const BUNDLED_RESOURCE_TYPES = new Set(["workbook", "article", "template", "other"]);
const TYPE_ICON = { podcast: "podcast", video: "video", pdf: "clipboard", workbook: "clipboard", article: "link", template: "clipboard", other: "folder" };
const TYPE_LABEL = { podcast: "Podcast", video: "Video", pdf: "PDF", workbook: "Workbook", article: "Article", template: "Template", other: "Resource" };

export default function PersonalDevelopmentLibrary() {
  const [typeFilter, setTypeFilter] = useState("all");
  const [activeTag, setActiveTag] = useState(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);

  const { loading, error, data: resources } = useSupabaseQuery(
    () =>
      supabase
        .from("pd_resources")
        .select("*, pd_resource_tags(tag:pd_tags(id,name))")
        .eq("published", true)
        .order("featured", { ascending: false })
        .order("order_index", { ascending: true }),
    [],
  );

  const items = useMemo(
    () => (resources ?? []).map((r) => ({ ...r, tags: (r.pd_resource_tags ?? []).map((rt) => rt.tag).filter(Boolean) })),
    [resources],
  );

  const popularTags = useMemo(() => {
    const map = new Map();
    for (const item of items) for (const t of item.tags) map.set(t.id, t);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const q = debouncedSearch.trim().toLowerCase();
  const filtered = items.filter((r) => {
    if (typeFilter === "resource" && !BUNDLED_RESOURCE_TYPES.has(r.resource_type)) return false;
    if (typeFilter !== "all" && typeFilter !== "resource" && r.resource_type !== typeFilter) return false;
    if (activeTag && !r.tags.some((t) => t.id === activeTag)) return false;
    if (q && !r.title.toLowerCase().includes(q) && !(r.description ?? "").toLowerCase().includes(q) && !(r.author ?? "").toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });

  return (
    <div>
      <h1>Personal Development</h1>
      <p style={{ color: "var(--slate)", marginTop: "6px", marginBottom: "22px" }}>
        Explore PDFs, podcasts, videos and resources designed to help you grow beyond your training.
      </p>

      <div className="pd-toolbar">
        <div className="field" style={{ marginBottom: 0, maxWidth: "420px" }}>
          <input type="text" placeholder="Search personal development…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="pd-type-pills">
          {TYPE_FILTERS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`btn ${typeFilter === t.key ? "btn-primary" : "btn-secondary"}`}
              style={{ padding: "8px 16px", fontSize: "13px" }}
              onClick={() => setTypeFilter(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {popularTags.length > 0 && (
          <div>
            <div className="row-meta" style={{ marginBottom: "8px" }}>
              Popular Tags
            </div>
            <div className="pd-tag-pills">
              {popularTags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`pd-tag-pill${activeTag === t.id ? " active" : ""}`}
                  onClick={() => setActiveTag((prev) => (prev === t.id ? null : t.id))}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div className="pd-grid">
          <Skeleton variant="card" height="220px" />
          <Skeleton variant="card" height="220px" />
          <Skeleton variant="card" height="220px" />
        </div>
      )}
      {error && <ErrorState description="Couldn't load the library." />}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState icon="📚" title="No resources found" description="Try a different search or filter." />
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className="pd-grid">
          {filtered.map((r) => (
            <Link key={r.id} to={`/learning/personal-development/${r.id}`} className="card pd-resource-card">
              <div className="pd-resource-thumb">
                {r.thumbnail_url ? <img src={r.thumbnail_url} alt="" /> : <Icon name={TYPE_ICON[r.resource_type]} size={28} />}
              </div>
              <div className="card-title" style={{ fontSize: "14.5px", marginBottom: "2px" }}>
                {r.title}
              </div>
              <div className="pd-resource-meta">
                <Icon name={TYPE_ICON[r.resource_type]} size={12} />
                {[TYPE_LABEL[r.resource_type], r.author].filter(Boolean).join(" · ")}
              </div>
              {r.tags.length > 0 && (
                <div className="pd-resource-tags">
                  {r.tags.slice(0, 3).map((t) => (
                    <span key={t.id} className="pd-resource-tag">
                      {t.name}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
