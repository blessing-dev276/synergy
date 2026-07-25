import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import PageMeta from "../components/PageMeta.jsx";
import { STORIES } from "../data/stories.js";
import { compressImage } from "../lib/compressImage.js";
import { useNetlifyIdentity, getIdentityToken } from "../lib/useNetlifyIdentity.js";

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export default function StoriesAdmin() {
  const { user, ready } = useNetlifyIdentity();

  return (
    <>
      <PageMeta title="Stories Admin" description="Manage Synergy Team success stories." />
      <section className="page-hero">
        <div className="wrap">
          <div className="breadcrumb">
            <Link to="/">Home</Link> <span>/</span> <span>Stories Admin</span>
          </div>
          <div className="eyebrow">Team only</div>
          <h1>Stories Admin</h1>
          <p className="lede">Add a member's story with their picture and result, or remove an old one.</p>
        </div>
      </section>

      <section>
        <div className="wrap">
          {!ready ? (
            <p className="mono">Loading…</p>
          ) : !user ? (
            <div className="admin-gate">
              <p>Log in with your invited team account to manage stories.</p>
              <button className="btn btn-primary" onClick={() => window.netlifyIdentity.open("login")}>
                Log in
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
  const [stories, setStories] = useState(STORIES);
  const [deletingSlug, setDeletingSlug] = useState(null);
  const [error, setError] = useState("");

  async function handleDelete(slug) {
    if (!window.confirm("Delete this story? This can't be undone.")) return;
    setDeletingSlug(slug);
    setError("");
    try {
      const token = await getIdentityToken();
      const res = await fetch("/.netlify/functions/stories-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setStories((prev) => prev.filter((s) => s.slug !== slug));
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
        <button className="admin-logout" onClick={() => window.netlifyIdentity.logout()}>
          Log out
        </button>
      </div>

      {error && <div className="admin-error">{error}</div>}

      <NewStoryForm onPublished={(story) => setStories((prev) => [story, ...prev])} />

      <h2 className="admin-section-title">Existing stories</h2>
      {stories.length === 0 ? (
        <p className="mono">No stories yet.</p>
      ) : (
        <div className="admin-event-list">
          {stories.map((s) => (
            <div className="admin-event-card" key={s.slug}>
              {s.picture ? <img src={s.picture} alt="" /> : <span className="admin-avatar-placeholder" />}
              <div className="admin-event-card-body">
                <h4>{s.name}</h4>
                <span className="mono">{s.status || "No status set"}</span>
              </div>
              <button
                className="admin-delete-btn"
                disabled={deletingSlug === s.slug}
                onClick={() => handleDelete(s.slug)}
              >
                {deletingSlug === s.slug ? "Deleting…" : "Delete"}
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="admin-note">
        Changes here trigger a new deploy — give it a minute or two, then refresh the live{" "}
        <Link to="/stories">stories page</Link> to see it.
      </p>
    </div>
  );
}

function ImagePicker({ label, hint, photo, onChange, onRemove, disabled }) {
  const inputRef = useRef(null);

  return (
    <div className="admin-field">
      <span>{label}</span>
      {photo ? (
        <div className="admin-photo-thumb single">
          <img src={photo.previewUrl} alt={label} />
          <button type="button" onClick={onRemove} aria-label={`Remove ${label}`}>
            ×
          </button>
        </div>
      ) : (
        <div className="admin-dropzone compact">
          <input
            type="file"
            accept="image/*"
            ref={inputRef}
            onChange={(e) => e.target.files[0] && onChange(e.target.files[0])}
            hidden
            disabled={disabled}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => inputRef.current.click()}
            disabled={disabled}
          >
            Choose image
          </button>
          {hint && <p>{hint}</p>}
        </div>
      )}
    </div>
  );
}

function NewStoryForm({ onPublished }) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [story, setStory] = useState("");
  const [picture, setPicture] = useState(null); // { base64, previewUrl }
  const [result, setResult] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  async function handleImageSelect(file, setter) {
    try {
      const { base64, previewUrl } = await compressImage(file);
      setter({ base64, previewUrl });
    } catch {
      setError("Couldn't read that image — try a different file.");
    }
  }

  async function handlePublish(e) {
    e.preventDefault();
    if (!name.trim() || !story.trim()) {
      setError("Add at least a name and a story.");
      return;
    }
    setPublishing(true);
    setError("");

    const slug = `${Date.now()}-${slugify(name)}`;

    try {
      const token = await getIdentityToken();
      const res = await fetch("/.netlify/functions/stories-publish", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          slug,
          name: name.trim(),
          status: status.trim(),
          story: story.trim(),
          picture: picture?.base64 || null,
          result: result?.base64 || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Publish failed");

      onPublished({
        slug,
        name: name.trim(),
        status: status.trim(),
        story: story.trim(),
        picture: data.picture,
        result: data.result,
      });
      setName("");
      setStatus("");
      setStory("");
      setPicture(null);
      setResult(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <form className="admin-form" onSubmit={handlePublish}>
      <h2 className="admin-section-title">New story</h2>

      <label className="admin-field">
        <span>Team member name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Doe"
          disabled={publishing}
        />
      </label>

      <label className="admin-field">
        <span>Status</span>
        <input
          type="text"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          placeholder="Freelance track — landed first client"
          disabled={publishing}
        />
      </label>

      <label className="admin-field">
        <span>Story</span>
        <textarea
          value={story}
          onChange={(e) => setStory(e.target.value)}
          rows={4}
          placeholder="What happened, in their words…"
          disabled={publishing}
        />
      </label>

      <ImagePicker
        label="Profile picture (optional)"
        photo={picture}
        onChange={(file) => handleImageSelect(file, setPicture)}
        onRemove={() => setPicture(null)}
        disabled={publishing}
      />
      <ImagePicker
        label="Result image (optional)"
        hint="A screenshot of earnings, a payment, a rank certificate — whatever backs up the story."
        photo={result}
        onChange={(file) => handleImageSelect(file, setResult)}
        onRemove={() => setResult(null)}
        disabled={publishing}
      />

      {error && <div className="admin-error">{error}</div>}

      <button className="btn btn-primary" type="submit" disabled={publishing}>
        {publishing ? "Publishing…" : "Publish story"}
      </button>
    </form>
  );
}
