/* eslint-disable no-restricted-globals */

// Douglas-Peucker algorithm for polyline simplification
function simplify(points, tolerance) {
  if (points.length <= 2) {
    return points;
  }

  let firstPoint = points[0];
  let lastPoint = points[points.length - 1];
  let index = -1;
  let maxDist = 0;

  for (let i = 1; i < points.length - 1; i++) {
    let dist = perpendicularDistance(points[i], firstPoint, lastPoint);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > tolerance) {
    let l1 = points.slice(0, index + 1);
    let l2 = points.slice(index);
    let r1 = simplify(l1, tolerance);
    let r2 = simplify(l2, tolerance);
    return r1.slice(0, r1.length - 1).concat(r2);
  } else {
    return [firstPoint, lastPoint];
  }
}

function perpendicularDistance(point, lineStart, lineEnd) {
  let dx = lineEnd[0] - lineStart[0];
  let dy = lineEnd[1] - lineStart[1];

  if (dx === 0 && dy === 0) {
    dx = point[0] - lineStart[0];
    dy = point[1] - lineStart[1];
    return Math.sqrt(dx * dx + dy * dy);
  }

  let t = ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));

  let closestPoint = [lineStart[0] + t * dx, lineStart[1] + t * dy];
  dx = point[0] - closestPoint[0];
  dy = point[1] - closestPoint[1];
  return Math.sqrt(dx * dx + dy * dy);
}


self.onmessage = (e) => {
  try {
    const { type, payload } = e.data;
    if (type === 'simplify') {
      const { points, epsilon } = payload;
      if (!points || !Array.isArray(points)) {
        throw new Error("Invalid 'points' data for simplification.");
      }
      const simplified = simplify(points, epsilon);
      self.postMessage({ type: 'simplifyDone', payload: { simplified } });
    }
  } catch (error) {
    self.postMessage({ type: 'error', error: error.message });
  }
};