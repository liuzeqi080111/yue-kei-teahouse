// FP1-FOLLOW-02: pure-logic auto-follow controller (no rendering, no UI).
// Fix: announcing arrival inside arriveRadius keeps the already-validated
// position; snapping to the exact endpoint only happens after canMove allows it.

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

function number(value, label) {
  if (typeof value !== 'number') throw new TypeError(`${label} must be a number`);
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
}

function positive(value, fallback, label) {
  if (value === undefined) return fallback;
  number(value, label);
  if (value <= 0) throw new RangeError(`${label} must be greater than 0`);
  return value;
}

function normalizeWaypoints(list) {
  if (!Array.isArray(list)) throw new TypeError('waypoints must be an array');
  if (list.length < 2) throw new RangeError('waypoints must contain at least 2 points');
  return list.map((point, index) => {
    if (!isObject(point)) throw new TypeError(`waypoints[${index}] must be an object`);
    const x = number(point.x, `waypoints[${index}].x`);
    const z = number(point.z, `waypoints[${index}].z`);
    return Object.freeze({ x, z });
  });
}

export function createFollowController(options = {}) {
  if (!isObject(options)) throw new TypeError('options must be an object');
  const waypoints = normalizeWaypoints(options.waypoints);
  const speed = positive(options.speed, 1.4, 'speed');
  const maxStep = positive(options.maxStep, 0.1, 'maxStep');
  let arriveRadius = 0.05;
  if (options.arriveRadius !== undefined) {
    number(options.arriveRadius, 'arriveRadius');
    if (options.arriveRadius < 0) throw new RangeError('arriveRadius must be >= 0');
    arriveRadius = options.arriveRadius;
  }

  const lastIndex = waypoints.length - 1;
  const position = { x: waypoints[0].x, z: waypoints[0].z };
  let targetIndex = 1;
  let mode = 'following';
  let reason = null;
  let completed = false;

  const snapshot = () => ({ position: { x: position.x, z: position.z }, targetIndex, mode, reason });
  const block = () => { mode = 'paused'; reason = 'blocked'; };

  // Never moves the controller: callers commit only validated positions.
  function arrive() {
    targetIndex = lastIndex;
    completed = true;
    mode = 'arrived';
    reason = null;
    return snapshot();
  }

  function tick(dt, canMove) {
    if (typeof dt !== 'number') throw new TypeError('dt must be a number');
    if (!Number.isFinite(dt)) throw new RangeError('dt must be finite');
    if (dt < 0) throw new RangeError('dt must be >= 0');
    if (mode !== 'following') return snapshot();
    if (canMove !== undefined && typeof canMove !== 'function') {
      throw new TypeError('canMove must be a function when provided');
    }

    // One frame never advances more than maxStep seconds of travel.
    let budget = speed * Math.min(dt, maxStep);
    while (budget > 0 && targetIndex <= lastIndex) {
      const target = waypoints[targetIndex];
      const isLast = targetIndex === lastIndex;
      const dx = target.x - position.x;
      const dz = target.z - position.z;
      const segment = Math.hypot(dx, dz);

      if (segment === 0) {
        if (isLast) return arrive();
        targetIndex += 1;
        continue;
      }

      const travel = Math.min(budget, segment);
      const reached = travel === segment;
      const nextX = reached ? target.x : position.x + (dx / segment) * travel;
      const nextZ = reached ? target.z : position.z + (dz / segment) * travel;

      if (canMove) {
        let ok = false;
        try {
          // Fresh copies: the callback cannot touch internal state.
          ok = canMove({ x: position.x, z: position.z }, { x: nextX, z: nextZ }) === true;
        } catch {
          block();
          return snapshot();
        }
        if (!ok) {
          block();
          return snapshot();
        }
      }

      position.x = nextX;
      position.z = nextZ;
      budget -= travel;

      if (reached) {
        targetIndex += 1;
        if (isLast) return arrive();
        continue;
      }
      if (isLast && segment - travel <= arriveRadius) return arrive();
      return snapshot();
    }
    return snapshot();
  }

  function pause(pauseReason = 'manual') {
    if (typeof pauseReason !== 'string') throw new TypeError('reason must be a string');
    if (mode === 'following') { mode = 'paused'; reason = pauseReason; }
    return snapshot();
  }

  function resume() {
    if (mode === 'paused' && !completed) { mode = 'following'; reason = null; }
    return snapshot();
  }

  function setPosition(next) {
    if (!isObject(next)) throw new TypeError('position must be an object');
    const x = number(next.x, 'position.x');
    const z = number(next.z, 'position.z');
    if (mode === 'destroyed') return snapshot();
    position.x = x;
    position.z = z;
    mode = 'paused'; // free-move handoff; route progress is kept
    reason = 'manual';
    return snapshot();
  }

  function destroy() { mode = 'destroyed'; reason = null; return snapshot(); }

  return { snapshot, tick, pause, resume, setPosition, destroy };
}
