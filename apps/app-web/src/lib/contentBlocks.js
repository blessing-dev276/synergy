// Shared shape for Mind Training lesson/activity rich content -- an ordered
// array of typed blocks (mind_training_lessons.content_blocks /
// mind_training_activities.instructions, both jsonb) rather than one text
// field, so headings/paragraphs/lists/quotes/images/examples are each
// individually editable pieces in the admin editor and individually
// styleable when read. Used by the admin block editor (MindTrainingPathManager.jsx)
// and the read-only renderer (BlockRenderer.jsx).
export const BLOCK_TYPES = [
  { key: "heading", label: "Heading" },
  { key: "paragraph", label: "Paragraph" },
  { key: "list", label: "List" },
  { key: "quote", label: "Quote" },
  { key: "image", label: "Image" },
  { key: "example", label: "Example" },
];

export function emptyBlock(type) {
  switch (type) {
    case "heading":
      return { type, text: "" };
    case "list":
      return { type, style: "bullet", items: [""] };
    case "quote":
      return { type, text: "", attribution: "" };
    case "image":
      return { type, url: "", caption: "" };
    case "example":
      return { type, text: "" };
    case "paragraph":
    default:
      return { type: "paragraph", text: "" };
  }
}
