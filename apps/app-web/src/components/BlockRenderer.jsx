import Icon from "./Icon.jsx";

// Read-only rendering of the content_blocks/instructions shape (see
// lib/contentBlocks.js). Unknown block types are skipped rather than
// thrown on, so an older lesson still renders fine if a future block type
// gets added to the editor later.
export default function BlockRenderer({ blocks }) {
  if (!blocks || blocks.length === 0) return null;

  return (
    <div className="lesson-blocks">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading":
            return (
              <h3 key={i} className="lesson-block-heading">
                {b.text}
              </h3>
            );
          case "paragraph":
            return (
              <p key={i} className="lesson-block-paragraph">
                {b.text}
              </p>
            );
          case "list": {
            const ListTag = b.style === "number" ? "ol" : "ul";
            return (
              <ListTag key={i} className="lesson-block-list">
                {(b.items ?? []).filter(Boolean).map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ListTag>
            );
          }
          case "quote":
            return (
              <blockquote key={i} className="lesson-block-quote">
                <p>{b.text}</p>
                {b.attribution && <cite>— {b.attribution}</cite>}
              </blockquote>
            );
          case "image":
            return (
              <figure key={i} className="lesson-block-image">
                <img src={b.url} alt={b.caption ?? ""} />
                {b.caption && <figcaption>{b.caption}</figcaption>}
              </figure>
            );
          case "example":
            return (
              <div key={i} className="lesson-block-example">
                <div className="lesson-block-example-label">
                  <Icon name="brain" size={13} />
                  Example
                </div>
                <p>{b.text}</p>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
