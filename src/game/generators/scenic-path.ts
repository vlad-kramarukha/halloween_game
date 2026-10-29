export interface RoutePoint { x: number; y: number }

/** Distribute exactly count cells along an authored route, retaining every bend. */
export function createScenicPath(count: number, waypoints: readonly RoutePoint[]) {
  if (!Number.isInteger(count) || count < waypoints.length || waypoints.length < 2) {
    throw new Error('The scenic route needs at least one cell per waypoint');
  }
  const lengths = waypoints.slice(1).map((point, i) => Math.hypot(point.x - waypoints[i].x, point.y - waypoints[i].y));
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  if (!totalLength || lengths.some(length => length === 0)) throw new Error('Route segments must have positive length');
  const remaining = count - waypoints.length;
  const shares = lengths.map(length => remaining * length / totalLength);
  const steps = shares.map(share => 1 + Math.floor(share));
  let extra = count - 1 - steps.reduce((sum, value) => sum + value, 0);
  const order = shares.map((share, index) => ({ index, remainder: share % 1 })).sort((a, b) => b.remainder - a.remainder);
  for (const item of order) {
    if (extra-- <= 0) break;
    steps[item.index]++;
  }
  const cells = [{ index: 0, ...waypoints[0] }];
  for (let i = 0; i < steps.length; i++) {
    for (let step = 1; step <= steps[i]; step++) {
      const t = step / steps[i];
      cells.push({ index: cells.length,
        x: waypoints[i].x + (waypoints[i + 1].x - waypoints[i].x) * t,
        y: waypoints[i].y + (waypoints[i + 1].y - waypoints[i].y) * t,
      });
    }
  }
  return cells;
}
