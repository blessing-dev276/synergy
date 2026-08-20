import { Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { markLessonComplete } from "../../lib/rpc.js";
import { parseVideo } from "../../lib/video.js";
import { useToast } from "../../components/state/Toast.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import Icon from "../../components/Icon.jsx";

// YouTube and Vimeo each get their real player SDK (below) rather than a
// bare embed iframe, because that's the only way to know when playback
// actually finished, enforce the chapter clip (start_seconds/end_seconds,
// 0061: several lessons sharing one long video, each one chapter of it),
// and block scrubbing ahead of what's actually been watched -- gating "Mark
// Complete" on having watched the thing only means something if the player
// itself can't be skipped past that point either.

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

// Loads https://player.vimeo.com/api/player.js once per page, same pattern
// as loadYouTubeApi.
let vimeoApiPromise = null;
function loadVimeoApi() {
  if (window.Vimeo?.Player) return Promise.resolve(window.Vimeo);
  if (!vimeoApiPromise) {
    vimeoApiPromise = new Promise((resolve) => {
      const tag = document.createElement("script");
      tag.src = "https://player.vimeo.com/api/player.js";
      tag.onload = () => resolve(window.Vimeo);
      document.head.appendChild(tag);
    });
  }
  return vimeoApiPromise;
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

// Same chapter-clipping + anti-skip treatment as YouTubeChapterPlayer, via
// the Vimeo Player SDK attached to the rendered iframe (works whether
// parseVideo resolved a bare embed URL or one with a numeric id in it --
// the SDK just needs an iframe already pointed at player.vimeo.com). Vimeo's
// timeupdate fires natively and often, so this needs no manual polling
// timer the way the YouTube postMessage-only API does.
function VimeoChapterPlayer({ embedUrl, startSeconds, endSeconds, title, onWatched }) {
  const iframeRef = useRef(null);
  const maxTimeRef = useRef(startSeconds || 0);
  const watchedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let player = null;
    watchedRef.current = false;

    loadVimeoApi().then((Vimeo) => {
      if (cancelled || !iframeRef.current) return;
      player = new Vimeo.Player(iframeRef.current);

      player.ready().then(() => {
        if (cancelled) return;
        if (startSeconds) player.setCurrentTime(startSeconds).catch(() => {});
        player.setPlaybackRate(1).catch(() => {});
      });

      player.on("timeupdate", ({ seconds }) => {
        if (watchedRef.current) return;
        if (endSeconds && seconds >= endSeconds) {
          watchedRef.current = true;
          player.pause().catch(() => {});
          player.setCurrentTime(endSeconds).catch(() => {});
          onWatched();
          return;
        }
        if (seconds > maxTimeRef.current + SKIP_TOLERANCE_S) {
          player.setCurrentTime(maxTimeRef.current).catch(() => {});
        } else {
          maxTimeRef.current = Math.max(maxTimeRef.current, seconds);
        }
      });
      player.on("ended", () => {
        if (!watchedRef.current) {
          watchedRef.current = true;
          onWatched();
        }
      });
      // Same rationale as YouTube's onPlaybackRateChange guard above.
      player.on("playbackratechange", ({ playbackRate }) => {
        if (playbackRate !== 1) player.setPlaybackRate(1).catch(() => {});
      });
    });

    return () => {
      cancelled = true;
      player?.destroy?.().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedUrl, startSeconds, endSeconds]);

  // #t=Xs gives a correct-looking paused first frame at the chapter's start
  // immediately, rather than showing frame 0 until the SDK's ready() handler
  // corrects it a beat later.
  const src = startSeconds ? `${embedUrl}#t=${startSeconds}s` : embedUrl;

  return (
    <div style={{ position: "relative", paddingTop: "56.25%", borderRadius: "10px", overflow: "hidden" }}>
      <iframe
        ref={iframeRef}
        src={src}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
      />
    </div>
  );
}

// A self-hosted lesson (CourseEditor.jsx's "Upload video file") stores a
// path in the private course-content bucket (0004), not a URL -- content_body
// never starts with a scheme in that case, mirroring CourseEditor's
// isStoragePath. The bucket is private on purpose (no public, guessable, or
// permanently-cached URL for course video), so playback needs a short-lived
// signed URL fetched fresh each time the lesson opens, same pattern as
// Profile.jsx's photo_url.
function isStoragePath(v) {
  return !!v && !/^https?:\/\//i.test(v);
}

// Same anti-skip rule as YouTubeChapterPlayer, via the native timeupdate
// event instead of polling (fires on its own, several times a second).
function NativeVideoPlayer({ src, onWatched }) {
  const maxTimeRef = useRef(0);
  const isUpload = isStoragePath(src);
  const [resolvedSrc, setResolvedSrc] = useState(isUpload ? null : src);

  useEffect(() => {
    if (!isUpload) {
      setResolvedSrc(src);
      return;
    }
    let cancelled = false;
    setResolvedSrc(null);
    supabase.storage
      .from("course-content")
      .createSignedUrl(src, 3600)
      .then(({ data }) => {
        if (!cancelled) setResolvedSrc(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [src, isUpload]);

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

  if (!resolvedSrc) return <Skeleton variant="card" height="240px" />;

  return (
    <video
      controls
      controlsList="nodownload"
      style={{ width: "100%", borderRadius: "10px" }}
      src={resolvedSrc}
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

  // Scoped to this module on purpose (chapters of one video all live in one
  // module) -- this is only for the sequential lock, which is a per-module
  // setting with no cross-module meaning. Nothing here decides "next" for
  // the button/auto-advance below; see courseModules/courseLessons for that.
  const { data: siblingLessons } = useSupabaseQuery(
    () => supabase.from("lessons").select("id, title, order_index").eq("module_id", moduleId).order("order_index", { ascending: true }),
    [moduleId],
  );
  const siblingIndex = siblingLessons?.findIndex((l) => l.id === lessonId) ?? -1;
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

  // The real "what's next" for the Next button + auto-advance: every
  // published lesson across the whole course, flattened in (module
  // order_index, lesson order_index) order -- two lessons in different
  // modules can share the same order_index, so this can't just be one
  // .order() call, it's grouped by module first. Every lesson genuinely
  // has a Next control now, not just ones with a sibling left in their own
  // module -- it just crosses into the next module once this one runs out.
  const { loading: loadingCourseModules, data: courseModules } = useSupabaseQuery(
    () => supabase.from("modules").select("id, order_index").eq("course_id", courseId).order("order_index", { ascending: true }),
    [courseId],
  );
  const { loading: loadingCourseLessons, data: courseLessons } = useSupabaseQuery(
    () =>
      courseModules?.length > 0 &&
      supabase.from("lessons").select("id, module_id, order_index, published").in("module_id", courseModules.map((m) => m.id)),
    [courseModules],
  );
  const flattenedLessons = (courseModules ?? []).flatMap((m) =>
    (courseLessons ?? [])
      .filter((l) => l.module_id === m.id && l.published)
      .sort((a, b) => a.order_index - b.order_index),
  );
  const flatIndex = flattenedLessons.findIndex((l) => l.id === lessonId);
  const nextItem = flatIndex >= 0 && flatIndex < flattenedLessons.length - 1 ? flattenedLessons[flatIndex + 1] : null;
  const navReady = !loadingCourseModules && !loadingCourseLessons;

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
  // Every video type now reports back when it's actually been watched
  // (YouTube and Vimeo via their player SDKs, direct/uploaded files via the
  // native <video> onEnded) -- so this no longer needs to carve out an
  // exception for any particular type.
  const needsWatch = lesson?.content_type === "video" && !!lesson.content_body;
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
  // "finished" (needsWatch, now every video type); everything else still
  // needs the manual button (and, from there, the manual Next link) since
  // there's nothing to auto-detect.
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
    if (nextItem) navigate(`/learning/${pathId}/${courseId}/${nextItem.module_id}/${nextItem.id}`);
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
          <VimeoChapterPlayer
            key={lessonId}
            embedUrl={video.embedUrl}
            startSeconds={lesson.start_seconds}
            endSeconds={lesson.end_seconds}
            title={lesson.title}
            onWatched={handleWatched}
          />
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
            still-locked next lesson just lands on the lock screen, which
            explains itself, so there's no harm always offering the link.
            nextItem spans module boundaries, so every lesson gets a working
            Next control, not just ones with a sibling left in their own
            module -- and once there's genuinely nothing left in the course,
            this falls back to a way back to the course instead of just
            disappearing. */}
        {navReady && nextItem && (
          <Link to={`/learning/${pathId}/${courseId}/${nextItem.module_id}/${nextItem.id}`} className="btn btn-secondary">
            {nextItem.module_id === moduleId ? "Next Chapter →" : "Next Lesson →"}
          </Link>
        )}
        {navReady && !nextItem && (
          <Link to={`/learning/${pathId}/${courseId}`} className="btn btn-secondary">
            Back to course
          </Link>
        )}
      </div>
    </div>
  );
}
