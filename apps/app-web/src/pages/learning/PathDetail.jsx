import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { markCourseResourceViewed } from "../../lib/rpc.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";
import Icon from "../../components/Icon.jsx";
import BackLink from "../../components/BackLink.jsx";
import Modal from "../../components/Modal.jsx";
import VideoPlayer from "../../components/VideoPlayer.jsx";

// Mirrors ContentBuilder.jsx's RESOURCE_TYPES -- a course drills into the
// lesson flow below; every other type has no lessons at all, its
// resource_url *is* the content, so it opens directly instead.
const RESOURCE_TYPE_LABEL = { video: "Video", book: "Book", podcast: "Podcast", link: "Link", pdf: "PDF / Document" };
const RESOURCE_TYPE_ICON = { video: "video", book: "book", podcast: "podcast", link: "link", pdf: "clipboard" };

export default function PathDetail() {
  const { pathId } = useParams();
  const { user } = useAuth();
  const [playingVideo, setPlayingVideo] = useState(null);

  const { loading: loadingPath, data: path } = useSupabaseQuery(
    () => supabase.from("learning_paths").select("*").eq("id", pathId).single(),
    [pathId],
  );

  // get_learning_paths (Business Path v2) is the source of truth for which
  // paths this member can see (mirrors PathList's gate) -- fetched here too
  // so a path outside the member's rank can't be opened by going straight to
  // its URL even though PathList no longer links to it. No more partial/
  // locked state (see 0047's old `locked` field, dropped) -- a path is
  // either in this list or it isn't. Don't block while `paths` hasn't
  // loaded yet, same as the old `locked ?? false` default did.
  const { data: paths } = useSupabaseQuery(() => supabase.rpc("get_learning_paths"), []);
  const matchedPath = paths?.find((p) => p.id === pathId);
  const accessible = !paths || paths.some((p) => p.id === pathId);
  const completed = matchedPath?.completed ?? false;
  // Freelancing's sequential unlock chain (0095) -- a locked path stays
  // "accessible" (it's still in this member's rank-gated list) but its
  // content is blocked until the chain reaches it, same UI-guided-not-a-
  // hard-boundary posture as Mind Training's own path lock. Only ever
  // set for skill_set paths; every other section's skillLock is null.
  const skillLocked = matchedPath?.skillLock?.status === "locked";
  const skillBlockedBy = matchedPath?.skillLock?.blockedBy;

  const {
    loading: loadingCourses,
    error,
    data: courses,
  } = useSupabaseQuery(
    () =>
      accessible &&
      !skillLocked &&
      supabase
        .from("courses")
        .select("*")
        .eq("path_id", pathId)
        .eq("published", true)
        .order("order_index", { ascending: true }),
    [pathId, accessible, skillLocked],
  );

  // Standalone resources (video/book/podcast/link/pdf) have no lesson flow
  // to track progress through -- course_progress (0080) is the "opened
  // this" record instead, seeded here and updated optimistically below so
  // the badge appears immediately rather than waiting on a refetch.
  const { data: viewedRows } = useSupabaseQuery(
    () =>
      user &&
      courses?.length > 0 &&
      supabase.from("course_progress").select("course_id").eq("uid", user.id).in("course_id", courses.map((c) => c.id)),
    [user?.id, courses],
  );
  const [viewedIds, setViewedIds] = useState(new Set());
  useEffect(() => {
    setViewedIds(new Set((viewedRows ?? []).map((r) => r.course_id)));
  }, [viewedRows]);

  const markViewed = (course) => {
    if (viewedIds.has(course.id)) return;
    setViewedIds((prev) => new Set(prev).add(course.id));
    markCourseResourceViewed(course.id).catch(() => {
      setViewedIds((prev) => {
        const next = new Set(prev);
        next.delete(course.id);
        return next;
      });
    });
  };

  return (
    <div>
      <BackLink to="/learning">Back to Learning</BackLink>
      {loadingPath && <Skeleton variant="text" width="240px" height="28px" style={{ marginTop: "16px" }} />}
      {path && (
        <>
          <h1 style={{ marginTop: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
            {path.title}
            {completed && (
              <span className="badge badge-success">
                <Icon name="check" size={11} style={{ verticalAlign: "-1px", marginRight: "3px" }} />
                Completed
              </span>
            )}
          </h1>
          <p style={{ color: "var(--slate)", marginTop: "6px", marginBottom: "24px" }}>{path.description}</p>
        </>
      )}

      {!accessible && (
        <EmptyState icon="🔒" title="This path isn't available to you" description="It isn't attached to your rank — ask an admin if you think this is a mistake." />
      )}
      {accessible && skillLocked && (
        <EmptyState
          icon="🔒"
          title="Not unlocked yet"
          description={skillBlockedBy ? `Complete "${skillBlockedBy}" 100% to unlock this skill.` : "This skill isn't unlocked yet."}
        />
      )}
      {accessible && !skillLocked && loadingCourses && <Skeleton variant="card" height="100px" />}
      {accessible && !skillLocked && error && <ErrorState description="Couldn't load courses." />}
      {accessible && !skillLocked && !loadingCourses && !error && (!courses || courses.length === 0) && (
        <EmptyState icon="📘" title="Nothing published in this path yet" />
      )}
      {accessible && !skillLocked && courses && courses.length > 0 && (
        <div className="grid grid-2">
          {courses.map((course) => {
            const type = course.resource_type ?? "course";
            if (type === "course") {
              return (
                <Link key={course.id} to={`/learning/${pathId}/${course.id}`} className="card">
                  <div className="card-title">{course.title}</div>
                  <div className="card-subtitle">{course.description}</div>
                  <span className="badge badge-neutral">{course.lesson_count ?? 0} lessons</span>
                </Link>
              );
            }
            const viewed = viewedIds.has(course.id);
            if (type === "video") {
              return (
                <button
                  key={course.id}
                  type="button"
                  className="card"
                  style={{ textAlign: "left", width: "100%", cursor: "pointer" }}
                  onClick={() => {
                    setPlayingVideo(course);
                    markViewed(course);
                  }}
                >
                  <div className="card-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Icon name={RESOURCE_TYPE_ICON[type]} size={16} />
                    {course.title}
                  </div>
                  <div className="card-subtitle">{course.description}</div>
                  <span className="badge badge-neutral">{[RESOURCE_TYPE_LABEL[type], course.resource_author].filter(Boolean).join(" · ")}</span>
                  {viewed && (
                    <span className="badge badge-success" style={{ marginLeft: "6px" }}>
                      <Icon name="check" size={11} style={{ verticalAlign: "-1px", marginRight: "3px" }} />
                      Viewed
                    </span>
                  )}
                </button>
              );
            }
            return (
              <a key={course.id} href={course.resource_url} target="_blank" rel="noopener noreferrer" className="card" onClick={() => markViewed(course)}>
                <div className="card-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Icon name={RESOURCE_TYPE_ICON[type]} size={16} />
                  {course.title}
                </div>
                <div className="card-subtitle">{course.description}</div>
                <span className="badge badge-neutral">{[RESOURCE_TYPE_LABEL[type], course.resource_author].filter(Boolean).join(" · ")}</span>
                {viewed && (
                  <span className="badge badge-success" style={{ marginLeft: "6px" }}>
                    <Icon name="check" size={11} style={{ verticalAlign: "-1px", marginRight: "3px" }} />
                    Viewed
                  </span>
                )}
              </a>
            );
          })}
        </div>
      )}

      <Modal open={!!playingVideo} onClose={() => setPlayingVideo(null)} title={playingVideo?.title} size="lg">
        {playingVideo && <VideoPlayer url={playingVideo.resource_url} title={playingVideo.title} />}
      </Modal>
    </div>
  );
}
