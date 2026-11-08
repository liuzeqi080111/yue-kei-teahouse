// Independent weather layer for the furnished interior scene.
// Call after the background is drawn and before drawing people.

const WIDTH = 1008;
const HEIGHT = 567;
const IMAGE_WIDTH = 1672;
const IMAGE_HEIGHT = 941;
const SCALE_X = WIDTH / IMAGE_WIDTH;
const SCALE_Y = HEIGHT / IMAGE_HEIGHT;

// These polygons describe glass only, in interior-furnished.png pixels.
// Bounds are kept alongside the points to avoid recomputing them every frame.
const WINDOW_PANES = [
  {
    points: [[112, 95], [296, 183], [303, 363], [114, 342]],
    minX: 112,
    maxX: 303,
    minY: 95,
    maxY: 363,
  },
  {
    points: [[325, 198], [404, 241], [414, 369], [328, 370]],
    minX: 325,
    maxX: 414,
    minY: 198,
    maxY: 370,
  },
  {
    points: [[434, 252], [479, 272], [478, 385], [436, 380]],
    minX: 434,
    maxX: 479,
    minY: 252,
    maxY: 385,
  },
  {
    points: [[115, 366], [298, 386], [305, 474], [115, 492]],
    minX: 115,
    maxX: 305,
    minY: 366,
    maxY: 492,
  },
];

// x and phase are normalized to each pane; speed is normalized per millisecond.
// A fixed table keeps rain deterministic without random state or a RAF loop.
const RAIN_DROPS = [
  { x: 0.08, phase: 0.03, speed: 0.00046, length: 26, slant: 7 },
  { x: 0.21, phase: 0.61, speed: 0.00037, length: 21, slant: 6 },
  { x: 0.35, phase: 0.28, speed: 0.00052, length: 32, slant: 8 },
  { x: 0.48, phase: 0.82, speed: 0.00042, length: 24, slant: 7 },
  { x: 0.59, phase: 0.47, speed: 0.00049, length: 29, slant: 8 },
  { x: 0.71, phase: 0.12, speed: 0.00035, length: 20, slant: 6 },
  { x: 0.82, phase: 0.72, speed: 0.00056, length: 34, slant: 9 },
  { x: 0.93, phase: 0.37, speed: 0.00044, length: 23, slant: 7 },
  { x: 0.16, phase: 0.89, speed: 0.00039, length: 28, slant: 8 },
  { x: 0.66, phase: 0.91, speed: 0.00050, length: 25, slant: 7 },
];

// Small, warm pools on the right-hand interior wall, away from the window glass.
// Coordinates and radii use the original image's pixel space.
const INTERIOR_LIGHTS = [
  { x: 1080, y: 165, radius: 205 },
  { x: 1430, y: 185, radius: 175 },
];

function mapX(imageX, sourceX, zoom) {
  // First map source-image pixels to W1008/H567, then apply the camera.
  return (imageX * SCALE_X - sourceX) * zoom;
}

function mapY(imageY, sourceY, zoom) {
  return (imageY * SCALE_Y - sourceY) * zoom;
}

function wrap01(value) {
  const wrapped = value % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

function tracePane(ctx, pane, sourceX, sourceY, zoom) {
  const first = pane.points[0];
  ctx.beginPath();
  ctx.moveTo(mapX(first[0], sourceX, zoom), mapY(first[1], sourceY, zoom));
  for (let index = 1; index < pane.points.length; index += 1) {
    const point = pane.points[index];
    ctx.lineTo(mapX(point[0], sourceX, zoom), mapY(point[1], sourceY, zoom));
  }
  ctx.closePath();
}

function drawAfternoon(ctx, sourceX, sourceY, zoom) {
  for (const pane of WINDOW_PANES) {
    ctx.save();
    tracePane(ctx, pane, sourceX, sourceY, zoom);
    ctx.clip();

    // The gradient is clipped to this individual piece of glass, not the room.
    const gradient = ctx.createLinearGradient(
      mapX(pane.minX, sourceX, zoom),
      mapY(pane.minY, sourceY, zoom),
      mapX(pane.maxX, sourceX, zoom),
      mapY(pane.maxY, sourceY, zoom),
    );
    gradient.addColorStop(0, 'rgba(255, 231, 183, 0.25)');
    gradient.addColorStop(0.55, 'rgba(255, 213, 155, 0.14)');
    gradient.addColorStop(1, 'rgba(255, 187, 108, 0.015)');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();
  }
}

function drawRain(ctx, elapsed, sourceX, sourceY, zoom) {
  for (let paneIndex = 0; paneIndex < WINDOW_PANES.length; paneIndex += 1) {
    const pane = WINDOW_PANES[paneIndex];
    ctx.save();
    tracePane(ctx, pane, sourceX, sourceY, zoom);
    ctx.clip();

    // Each pane gets its own darkening layer and its own clipped rain batch.
    const nightGradient = ctx.createLinearGradient(
      0,
      mapY(pane.minY, sourceY, zoom),
      0,
      mapY(pane.maxY, sourceY, zoom),
    );
    nightGradient.addColorStop(0, 'rgba(12, 25, 51, 0.46)');
    nightGradient.addColorStop(1, 'rgba(20, 43, 66, 0.40)');
    ctx.fillStyle = nightGradient;
    ctx.fill();

    ctx.beginPath();
    for (const drop of RAIN_DROPS) {
      // Pane offsets prevent identical rain patterns while remaining repeatable.
      const xRatio = wrap01(drop.x + paneIndex * 0.173);
      const yRatio = wrap01(drop.phase + paneIndex * 0.217 + elapsed * drop.speed);
      const x = pane.minX + xRatio * (pane.maxX - pane.minX);
      const y = pane.minY + yRatio * (pane.maxY - pane.minY);
      ctx.moveTo(mapX(x, sourceX, zoom), mapY(y, sourceY, zoom));
      ctx.lineTo(
        mapX(x + drop.slant*.32, sourceX, zoom),
        mapY(y + drop.length*.38, sourceY, zoom),
      );
    }
    ctx.strokeStyle = 'rgba(193, 221, 241, 0.27)';
    ctx.lineWidth = Math.max(0.45, .55 * zoom);
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  }
}

function drawInteriorLights(ctx, sourceX, sourceY, zoom) {
  for (const light of INTERIOR_LIGHTS) {
    const centerX = mapX(light.x, sourceX, zoom);
    const centerY = mapY(light.y, sourceY, zoom);
    const radius = light.radius * ((SCALE_X + SCALE_Y) * 0.5) * zoom;
    const glow = ctx.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      radius,
    );
    glow.addColorStop(0, 'rgba(255, 207, 133, 0.17)');
    glow.addColorStop(0.42, 'rgba(255, 188, 100, 0.075)');
    glow.addColorStop(1, 'rgba(255, 170, 83, 0)');
    ctx.fillStyle = glow;
    // Only the glow's local bounds are touched; no full-scene filter is used.
    ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
  }
}

/**
 * Draw weather over the background and before people.
 * elapsed is in milliseconds. sourceX/sourceY and zoom use the logical
 * W1008/H567 camera space after the original image has been normalized.
 */
export function drawInteriorWeather(
  ctx,
  { variant = 'dusk', elapsed = 0, sourceX = 0, sourceY = 0, zoom = 1 } = {},
) {
  if (!ctx || (variant !== 'afternoon' && variant !== 'rain')) {
    // In particular, dusk leaves the existing image completely untouched.
    return;
  }

  const cameraX = Number.isFinite(sourceX) ? sourceX : 0;
  const cameraY = Number.isFinite(sourceY) ? sourceY : 0;
  const cameraZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const time = Number.isFinite(elapsed) ? elapsed : 0;

  ctx.save();
  try {
    if (variant === 'afternoon') {
      drawAfternoon(ctx, cameraX, cameraY, cameraZoom);
    } else {
      drawRain(ctx, time, cameraX, cameraY, cameraZoom);
      drawInteriorLights(ctx, cameraX, cameraY, cameraZoom);
    }
  } finally {
    ctx.restore();
  }
}
