---
name: excalidraw-diagram-generator
description: Use whenever creating, editing, repairing, or reviewing Excalidraw `.excalidraw` files or Excalidraw element JSON. Generates structurally valid diagrams with reciprocal arrow bindings, container-bound short labels, grouped text-heavy cards, reliable spacing and routing, and runs a binding audit before claiming completion.
compatibility: Requires Node.js to run the bundled structural auditor.
---

# Excalidraw Diagram Generator

Create diagrams that remain correct when nodes are selected, moved, or resized. Visual proximity is not a connection: connectors use reciprocal bindings, while text is attached with either a container binding or a shared group according to its content density.

## Workflow

1. Read the complete target `.excalidraw` file before editing it.
2. Inventory element IDs, node bounds, labels, arrows, and existing `boundElements` references.
3. Lay out connectable nodes with at least 60 px of clear edge-to-edge separation. Increase spacing when bindings or labels would be ambiguous.
4. Use a container-bound text element for short node labels. Use a separate text element grouped with its backing shape for text-heavy cards.
5. Create or update arrows using bindings at both endpoints and reciprocal shape references.
6. Route edge-to-edge without crossing nodes, labels, or decorative containers.
7. Remove stale references and deduplicate each shape's `boundElements` by `(id, type)`.
8. Save valid JSON, then run `node scripts/audit-bindings.mjs <diagram.excalidraw>` from this skill directory. Resolve every error before returning the diagram.

Do not claim completion based on appearance alone. The audit command must exit successfully for every changed diagram.

## Connector Contract

Treat every arrow used as a connection as one bidirectionally bound relationship:

- Give the arrow a `startBinding` whose `elementId` is the exact source shape ID.
- Give the arrow an `endBinding` whose `elementId` is the exact destination shape ID.
- Include finite, valid `gap`, `focus`, and `fixedPoint` values in both bindings.
- Add `{ "id": "<arrow-id>", "type": "arrow" }` exactly once to both shapes' `boundElements` arrays.
- Ensure every referenced element exists and no stale arrow reference remains on any shape.

Use normalized fixed points on the intended edge:

- Right middle: `[1, 0.5]`
- Left middle: `[0, 0.5]`
- Top middle: `[0.5, 0]`
- Bottom middle: `[0.5, 1]`

Choose the edge from the actual route. The arrow's first point must be at the source edge selected by `startBinding.fixedPoint`; its last point must be at the destination edge selected by `endBinding.fixedPoint`. Keep the endpoint outside the node by approximately the binding `gap`.

```json
{
  "id": "source-box",
  "type": "rectangle",
  "x": 100,
  "y": 100,
  "width": 180,
  "height": 80,
  "boundElements": [{ "id": "flow-arrow", "type": "arrow" }]
},
{
  "id": "target-box",
  "type": "rectangle",
  "x": 420,
  "y": 100,
  "width": 180,
  "height": 80,
  "boundElements": [{ "id": "flow-arrow", "type": "arrow" }]
},
{
  "id": "flow-arrow",
  "type": "arrow",
  "startBinding": {
    "elementId": "source-box",
    "gap": 8,
    "focus": 0,
    "fixedPoint": [1, 0.5]
  },
  "endBinding": {
    "elementId": "target-box",
    "gap": 8,
    "focus": 0,
    "fixedPoint": [0, 0.5]
  }
}
```

An arrow that is intentionally a free-standing annotation is not a connector. Prefer a line for decorative strokes. If an unbound arrow is essential, mark it with `"customData": { "bindingAudit": "annotation" }`; never use that exemption for a relationship between nodes.

## Text Contract

Choose the attachment model from the amount of text. This avoids Excalidraw's container-label resizing behavior turning a text-heavy card into an oversized or difficult-to-edit node.

### Short node labels

Use a container binding when the text is at most three non-empty lines and at most 120 characters:

- Set the text element's `containerId` to the exact host shape ID.
- Add `{ "id": "<text-id>", "type": "text" }` exactly once to the host's `boundElements`.
- Keep the text bounds inside the host and normally use `textAlign: "center"` and `verticalAlign: "middle"`.
- Do not add a group solely to attach a short label.

### Text-heavy cards

Use a standalone text component grouped with its backing shape when the content exceeds 120 characters or three non-empty lines:

- Give the shape and text at least one identical, non-empty `groupIds` entry, such as `"card-auth-details"`.
- Set the text's `containerId` to `null` or omit it. Do not add the text to the shape's `boundElements`.
- Keep the full text bounds inside the shape with deliberate padding. Prefer left-aligned, top-aligned body copy and size the shape from the text's measured bounds.
- Keep the backing shape as the node: arrows bind to the shape, never to the text or group ID.
- Use one text element for one coherent block. Split headings from body copy only when they need distinct typography; give every text component and the backing shape the same card group ID.
- Preserve any existing outer group IDs when editing. Add a dedicated shared card group rather than discarding unrelated grouping structure.

```json
{
  "id": "policy-card",
  "type": "rectangle",
  "x": 100,
  "y": 100,
  "width": 360,
  "height": 180,
  "groupIds": ["card-policy"],
  "boundElements": [{ "id": "next-arrow", "type": "arrow" }]
},
{
  "id": "policy-copy",
  "type": "text",
  "x": 124,
  "y": 124,
  "width": 312,
  "height": 132,
  "groupIds": ["card-policy"],
  "containerId": null,
  "text": "Access policy\nStudents sign in with an approved RMIT email.\nModerators act only within their societies.\nSystem admins handle global operations.",
  "textAlign": "left",
  "verticalAlign": "top"
}
```

Do not combine the two models for the same text element. A grouped text-heavy component is intentionally not a bound label.

## Layout Safety

- Keep connectable shapes at least 60 px apart edge-to-edge.
- Prefer frames or non-interactive decorative elements over large rectangles behind connectable nodes.
- Never bind an arrow to a background, section decoration, or frame when the intended target is a foreground node.
- Avoid node, arrow, label, and decorative-container overlaps.
- Route from explicit source edge to explicit destination edge. Do not rely on endpoints that merely look close.

## Required Audit

Run:

```bash
node scripts/audit-bindings.mjs path/to/diagram.excalidraw
```

For multiple files:

```bash
node scripts/audit-bindings.mjs first.excalidraw second.excalidraw
```

The audit verifies:

- Element IDs exist and are unique.
- Connector arrows have valid bindings at both ends.
- Binding targets are connectable foreground shapes.
- `gap`, `focus`, and edge `fixedPoint` values are valid.
- Arrow endpoints are near the selected fixed-point edges.
- Shape-to-arrow and shape-to-text references are reciprocal and deduplicated.
- Bound labels have valid hosts and fit within them.
- Short text visually inside a node is container-bound.
- Text-heavy content inside a node is unbound, fits within its backing shape, and shares a group ID with that shape.
- Connectable nodes maintain at least 60 px separation.

Repair the JSON and rerun until the command reports `binding audit passed`.
