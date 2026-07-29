import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import PageMeta from "../components/PageMeta.jsx";
import { GALLERY_EVENTS } from "../data/gallery.js";
import { compressImage } from "../lib/compressImage.js";
import {
  useNetlifyIdentity,
  getIdentityToken as getToken,
  hasRole,
} from "../lib/useNetlifyIdentity.js";

const BATCH_SIZE = 4;

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export default function GalleryAdmin() {
  const { user, ready } = useNetlifyIdentity();

  return (
    <>
      <PageMeta
        title="Gallery Admin"
        description="Manage SynergyTeam gallery photos."
      />
      <section className="page-hero">
        <div className="wrap">
          <div className="breadcrumb">
            <Link to="/">Home</Link> <span>/</span> <span>Gallery Admin</span>
          </div>
          <div className="eyebrow">Team only</div>
          <h1>Gallery Admin</h1>
          <p className="lede">
            Add a new event with all its photos in one go, or remove an old one.
          </p>
        </div>
      </section>

      <section>
        <div className="wrap">
          {!ready ? (
            <p className="mono">Loading…</p>
          ) : !user ? (
            <div className="admin-gate">
              <p>
                Log in with your invited team account to manage the gallery.
              </p>
              <button
                className="btn btn-primary"
                onClick={() => window.netlifyIdentity.open("login")}
              >
                Log in
              </button>
            </div>
          ) : !hasRole(user, "admin") ? (
            <div className="admin-gate">
              <p>
                Logged in as {user.email}, but this account isn't set up as an
                admin. Ask the site owner to add the "admin" role to your
                account in Netlify Identity.
              </p>
              <button
                className="btn btn-secondary"
                onClick={() => window.netlifyIdentity.logout()}
              >
                Log out
              </button>
            </div>
          ) : (
            <AdminPanel user={user} />
          )}
        </div>
      </section>
    </>
  );
}

function AdminPanel({ user }) {
  const [events, setEvents] = useState(GALLERY_EVENTS);
  const [deletingSlug, setDeletingSlug] = useState(null);
  const [error, setError] = useState("");

  async function handleDelete(slug) {
    if (
      !window.confirm(
        "Delete this event and all its photos? This can't be undone.",
      )
    )
      return;
    setDeletingSlug(slug);
    setError("");
    try {
      const token = await getToken();
      const res = await fetch("/.netlify/functions/gallery-delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setEvents((prev) => prev.filter((e) => e.slug !== slug));
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingSlug(null);
    }
  }

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <span>Logged in as {user.email}</span>
        <button
          className="admin-logout"
          onClick={() => window.netlifyIdentity.logout()}
        >
          Log out
        </button>
      </div>

      {error && <div className="admin-error">{error}</div>}

      <NewEventForm
        onPublished={(event) => setEvents((prev) => [event, ...prev])}
      />

      <h2 className="admin-section-title">Existing events</h2>
      {events.length === 0 ? (
        <p className="mono">No events yet.</p>
      ) : (
        <div className="admin-event-list">
          {events.map((event) => (
            <div className="admin-event-card" key={event.slug}>
              {event.photos[0] && (
                <img src={event.photos[0]} alt="" loading="lazy" />
              )}
              <div className="admin-event-card-body">
                <h4>{event.title}</h4>
                <span className="mono">
                  {event.date} · {event.photos.length} photo
                  {event.photos.length === 1 ? "" : "s"}
                </span>
              </div>
              <button
                className="admin-delete-btn"
                disabled={deletingSlug === event.slug}
                onClick={() => handleDelete(event.slug)}
              >
                {deletingSlug === event.slug ? "Deleting…" : "Delete"}
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="admin-note">
        Changes here trigger a new deploy, give it a minute or two, then refresh
        the live <Link to="/gallery">gallery page</Link> to see it.
      </p>
    </div>
  );
}

function NewEventForm({ onPublished }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [photos, setPhotos] = useState([]); // { id, name, base64, previewUrl }
  const [compressing, setCompressing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total }
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  async function addFiles(fileList) {
    const imageFiles = Array.from(fileList).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (imageFiles.length === 0) return;
    setCompressing(true);
    setError("");
    try {
      const compressed = await Promise.all(
        imageFiles.map(async (file) => {
          const { base64, previewUrl } = await compressImage(file);
          return {
            id: `${Date.now()}-${Math.random()}`,
            name: file.name,
            base64,
            previewUrl,
          };
        }),
      );
      setPhotos((prev) => [...prev, ...compressed]);
    } catch {
      setError("Couldn't read one of those files, try a different photo.");
    } finally {
      setCompressing(false);
    }
  }

  function removePhoto(id) {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }

  async function handlePublish(e) {
    e.preventDefault();
    if (!title.trim() || !date || photos.length === 0) {
      setError("Add a title, date, and at least one photo.");
      return;
    }
    setPublishing(true);
    setError("");
    setProgress({ done: 0, total: photos.length });

    const slug = `${date}-${slugify(title)}`;
    const publicPaths = photos.map(
      (_, i) =>
        `/uploads/gallery/${slug}/photo-${String(i).padStart(3, "0")}.jpg`,
    );

    try {
      for (let i = 0; i < photos.length; i += BATCH_SIZE) {
        const batch = photos.slice(i, i + BATCH_SIZE);
        const isLastBatch = i + BATCH_SIZE >= photos.length;
        const token = await getToken();
        const res = await fetch("/.netlify/functions/gallery-publish", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            slug,
            title: title.trim(),
            date,
            startIndex: i,
            images: batch.map((p) => p.base64),
            finalize: isLastBatch,
            photos: isLastBatch ? publicPaths : undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        setProgress({
          done: Math.min(i + batch.length, photos.length),
          total: photos.length,
        });
      }

      onPublished({ slug, title: title.trim(), date, photos: publicPaths });
      setTitle("");
      setPhotos([]);
    } catch (err) {
      setError(
        `${err.message}, photos already uploaded are safe, just try publishing again.`,
      );
    } finally {
      setPublishing(false);
      setProgress(null);
    }
  }

  return (
    <form className="admin-form" onSubmit={handlePublish}>
      <h2 className="admin-section-title">New event</h2>

      <label className="admin-field">
        <span>Event title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="2026 Team Retreat"
          disabled={publishing}
        />
      </label>

      <label className="admin-field">
        <span>Date</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={publishing}
        />
      </label>

      <div
        className={`admin-dropzone ${dragOver ? "drag-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          ref={fileInputRef}
          onChange={(e) => addFiles(e.target.files)}
          hidden
        />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => fileInputRef.current.click()}
        >
          Choose photos
        </button>
        <p>or drag and drop, select as many as you like at once</p>
        {compressing && <p className="mono">Preparing photos…</p>}
      </div>

      {photos.length > 0 && (
        <div className="admin-photo-grid">
          {photos.map((p) => (
            <div className="admin-photo-thumb" key={p.id}>
              <img src={p.previewUrl} alt={p.name} />
              <button
                type="button"
                onClick={() => removePhoto(p.id)}
                aria-label={`Remove ${p.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <div className="admin-error">{error}</div>}

      <button
        className="btn btn-primary"
        type="submit"
        disabled={publishing || photos.length === 0}
      >
        {publishing
          ? `Publishing ${progress?.done ?? 0}/${progress?.total ?? photos.length}…`
          : `Publish (${photos.length} photo${photos.length === 1 ? "" : "s"})`}
      </button>
    </form>
  );
}
