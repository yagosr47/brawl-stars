import collisionData from './collisions.json' with { type: 'json' };
import { clamp } from './constants.js';

export const MAPS = Object.fromEntries(Object.entries(collisionData).map(([key, map]) => {
  const cells = new Uint8Array(map.columns * map.rows);
  let offset = 0;
  for (let i = 0; i < map.runs.length; i += 2) {
    cells.fill(map.runs[i], offset, offset + map.runs[i + 1]);
    offset += map.runs[i + 1];
  }
  return [key, { ...map, cells, width: map.columns * map.tileSize, height: map.rows * map.tileSize }];
}));

export function isSolid(mapKey, x, y) {
  const map = MAPS[mapKey];
  const tx = Math.floor(x / map.tileSize);
  const ty = Math.floor(y / map.tileSize);
  if (tx < 0 || ty < 0 || tx >= map.columns || ty >= map.rows) return true;
  return map.cells[ty * map.columns + tx] === 1;
}

export function canStand(mapKey, x, y, radius = mapKey === 'lobby' ? 9 : 4) {
  return ![
    [x - radius, y - radius * 0.55], [x + radius, y - radius * 0.55],
    [x - radius, y + radius * 0.55], [x + radius, y + radius * 0.55],
    [x, y],
  ].some(([px, py]) => isSolid(mapKey, px, py));
}

export function nearestWalkable(mapKey, point, radius) {
  if (canStand(mapKey, point.x, point.y, radius)) return { ...point };
  for (let ring = 1; ring < 30; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (const dy of [-ring, ring]) {
        const candidate = { x: point.x + dx * 8, y: point.y + dy * 8 };
        if (canStand(mapKey, candidate.x, candidate.y, radius)) return candidate;
      }
    }
    for (let dy = -ring + 1; dy < ring; dy++) {
      for (const dx of [-ring, ring]) {
        const candidate = { x: point.x + dx * 8, y: point.y + dy * 8 };
        if (canStand(mapKey, candidate.x, candidate.y, radius)) return candidate;
      }
    }
  }
  throw new Error(`No walkable spawn in ${mapKey}`);
}

export function movePosition(mapKey, position, input, seconds, ghost = false) {
  const map = MAPS[mapKey];
  const length = Math.hypot(input.x, input.y);
  if (!length) return { x: position.x, y: position.y };
  const speed = mapKey === 'lobby' ? 190 : ghost ? 137 : 106;
  const amount = speed * clamp(seconds, 0, 0.1) / Math.max(1, length);
  const steps = Math.max(1, Math.ceil(amount * length / 4));
  let x = position.x;
  let y = position.y;
  for (let i = 0; i < steps; i++) {
    const dx = input.x * amount / steps;
    const dy = input.y * amount / steps;
    if (ghost || canStand(mapKey, x + dx, y)) x += dx;
    if (ghost || canStand(mapKey, x, y + dy)) y += dy;
  }
  return { x: clamp(x, 8, map.width - 8), y: clamp(y, 8, map.height - 8) };
}

export function hasLineOfSight(mapKey, a, b) {
  const steps = Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / 4);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isSolid(mapKey, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
  }
  return true;
}

// A small BFS is sufficient for at most four practice bots on a 126 × 70 map.
export function findPath(start, goal) {
  const map = MAPS.ship;
  const from = nearestWalkable('ship', start);
  const to = nearestWalkable('ship', goal);
  const sx = Math.floor(from.x / 8), sy = Math.floor(from.y / 8);
  const gx = Math.floor(to.x / 8), gy = Math.floor(to.y / 8);
  const startIndex = sy * map.columns + sx, goalIndex = gy * map.columns + gx;
  const previous = new Int32Array(map.cells.length).fill(-1);
  const queue = new Int32Array(map.cells.length);
  let head = 0, tail = 1;
  queue[0] = startIndex;
  previous[startIndex] = startIndex;
  while (head < tail) {
    const index = queue[head++];
    if (index === goalIndex) break;
    const x = index % map.columns, y = Math.floor(index / map.columns);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, next = ny * map.columns + nx;
      if (nx < 0 || ny < 0 || nx >= map.columns || ny >= map.rows || previous[next] !== -1) continue;
      if (!canStand('ship', nx * 8 + 4, ny * 8 + 4, 3)) continue;
      previous[next] = index;
      queue[tail++] = next;
    }
  }
  if (previous[goalIndex] === -1) return [];
  const path = [];
  let index = goalIndex;
  while (index !== startIndex) {
    path.push({ x: (index % map.columns) * 8 + 4, y: Math.floor(index / map.columns) * 8 + 4 });
    index = previous[index];
  }
  return path.reverse();
}
