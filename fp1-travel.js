// FP1-TRAVEL-01: travel wiring over the follow controller (pure logic, no UI).
import { createFollowController } from './fp1-follow.js';

const SPEED = 2.15;
const ARRIVE_RADIUS = 0.025;
const MAX_DT = 0.08;
const MAX_MOVE = 0.18;

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

function number(value, label) {
  if (typeof value !== 'number') throw new TypeError(`${label} must be a number`);
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
}

function point(value, label) {
  if (!isObject(value)) throw new TypeError(`${label} must be an object`);
  return { x: number(value.x, `${label}.x`), z: number(value.z, `${label}.z`) };
}

function optionalFn(fn, label) {
  if (fn !== undefined && typeof fn !== 'function') {
    throw new TypeError(`${label} must be a function`);
  }
}

function normalizePoints(points) {
  if (!Array.isArray(points)) throw new TypeError('points must be an array');
  if (points.length === 0) throw new RangeError('points must contain at least 1 point');
  return points.map((item, index) => point(item, `points[${index}]`));
}

export function createFp1Travel(options = {}) {
  if (!isObject(options)) throw new TypeError('options must be an object');
  const canMove = options.canMove;
  const onArrive = options.onArrive;
  optionalFn(canMove, 'canMove');
  optionalFn(onArrive, 'onArrive');

  let position = point(options.initial, 'initial');
  let controller = null;
  let tag = null;
  let notified = false;
  let mode = 'manual';
  let reason = null;

  function snapshot() {
    return { position: { x: position.x, z: position.z }, mode, reason };
  }

  function block() {
    mode = 'paused';
    reason = 'blocked';
    if (controller) controller.pause('blocked');
    return snapshot();
  }

  function start(points, tagValue) {
    const targets = normalizePoints(points);
    const waypoints = [{ x: position.x, z: position.z }, ...targets];

    if (controller) controller.destroy();
    controller = createFollowController({
      waypoints,
      speed: SPEED,
      arriveRadius: ARRIVE_RADIUS,
      maxStep: MAX_DT,
    });
    tag = tagValue === undefined ? null : tagValue;
    notified = false;
    mode = 'following';
    reason = null;
    return snapshot();
  }

  function tick(dt) {
    const delta = number(dt, 'dt');
    if (delta < 0) throw new RangeError('dt must be >= 0');
    if (!controller || mode !== 'following') return snapshot();

    const result = controller.tick(Math.min(delta, MAX_DT), canMove);
    position = { x: result.position.x, z: result.position.z };

    if (result.mode === 'arrived') {
      mode = 'arrived';
      reason = null;
      if (!notified) {
        notified = true;
        const arrivedTag = tag;
        if (onArrive) onArrive(arrivedTag);
      }
      return snapshot();
    }

    if (result.mode === 'paused') {
      mode = 'paused';
      reason = result.reason;
      return snapshot();
    }

    mode = 'following';
    reason = null;
    return snapshot();
  }

  function pause() {
    if (mode !== 'following') return snapshot();
    mode = 'paused';
    reason = 'manual';
    if (controller) controller.pause('manual');
    return snapshot();
  }

  function resume() {
    if (mode !== 'paused' || !controller) return snapshot();
    const result = controller.resume();
    if (result.mode === 'following') {
      mode = 'following';
      reason = null;
    }
    return snapshot();
  }

  function move(dx, dz) {
    const stepX = number(dx, 'dx');
    const stepZ = number(dz, 'dz');
    const length = Math.hypot(stepX, stepZ);
    if (length === 0) return snapshot();

    const scale = Math.min(1, MAX_MOVE / length);
    const to = { x: position.x + stepX * scale, z: position.z + stepZ * scale };

    if (canMove) {
      let allowed = false;
      try {
        allowed = canMove({ x: position.x, z: position.z }, { x: to.x, z: to.z }) === true;
      } catch {
        return block();
      }
      if (!allowed) return block();
    }

    position = to;
    if (controller) {
      // Hand the validated position back: pause manually, keep route progress.
      controller.setPosition(to);
      mode = 'paused';
      reason = 'manual';
    } else {
      mode = 'manual';
      reason = null;
    }
    return snapshot();
  }

  function reset(nextPosition) {
    const next = point(nextPosition, 'position');
    if (controller) controller.destroy();
    controller = null;
    position = next;
    tag = null;
    notified = false;
    mode = 'manual';
    reason = null;
    return snapshot();
  }

  return { snapshot, reset, start, tick, pause, resume, move };
}
