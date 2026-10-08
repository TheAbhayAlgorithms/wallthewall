// Client-side snapshot interpolation
const INTERP_DELAY = 100; // ms buffer
const snapshots = [];

export function addSnapshot(snapshot) {
  snapshots.push({ ...snapshot, receivedAt: Date.now() });
  // Keep only last 20 snapshots
  if (snapshots.length > 20) snapshots.shift();
}

export function getInterpolatedState() {
  if (snapshots.length === 0) return null;
  if (snapshots.length === 1) return snapshots[0];

  const renderTime = Date.now() - INTERP_DELAY;

  // Find the two snapshots to interpolate between
  let before = null;
  let after = null;

  for (let i = 0; i < snapshots.length - 1; i++) {
    if (snapshots[i].receivedAt <= renderTime && snapshots[i + 1].receivedAt >= renderTime) {
      before = snapshots[i];
      after = snapshots[i + 1];
      break;
    }
  }

  if (!before) {
    // Either all snapshots are in the future or all are in the past
    if (renderTime < snapshots[0].receivedAt) {
      return snapshots[0];
    }
    return snapshots[snapshots.length - 1];
  }

  // Interpolation factor
  const t = Math.max(0, Math.min(1,
    (renderTime - before.receivedAt) / (after.receivedAt - before.receivedAt)
  ));

  return {
    ball: {
      x: lerp(before.ball.x, after.ball.x, t),
      y: lerp(before.ball.y, after.ball.y, t),
      vx: after.ball.vx,
      vy: after.ball.vy,
      speed: after.ball.speed,
    },
    paddles: {
      left: { x: before.paddles.left.x, y: lerp(before.paddles.left.y, after.paddles.left.y, t) },
      right: { x: before.paddles.right.x, y: lerp(before.paddles.right.y, after.paddles.right.y, t) },
    },
    score: after.score,
    tick: after.tick,
    paused: after.paused,
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clearSnapshots() {
  snapshots.length = 0;
}
