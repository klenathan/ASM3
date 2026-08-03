#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";

const CONNECTABLE_TYPES = new Set([
  "rectangle",
  "ellipse",
  "diamond",
  "image",
  "iframe",
  "embeddable",
]);
const MIN_NODE_GAP = 60;
const TEXT_HEAVY_CHARACTER_LIMIT = 120;
const TEXT_HEAVY_LINE_LIMIT = 3;
const EPSILON = 1e-6;

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node audit-bindings.mjs <diagram.excalidraw> [...]");
  process.exit(2);
}

let failureCount = 0;
for (const file of files) {
  const errors = await auditFile(file);
  if (errors.length === 0) {
    console.log(`${file}: binding audit passed`);
    continue;
  }

  failureCount += errors.length;
  console.error(`${file}: binding audit failed (${errors.length} error${errors.length === 1 ? "" : "s"})`);
  for (const error of errors) console.error(`  - ${error}`);
}

process.exit(failureCount === 0 ? 0 : 1);

async function auditFile(file) {
  let document;
  try {
    document = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    return [`cannot read valid JSON: ${error.message}`];
  }

  const elements = Array.isArray(document) ? document : document.elements;
  if (!Array.isArray(elements)) return ["document must contain an elements array"];

  const errors = [];
  const elementsById = new Map();
  for (const element of elements) {
    if (!element || typeof element.id !== "string" || element.id.length === 0) {
      errors.push("every element must have a non-empty string id");
      continue;
    }
    if (elementsById.has(element.id)) errors.push(`duplicate element id ${quote(element.id)}`);
    else elementsById.set(element.id, element);
  }

  for (const element of elements) auditBoundElements(element, elementsById, errors);

  const arrows = elements.filter((element) => element?.type === "arrow");
  for (const arrow of arrows) auditArrow(arrow, elementsById, errors);

  const texts = elements.filter((element) => element?.type === "text");
  for (const text of texts) auditText(text, elementsById, errors);

  const nodes = elements.filter(isConnectable);
  auditNodeSpacing(nodes, errors);
  auditLikelyDetachedLabels(texts, nodes, errors);

  return [...new Set(errors)];
}

function auditBoundElements(host, elementsById, errors) {
  if (host.boundElements == null) return;
  if (!Array.isArray(host.boundElements)) {
    errors.push(`${describe(host)} boundElements must be an array or null`);
    return;
  }

  const seen = new Set();
  for (const reference of host.boundElements) {
    const key = `${reference?.type}:${reference?.id}`;
    if (seen.has(key)) errors.push(`${describe(host)} duplicates bound reference ${quote(key)}`);
    seen.add(key);

    const target = elementsById.get(reference?.id);
    if (!target) {
      errors.push(`${describe(host)} has stale bound reference ${quote(reference?.id)}`);
      continue;
    }
    if (target.type !== reference.type) {
      errors.push(`${describe(host)} references ${describe(target)} as type ${quote(reference?.type)}`);
      continue;
    }

    if (reference.type === "arrow") {
      const reciprocal = target.startBinding?.elementId === host.id || target.endBinding?.elementId === host.id;
      if (!reciprocal) errors.push(`${describe(host)} references ${describe(target)}, but the arrow does not bind back`);
    } else if (reference.type === "text" && target.containerId !== host.id) {
      errors.push(`${describe(host)} references ${describe(target)}, but its containerId does not point back`);
    }
  }
}

function auditArrow(arrow, elementsById, errors) {
  if (arrow.customData?.bindingAudit === "annotation") return;

  auditArrowEnd(arrow, "start", arrow.startBinding, elementsById, errors);
  auditArrowEnd(arrow, "end", arrow.endBinding, elementsById, errors);
}

function auditArrowEnd(arrow, endName, binding, elementsById, errors) {
  const prefix = `${describe(arrow)} ${endName}Binding`;
  if (!binding || typeof binding !== "object") {
    errors.push(`${prefix} is required for a connector`);
    return;
  }

  const host = elementsById.get(binding.elementId);
  if (!host) {
    errors.push(`${prefix} references missing element ${quote(binding.elementId)}`);
    return;
  }
  if (!isConnectable(host)) {
    errors.push(`${prefix} targets non-connectable ${describe(host)}`);
  }

  if (!isFiniteNumber(binding.gap) || binding.gap < 0) errors.push(`${prefix}.gap must be a finite non-negative number`);
  if (!isFiniteNumber(binding.focus) || binding.focus < -1 || binding.focus > 1) errors.push(`${prefix}.focus must be between -1 and 1`);
  if (!isEdgeFixedPoint(binding.fixedPoint)) {
    errors.push(`${prefix}.fixedPoint must be a normalized point on one shape edge`);
  }

  const references = Array.isArray(host.boundElements)
    ? host.boundElements.filter((item) => item?.id === arrow.id && item?.type === "arrow")
    : [];
  if (references.length !== 1) {
    errors.push(`${describe(host)} must reference ${describe(arrow)} exactly once; found ${references.length}`);
  }

  if (isEdgeFixedPoint(binding.fixedPoint)) auditEndpointGeometry(arrow, endName, host, binding, errors);
}

function auditEndpointGeometry(arrow, endName, host, binding, errors) {
  if (!Array.isArray(arrow.points) || arrow.points.length < 2 || !isFiniteNumber(arrow.x) || !isFiniteNumber(arrow.y)) {
    errors.push(`${describe(arrow)} needs x, y, and at least two points to validate endpoints`);
    return;
  }

  const point = endName === "start" ? arrow.points[0] : arrow.points.at(-1);
  if (!Array.isArray(point) || !isFiniteNumber(point[0]) || !isFiniteNumber(point[1])) {
    errors.push(`${describe(arrow)} has an invalid ${endName} point`);
    return;
  }

  const endpoint = { x: arrow.x + point[0], y: arrow.y + point[1] };
  const anchor = rotatedAnchor(host, binding.fixedPoint);
  if (!anchor) return;

  const tolerance = Math.max(24, (isFiniteNumber(binding.gap) ? binding.gap : 0) + 20);
  if (Math.hypot(endpoint.x - anchor.x, endpoint.y - anchor.y) > tolerance) {
    errors.push(`${describe(arrow)} ${endName} point is not near the edge selected on ${describe(host)}`);
  }
}

function auditText(text, elementsById, errors) {
  if (text.containerId == null) return;

  if (isTextHeavy(text)) {
    errors.push(`${describe(text)} is text-heavy and must be grouped with its backing shape instead of container-bound`);
  }

  const host = elementsById.get(text.containerId);
  if (!host) {
    errors.push(`${describe(text)} references missing container ${quote(text.containerId)}`);
    return;
  }
  if (!isConnectable(host)) errors.push(`${describe(text)} uses non-connectable ${describe(host)} as its container`);

  const references = Array.isArray(host.boundElements)
    ? host.boundElements.filter((item) => item?.id === text.id && item?.type === "text")
    : [];
  if (references.length !== 1) {
    errors.push(`${describe(host)} must reference ${describe(text)} exactly once; found ${references.length}`);
  }

  if (hasBounds(text) && hasBounds(host) && !boundsContain(host, text, 2)) {
    errors.push(`${describe(text)} does not fit within ${describe(host)}`);
  }
}

function auditLikelyDetachedLabels(texts, nodes, errors) {
  for (const text of texts) {
    if (text.containerId != null || !hasBounds(text)) continue;
    const center = { x: text.x + text.width / 2, y: text.y + text.height / 2 };
    const containingNode = nodes.find((node) => pointInsideBounds(center, node, 2));
    if (!containingNode) continue;

    const sharedGroups = sharedGroupIds(text, containingNode);
    if (!isTextHeavy(text)) {
      errors.push(`${describe(text)} is short text inside ${describe(containingNode)} and must use a container binding`);
    } else if (sharedGroups.length === 0) {
      errors.push(`${describe(text)} is text-heavy inside ${describe(containingNode)} and must share a groupId with it`);
    } else if (!boundsContain(containingNode, text, 2)) {
      errors.push(`${describe(text)} does not fit within grouped backing shape ${describe(containingNode)}`);
    }
  }
}

function auditNodeSpacing(nodes, errors) {
  for (let index = 0; index < nodes.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < nodes.length; otherIndex += 1) {
      const first = nodes[index];
      const second = nodes[otherIndex];
      if (!hasBounds(first) || !hasBounds(second)) continue;

      const horizontalGap = Math.max(0, first.x - (second.x + second.width), second.x - (first.x + first.width));
      const verticalGap = Math.max(0, first.y - (second.y + second.height), second.y - (first.y + first.height));
      const edgeGap = Math.hypot(horizontalGap, verticalGap);
      if (edgeGap < MIN_NODE_GAP) {
        errors.push(`${describe(first)} and ${describe(second)} are only ${edgeGap.toFixed(1)} px apart; require at least ${MIN_NODE_GAP} px`);
      }
    }
  }
}

function isConnectable(element) {
  return element && CONNECTABLE_TYPES.has(element.type) && !element.isDeleted;
}

function isTextHeavy(text) {
  const content = typeof text?.text === "string" ? text.text : "";
  const nonEmptyLines = content.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
  return content.length > TEXT_HEAVY_CHARACTER_LIMIT || nonEmptyLines > TEXT_HEAVY_LINE_LIMIT;
}

function sharedGroupIds(first, second) {
  const firstGroups = new Set(validGroupIds(first));
  return validGroupIds(second).filter((groupId) => firstGroups.has(groupId));
}

function validGroupIds(element) {
  return Array.isArray(element?.groupIds)
    ? element.groupIds.filter((groupId) => typeof groupId === "string" && groupId.length > 0)
    : [];
}

function isEdgeFixedPoint(value) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(isFiniteNumber)) return false;
  const [x, y] = value;
  if (x < 0 || x > 1 || y < 0 || y > 1) return false;
  return nearly(x, 0) || nearly(x, 1) || nearly(y, 0) || nearly(y, 1);
}

function rotatedAnchor(host, fixedPoint) {
  if (!hasBounds(host)) return null;
  const centerX = host.x + host.width / 2;
  const centerY = host.y + host.height / 2;
  const unrotatedX = host.x + host.width * fixedPoint[0];
  const unrotatedY = host.y + host.height * fixedPoint[1];
  const angle = isFiniteNumber(host.angle) ? host.angle : 0;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: centerX + (unrotatedX - centerX) * cosine - (unrotatedY - centerY) * sine,
    y: centerY + (unrotatedX - centerX) * sine + (unrotatedY - centerY) * cosine,
  };
}

function hasBounds(element) {
  return isFiniteNumber(element?.x) && isFiniteNumber(element?.y) && isFiniteNumber(element?.width) && isFiniteNumber(element?.height);
}

function boundsContain(outer, inner, tolerance = 0) {
  return inner.x >= outer.x - tolerance
    && inner.y >= outer.y - tolerance
    && inner.x + inner.width <= outer.x + outer.width + tolerance
    && inner.y + inner.height <= outer.y + outer.height + tolerance;
}

function pointInsideBounds(point, bounds, tolerance = 0) {
  return point.x >= bounds.x - tolerance
    && point.x <= bounds.x + bounds.width + tolerance
    && point.y >= bounds.y - tolerance
    && point.y <= bounds.y + bounds.height + tolerance;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function nearly(first, second) {
  return Math.abs(first - second) <= EPSILON;
}

function describe(element) {
  return `${element?.type ?? "element"} ${quote(element?.id)}`;
}

function quote(value) {
  return JSON.stringify(value);
}
