import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";
import Icon from "../../components/Icon.jsx";

const TYPE_ICON = { book: "book", podcast: "podcast", video: "video", pdf: "clipboard", workbook: "clipboard", article: "link", template: "clipboard", other: "folder" };
const TYPE_LABEL = { book: "Book", podcast: "Podcast", video: "Video", pdf: "PDF", workbook: "Workbook", article: "Article", template: "Template", other: "Resource" };
const OPEN_LABEL = { book: "Read", podcast: "Listen", video: "Watch" };

function useSignedFileUrl(path) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setUrl(null);
      return;
    }
    supabase.storage
      .from("mind-training-library")
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (!cancelled) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return url;
}

export default function PersonalDevelopmentResourceDetail() {
  const { resourceId } = useParams();

  const { loading, error, data: resource } = useSupabaseQuery(
    () =>
      supabase
        .from("pd_resources")
        .select("*, pd_resource_tags(tag:pd_tags(id,name)), pd_resource_learning_paths(path:learning_paths(id,title))")
        .eq("id", resourceId)
        .single(),
    [resourceId],
  );

  const fileUrl = useSignedFileUrl(resource?.file_path);

  if (loading) return <Skeleton variant="card" height="240px" />;
  if (error || !resource) return <ErrorState description="Couldn't load this resource — it may not be available to you." />;

  const tags = (resource.pd_resource_tags ?? []).map((rt) => rt.tag).filter(Boolean);
  const paths = (resource.pd_resource_learning_paths ?? []).map((rl) => rl.path).filter(Boolean);
  const openLabel = OPEN_LABEL[resource.resource_type] ?? "Open Resource";

  return (
    <div style={{ maxWidth: "680px" }}>
      <Link to="/learning/personal-development" style={{ color: "var(--slate)", fontSize: "13.5px" }}>
        ← Back to Personal Development
      </Link>

      <div className="pd-detail-header" style={{ marginTop: "16px" }}>
        <div className="pd-detail-thumb">
          {resource.thumbnail_url ? (
            <img src={resource.thumbnail_url} alt="" />
          ) : (
            <div
              style={{
                aspectRatio: "3/4",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--slate)",
                background: "var(--bg)",
              }}
            >
              <Icon name={TYPE_ICON[resource.resource_type]} size={36} />
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: "220px" }}>
          <span className="badge badge-neutral" style={{ marginBottom: "8px" }}>
            <Icon name={TYPE_ICON[resource.resource_type]} size={11} />
            {TYPE_LABEL[resource.resource_type]}
          </span>
          <h1>{resource.title}</h1>
          {resource.author && <p style={{ fontWeight: 600, marginTop: "4px" }}>{resource.author}</p>}
          {(resource.duration_minutes || resource.page_count) && (
            <p style={{ color: "var(--slate)", fontSize: "13px", marginTop: "6px" }}>
              {resource.duration_minutes ? `${resource.duration_minutes} min` : ""}
              {resource.duration_minutes && resource.page_count ? " · " : ""}
              {resource.page_count ? `${resource.page_count} pages` : ""}
            </p>
          )}

          {tags.length > 0 && (
            <div className="pd-resource-tags" style={{ marginTop: "12px" }}>
              {tags.map((t) => (
                <span key={t.id} className="pd-resource-tag">
                  {t.name}
                </span>
              ))}
            </div>
          )}

          <div className="pd-detail-actions">
            {resource.external_url && (
              <a href={resource.external_url} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                {openLabel}
              </a>
            )}
            {fileUrl && (
              <a href={fileUrl} target="_blank" rel="noreferrer" className="btn btn-secondary">
                <Icon name="clipboard" size={14} style={{ marginRight: "4px" }} />
                Download
              </a>
            )}
          </div>
        </div>
      </div>

      {paths.length > 0 && (
        <div className="card-elevated" style={{ marginBottom: "20px" }}>
          <div className="card-title">Recommended For</div>
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px" }}>
            {paths.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/learning/mind-training/${p.id}`}
                  style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: 600 }}
                >
                  <Icon name="brain" size={14} style={{ color: "var(--blue-bright)" }} />
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {resource.description && (
        <div className="card-elevated">
          <div className="card-title">About</div>
          <p style={{ color: "var(--navy-soft)", marginTop: "8px", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{resource.description}</p>
        </div>
      )}
    </div>
  );
}
