// Independent environment-motion candidate for the existing Canvas scene.
// No DOM, images, timers, network, random state, or scene/business imports.

const WIDTH = 1008;
const HEIGHT = 567;
const IMAGE_WIDTH = 1672;
const IMAGE_HEIGHT = 941;
const SCALE_X = WIDTH / IMAGE_WIDTH;
const SCALE_Y = HEIGHT / IMAGE_HEIGHT;
const AVERAGE_SCALE = (SCALE_X + SCALE_Y) * 0.5;

// Exactly the lower-left glass polygon in FEEDBACK-11 weather-layers.mjs.
// All moving traffic pixels are clipped to this existing interior-furnished.png pane.
const TRAFFIC_PANE = {
  points: [[115, 366], [298, 386], [305, 474], [115, 492]],
  minX: 115,
  maxX: 305,
};

// tableFoodLayout exposes at most six served items per page. Two wisps per drink
// plus one window clip path keep the worst frame at thirteen simple paths.
const MAX_STEAM_ANCHORS = 6;
const WISPS_PER_DRINK = 2;
// scene.js draws a 67*size-high drink at y-h*0.8. The painted hot-cup rim is
// approximately 12*size below that bitmap top, hence y-42*size here.
const CUP_RIM_FROM_ANCHOR = 42;

function wrap01(value) {
  const wrapped = value % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

function mapX(imageX, sourceX, zoom) {
  return (imageX * SCALE_X - sourceX) * zoom;
}

function mapY(imageY, sourceY, zoom) {
  return (imageY * SCALE_Y - sourceY) * zoom;
}

function traceTrafficPane(ctx, sourceX, sourceY, zoom) {
  const first = TRAFFIC_PANE.points[0];
  ctx.beginPath();
  ctx.moveTo(mapX(first[0], sourceX, zoom), mapY(first[1], sourceY, zoom));
  for (let index = 1; index < TRAFFIC_PANE.points.length; index += 1) {
    const point = TRAFFIC_PANE.points[index];
    ctx.lineTo(mapX(point[0], sourceX, zoom), mapY(point[1], sourceY, zoom));
  }
  ctx.closePath();
}

function drawDistantTraffic(ctx, elapsed, sourceX, sourceY, zoom, variant) {
  // One distant vehicle crosses every 32 seconds. It is fully outside the glass
  // at both wrap endpoints, so the repeat never produces a visible jump/flash.
  const phase = wrap01(elapsed / 32000 + 0.18);
  const x = TRAFFIC_PANE.minX - 30
    + phase * (TRAFFIC_PANE.maxX - TRAFFIC_PANE.minX + 60);
  const y = 466 + (x - TRAFFIC_PANE.minX) * 0.018;
  const lightAlpha = variant === 'afternoon' ? 0.34 : variant === 'rain' ? 0.78 : 0.62;

  traceTrafficPane(ctx, sourceX, sourceY, zoom);
  ctx.clip();

  // A subdued body and two small headlights follow the painted street, rather
  // than adding an unrelated particle or a full-scene lighting effect.
  ctx.fillStyle = variant === 'afternoon'
    ? 'rgba(54, 48, 43, 0.42)'
    : 'rgba(24, 28, 31, 0.58)';
  ctx.fillRect(
    mapX(x - 12, sourceX, zoom),
    mapY(y - 4, sourceY, zoom),
    24 * SCALE_X * zoom,
    6 * SCALE_Y * zoom,
  );
  ctx.fillStyle = `rgba(255, 218, 151, ${lightAlpha})`;
  const lightWidth = Math.max(0.7, 2.4 * AVERAGE_SCALE * zoom);
  const lightHeight = Math.max(0.55, 1.8 * SCALE_Y * zoom);
  ctx.fillRect(
    mapX(x + 4, sourceX, zoom),
    mapY(y - 3, sourceY, zoom),
    lightWidth,
    lightHeight,
  );
  ctx.fillRect(
    mapX(x + 9, sourceX, zoom),
    mapY(y - 3, sourceY, zoom),
    lightWidth,
    lightHeight,
  );
}

function drawHotDrinkSteam(ctx, elapsed, hotDrinks, variant) {
  let anchorCount = 0;
  for (const anchor of hotDrinks) {
    if (anchorCount >= MAX_STEAM_ANCHORS) break;
    if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)
      || !Number.isFinite(anchor.size) || anchor.size <= 0) continue;

    const { x, y, size } = anchor;
    const rimY = y - CUP_RIM_FROM_ANCHOR * size;
    for (let wisp = 0; wisp < WISPS_PER_DRINK; wisp += 1) {
      const phase = wrap01(elapsed / 4600 + anchorCount * 0.173 + wisp * 0.5);
      const fade = Math.sin(Math.PI * phase);
      const originX = x + (wisp === 0 ? -5 : 5) * size
        + Math.sin((phase + anchorCount * 0.11) * Math.PI * 2) * 1.5 * size;
      const startY = rimY - phase * 7 * size;
      const rise = (22 + phase * 12) * size;
      const endX = originX + Math.sin((phase + wisp * 0.31) * Math.PI * 2) * 4 * size;
      const alpha = fade * (variant === 'afternoon' ? 0.18 : 0.25);

      ctx.beginPath();
      ctx.moveTo(originX, startY);
      ctx.bezierCurveTo(
        originX - 5 * size,
        startY - rise * 0.35,
        originX + 7 * size,
        startY - rise * 0.68,
        endX,
        startY - rise,
      );
      ctx.strokeStyle = `rgba(255, 239, 211, ${alpha})`;
      ctx.lineWidth = Math.max(0.65, 1.25 * size);
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    anchorCount += 1;
  }
}

/**
 * 为现有室内 Canvas 增加热饮蒸汽与玻璃内远街车灯；不创建动画循环。
 *
 * @param ctx 正式场景已设置好逻辑坐标变换的 2D context；状态会被完整恢复。
 * @param camera scene.js 的 view.camera。
 * @param elapsed 已有绘制时钟的毫秒时间；相同输入得到相同画面。
 * @param sourceX/sourceY 室内原图裁切在 1008×567 逻辑空间中的左上角，即
 *   scene.js 的 centerX-W/(2*zoom)、centerY-H/(2*zoom)。
 * @param zoom 与室内背景 drawImage 相同的镜头缩放。
 * @param hotDrinks 仅由调用方从 tableFoodLayout 结果筛选出的已上桌、热、非外卖
 *   饮品锚点 [{x,y,size}]；缺省或不传时不画蒸汽，本模块不读取或猜测订单。
 * @param variant afternoon/dusk/rain，只调整局部配色，不添加全图滤镜。
 *
 * 正式接入建议（本候选不修改正式源）：在 scene.js 画完饮品后调用；房间镜头
 * 同时传入上述背景裁切参数。由现有帧循环提供 elapsed，并按当前天气传 variant。
 * 接入时再把本模块加入 server.mjs 与 scripts/build-pages.mjs 两个静态白名单。
 */
export function drawSceneMotion(
  ctx,
  {
    camera = 'room',
    elapsed = 0,
    sourceX = 0,
    sourceY = 0,
    zoom = 1,
    hotDrinks = [],
    variant = 'dusk',
    traffic = true,
  } = {},
) {
  if (!ctx) return;
  const interiorCamera = camera === 'entrance' || camera === 'walk' || camera === 'room';
  const tableCamera = camera === 'table' || camera === 'menu' || camera === 'bill';
  if (!interiorCamera && !tableCamera) return;

  const time = Number.isFinite(elapsed) ? elapsed : 0;
  const cameraX = Number.isFinite(sourceX) ? sourceX : 0;
  const cameraY = Number.isFinite(sourceY) ? sourceY : 0;
  const cameraZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;

  ctx.save();
  try {
    if ((camera === 'room' || tableCamera) && Array.isArray(hotDrinks)) {
      drawHotDrinkSteam(ctx, time, hotDrinks, variant);
    }
    if (interiorCamera && traffic) {
      // This clip is removed by the same finally/restore that preserves all
      // other caller state; steam drawn above remains outside the glass clip.
      drawDistantTraffic(ctx, time, cameraX, cameraY, cameraZoom, variant);
    }
  } finally {
    ctx.restore();
  }
}
