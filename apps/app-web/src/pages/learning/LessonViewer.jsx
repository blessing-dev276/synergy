import { Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { markLessonComplete } from "../../lib/rpc.js";
import { useToast } from "../../components/state/Toast.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import Icon from "../../components/Icon.jsx";

// A plain <video src="…"> only plays a direct media file -- it can't play a
// YouTube/Vimeo *page* URL, which is what admins paste into a lesson's video
// field almost every time. YouTube gets the full IFrame Player API (below)
// rather than a bare embed iframe, because that's the only way to know when
// playback actually finished -- needed both for chapter-clipped lessons
// (start_seconds/end_seconds, 0061: several lessons sharing one long video,
// each one chapter of it) and for gating "Mark Complete" on having watched
// the thing. Vimeo and any other direct file URL keep working as before,
// just without that watch-gate (no equivalent signal without pulling in a
// second player SDK for a case nobody asked for).
function parseVideo(url) {
  if (!url) return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtu.be" || host === "youtube.com") {
    const id =
      host === "youtu.be"
        ? u.pathname.slice(1)
        : u.pathname === "/watch"
          ? u.searchParams.get("v")
          : u.pathname.startsWith("/shorts/")
            ? u.pathname.split("/")[2]
            : null;
    return id ? { type: "youtube", id } : null;
  }
  if (host === "vimeo.com") {
    const id = u.pathname.split("/").filter(Boolean)[0];
    return id && /^\d+$/.test(id) ? { type: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}` } : null;
  }
  if (host === "player.vimeo.com" || u.pathname.startsWith("/embed/")) {
    return { type: "vimeo", embedUrl: url };
  }
  return null;
}

// Loads https://www.youtube.com/iframe_api once per page (a second lesson
// visited later in the same session reuses the already-loaded window.YT).
let ytApiPromise = null;
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve) => {
      const prevReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prevReady?.();
        resolve(window.YT);
      };
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    });
  }
  return ytApiPromise;
}

// Native controls (play/pause/volume/fullscreen/captions) stay -- only
// dragging the scrub bar ahead is blocked, by polling getCurrentTime() and
// snapping back the instant it jumps further than real playback could have
// carried it since the last poll. maxTimeRef is a high-water mark, not "last
// seen time" -- rewinding to rewatch is always fine, and doesn't lower the
// point you're allowed to be at.
const SKIP_POLL_MS = 1000;
const SKIP_TOLERANCE_S = 1.5;

// key={lessonId} on the caller forces a full remount per chapter, so this
// never has to reconcile a videoId/start/end change mid-life -- new chapter,
// new player, same div.
function YouTubeChapterPlayer({ videoId, startSeconds, endSeconds, title, onWatched }) {
  const containerRef = useRef(null);
  const maxTimeRef = useRef(startSeconds || 0);

  useEffect(() => {
    let cancelled = false;
    let player = null;
    let pollId = null;

    const stopPoll = () => {
      if (pollId) {
        clearInterval(pollId);
        pollId = null;
      }
    };
    const startPoll = () => {
      stopPoll();
      pollId = setInterval(() => {
        if (!player?.getCurrentTime) return;
        const current = player.getCurrentTime();
        if (current > maxTimeRef.current + SKIP_TOLERANCE_S) {
          player.seekTo(maxTimeRef.current, true);
        } else {
          maxTimeRef.current = Math.max(maxTimeRef.current, current);
        }
      }, SKIP_POLL_MS);
    };

    loadYouTubeApi().then((YT) => {
      if (cancelled || !containerRef.current) return;
      player = new YT.Player(containerRef.current, {
        videoId,
        playerVars: {
          start: startSeconds || 0,
          ...(endSeconds ? { end: endSeconds } : {}),
          rel: 0, // no related-video suggestions on end
          modestbranding: 1, // drop the large YouTube logo from the control bar
          iv_load_policy: 3, // no annotation overlays
          fs: 1,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.PLAYING) startPoll();
            else stopPoll();
            if (e.data === YT.PlayerState.ENDED) onWatched();
          },
          // A 2x playback rate covers ~2s of video per 1s poll tick, which
          // reads as a "skip" against the 1.5s tolerance above and fights
          // the snapback -- looks like the player freezing, not a clean
          // block. Pin the rate instead of just widening the tolerance, so
          // skip detection stays tight either way.
          onPlaybackRateChange: (e) => {
            if (e.data !== 1) player?.setPlaybackRate(1);
          },
        },
      });
    });
    return () => {
      cancelled = true;
      stopPoll();
      player?.destroy?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, startSeconds, endSeconds]);

  return (
    <div style={{ position: "relative", paddingTop: "56.25%", borderRadius: "10px", overflow: "hidden" }}>
      <div ref={containerRef} title={title} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
    </div>
  );
}

// Same anti-skip rule as YouTubeChapterPlayer, via the native timeupdate
// event instead of polling (fires on its own, several times a second).
function NativeVideoPlayer({ src, onWatched }) {
  const maxTimeRef = useRef(0);

  const onTimeUpdate = (e) => {
    const el = e.currentTarget;
    if (el.currentTime > maxTimeRef.current + SKIP_TOLERANCE_S) {
      el.currentTime = maxTimeRef.current;
    } else {
      maxTimeRef.current = Math.max(maxTimeRef.current, el.currentTime);
    }
  };
  const onRateChange = (e) => {
    if (e.currentTarget.playbackRate !== 1) e.currentTarget.playbackRate = 1;
  };

  return (
    <video
      controls
      controlsList="nodownload"
      style={{ width: "100%", borderRadius: "10px" }}
      src={src}
      onTimeUpdate={onTimeUpdate}
      onRateChange={onRateChange}
      onEnded={onWatched}
    />
  );
}

export default function LessonViewer() {
  const { pathId, courseId, moduleId, lessonId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [completing, setCompleting] = useState(false);
  const [watched, setWatched] = useState(false);

  const { loading, data: lesson } = useSupabaseQuery(
    () => supabase.from("lessons").select("*").eq("id", lessonId).single(),
    [lessonId],
  );

  const { data: progress, loading: loadingProgress, refetch: refetchProgress } = useSupabaseQuery(
    () => user && supabase.from("lesson_progress").select("*").eq("uid", user.id).eq("lesson_id", lessonId).maybeSingle(),
    [user?.id, lessonId],
  );

  // sequential (0062) is opt-in per module -- most modules leave it off and
  // this whole block is a no-op (module?.sequential is falsy, locked stays
  // false below).
  const { data: courseModule } = useSupabaseQuery(
    () => supabase.from("modules").select("id, sequential").eq("id", moduleId).single(),
    [moduleId],
  );

  // "Next Chapter" only ever points at the next lesson in this same module
  // (chapters of one video all live in one module) -- not a general
  // "keep going through the whole course" control. Also doubles as the
  // ordered lesson list a sequential module locks against.
  const { data: siblingLessons } = useSupabaseQuery(
    () => supabase.from("lessons").select("id, title, order_index").eq("module_id", moduleId).order("order_index", { ascending: true }),
    [moduleId],
  );
  const siblingIndex = siblingLessons?.findIndex((l) => l.id === lessonId) ?? -1;
  const nextLessonId = siblingIndex >= 0 && siblingIndex < (siblingLessons?.length ?? 0) - 1 ? siblingLessons[siblingIndex + 1].id : null;
  const prevLesson = siblingIndex > 0 ? siblingLessons[siblingIndex - 1] : null;

  const { data: siblingProgress } = useSupabaseQuery(
    () => user && siblingLessons?.length > 0 && supabase.from("lesson_progress").select("lesson_id, status").eq("uid", user.id).in("lesson_id", siblingLessons.map((l) => l.id)),
    [user?.id, siblingLessons],
  );
  // Default to unlocked while still loading -- a brief false "locked" flash
  // is worse than a brief false "unlocked" one (the latter just means a
  // click-through renders normally for a beat before any gate applies).
  const prevCompleted = !prevLesson || siblingProgress === null || siblingProgress.some((p) => p.lesson_id === prevLesson.id && p.status === "completed");
  const locked = !!courseModule?.sequential && !prevCompleted;

  // Mark "in_progress" the first time this lesson is opened — a low-stakes
  // owner-only write, unlike completion which always goes through the
  // mark_lesson_complete RPC so completion rules are enforced server-side.
  // Must wait for the progress fetch to actually finish (loadingProgress)
  // rather than just checking `!progress` -- `progress` is null both before
  // the fetch resolves AND when it resolves to "no row yet", and upserting
  // on the former was clobbering an already-`completed` row back down to
  // `in_progress` on revisit (the fetch hadn't landed yet when this fired).
  useEffect(() => {
    if (!user || !lesson || loadingProgress || progress || locked) return;
    supabase
      .from("lesson_progress")
      .upsert(
        {
          uid: user.id,
          lesson_id: lessonId,
          module_id: moduleId,
          course_id: courseId,
          path_id: pathId,
          status: "in_progress",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "uid,lesson_id" },
      )
      .then(() => refetchProgress());
  }, [user, lesson, loadingProgress, progress, locked, lessonId, moduleId, courseId, pathId, refetchProgress]);

  // A fresh chapter starts unwatched even if the same component instance
  // stays mounted across a "Next Chapter" navigation (same route, new params).
  useEffect(() => {
    setWatched(false);
  }, [lessonId]);

  const isComplete = progress?.status === "completed";
  const requiresQuiz = lesson?.completion_rule === "quiz_pass";
  const video = lesson?.content_type === "video" ? parseVideo(lesson.content_body) : null;
  const needsWatch = lesson?.content_type === "video" && !!lesson.content_body && video?.type !== "vimeo";
  const canMarkComplete = !needsWatch || watched;

  const completeLesson = async () => {
    await markLessonComplete(courseId, moduleId, lessonId);
    toast.success("Lesson complete!");
    refetchProgress();
  };

  const handleMarkComplete = async () => {
    setCompleting(true);
    try {
      await completeLesson();
    } catch (err) {
      toast.error(err.message ?? "Couldn't mark this lesson complete.");
    } finally {
      setCompleting(false);
    }
  };

  // The auto-advance path: a finished chapter completes itself and moves on
  // -- no click. Only fires for the video types that can actually detect
  // "finished" (needsWatch); everything else still needs the manual button
  // (and, from there, the manual "Next Chapter" link) since there's nothing
  // to auto-detect.
  const handleWatched = async () => {
    setWatched(true);
    if (!isComplete) {
      try {
        await completeLesson();
      } catch (err) {
        toast.error(err.message ?? "Couldn't mark this lesson complete.");
        return;
      }
    }
    if (nextLessonId) navigate(`/learning/${pathId}/${courseId}/${moduleId}/${nextLessonId}`);
  };

  if (loading) return <Skeleton variant="card" height="200px" />;
  if (!lesson) return null;

  if (locked) {
    return (
      <div>
        <Link to={`/learning/${pathId}/${courseId}`} style={{ color: "var(--slate)", fontSize: "13.5px" }}>
          ← Back to course
        </Link>
        <h1 style={{ marginTop: "10px" }}>{lesson.title}</h1>
        <EmptyState
          icon={<Icon name="lock" size={26} />}
          title="Complete the previous chapter first"
          description={prevLesson ? `Finish "${prevLesson.title}" to unlock this one.` : undefined}
        />
      </div>
    );
  }

  return (
    <div>
      <Link to={`/learning/${pathId}/${courseId}`} style={{ color: "var(--slate)", fontSize: "13.5px" }}>
        ← Back to course
      </Link>
      <h1 style={{ marginTop: "10px" }}>{lesson.title}</h1>

      <div className="card" style={{ marginTop: "20px", marginBottom: "20px" }}>
        {lesson.content_type === "video" && lesson.content_body && video?.type === "youtube" && (
          <YouTubeChapterPlayer
            key={lessonId}
            videoId={video.id}
            startSeconds={lesson.start_seconds}
            endSeconds={lesson.end_seconds}
            title={lesson.title}
            onWatched={handleWatched}
          />
        )}
        {lesson.content_type === "video" && lesson.content_body && video?.type === "vimeo" && (
          <div style={{ position: "relative", paddingTop: "56.25%", borderRadius: "10px", overflow: "hidden" }}>
            <iframe
              src={video.embedUrl}
              title={lesson.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
            />
          </div>
        )}
        {lesson.content_type === "video" && lesson.content_body && !video && (
          <NativeVideoPlayer key={lessonId} src={lesson.content_body} onWatched={handleWatched} />
        )}
        {lesson.content_type === "text" && <div style={{ whiteSpace: "pre-wrap" }}>{lesson.content_body}</div>}
        {lesson.content_type === "pdf" && (
          <a href={lesson.content_body} target="_blank" rel="noreferrer" className="btn btn-secondary">
            Open PDF resource
          </a>
        )}
        {lesson.content_type === "link" && (
          <a href={lesson.content_body} target="_blank" rel="noreferrer" className="btn btn-secondary">
            Open resource
          </a>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        {isComplete && <span className="badge badge-success">Completed</span>}

        {!isComplete && !requiresQuiz && canMarkComplete && (
          <button type="button" className="btn btn-primary" onClick={handleMarkComplete} disabled={completing}>
            {completing ? "Saving…" : "Mark Complete"}
          </button>
        )}

        {!isComplete && !requiresQuiz && !canMarkComplete && (
          <p style={{ color: "var(--slate)", fontSize: "13.5px" }}>Finish watching — this chapter will complete and move on automatically.</p>
        )}

        {!isComplete && requiresQuiz && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate(`/learning/${pathId}/${courseId}/${moduleId}/${lessonId}/quiz`)}
          >
            Take the quiz to complete this lesson
          </button>
        )}

        {/* Always present, not just after completing -- clicking through to a
            still-locked next chapter just lands on the lock screen, which
            explains itself, so there's no harm always offering the link. */}
        {nextLessonId && (
          <Link to={`/learning/${pathId}/${courseId}/${moduleId}/${nextLessonId}`} className="btn btn-secondary">
            Next Chapter →
          </Link>
        )}
      </div>
    </div>
  );
}
