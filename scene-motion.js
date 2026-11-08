// Deterministic street-layer compositing and steam for the existing Canvas scene.
// The caller owns decoded assets and the animation clock; no timers or network.

const WIDTH = 1008;
const HEIGHT = 567;
const IMAGE_WIDTH = 1672;
const IMAGE_HEIGHT = 941;
const SCALE_X = WIDTH / IMAGE_WIDTH;
const SCALE_Y = HEIGHT / IMAGE_HEIGHT;

// Glass interiors measured in the original painting, inset from green mullions,
// handles and the sill. One street continues behind the foreground window post.
export const STREET_PANES = [
 [[0,350],[48,357],[48,493],[0,504]],
 [[122,375],[279,392],[280,460],[122,486]],
];

export function streetMotionAt(elapsed=0){
 const phase=wrap01((elapsed+4000)/24000);
 const x=330-phase*510;
 const depth=1+(200-x)*.00045;
 return {x,y:494-x*.12,width:138*depth,height:82*depth,phase};
}

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

function drawDistantTraffic(ctx, elapsed, sourceX, sourceY, zoom, street) {
 if(!street?.clean?.naturalWidth||!street?.tram?.naturalWidth)return;
 ctx.save();
 ctx.translate(-sourceX*zoom,-sourceY*zoom);
 ctx.scale(SCALE_X*zoom,SCALE_Y*zoom);
 ctx.beginPath();
 for(const pane of STREET_PANES){pane.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();}
 ctx.clip();
 // Replace only the street visible through glass. The rest of the original
 // painting is never replaced, and its baked-in stationary tram is removed.
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 ctx.drawImage(street.clean,0,0,IMAGE_WIDTH,IMAGE_HEIGHT);
 const {x,y,width,height}=streetMotionAt(elapsed);
 ctx.translate(x,y);ctx.rotate(-.045);
 // Tight alpha bounds of the versioned sprite; keep transparent margins out of
 // world-space sizing so wheels and road retain a stable contact anchor.
 const crop=street.crop||{x:0,y:0,width:street.tram.naturalWidth,height:street.tram.naturalHeight};
 ctx.drawImage(street.tram,crop.x,crop.y,crop.width,crop.height,0,-height,width,height);
 ctx.restore();
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
 * 为室内 Canvas 合成玻璃后面的街景、电车与热饮蒸汽；不创建动画循环。
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
 * @param street scene.js 已解码的 clean/tram 图层与透明素材的 crop 边界。
 * 街景在室内光照/天气之前绘制；饮品后另以 traffic:false 绘制蒸汽。
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
    street,
  } = {},
) {
  if (!ctx) return;
  const interiorCamera = camera === 'entrance' || camera === 'walk' || camera === 'room' || camera === 'window';
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
      drawDistantTraffic(ctx, time, cameraX, cameraY, cameraZoom, street);
    }
  } finally {
    ctx.restore();
  }
}
