const DEFAULT_WORLD_WIDTH = 1008;
const DEFAULT_WORLD_HEIGHT = 567;
const MIN_RENDER_SCALE = 1;
const MAX_RENDER_SCALE = 2;

function positiveFiniteOr(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * 计算居中场景内容框，以及与显示尺寸、DPR 匹配的内部渲染尺寸。
 * contain/cover 保持等比；fill 可拉伸显示，但内部渲染始终保持 world 比例。
 */
export function fitScene(options = {}) {
  const input = options ?? {};
  const worldWidth = positiveFiniteOr(input.worldWidth, DEFAULT_WORLD_WIDTH);
  const worldHeight = positiveFiniteOr(input.worldHeight, DEFAULT_WORLD_HEIGHT);

  const hasValidViewport =
    Number.isFinite(input.width) && input.width > 0 &&
    Number.isFinite(input.height) && input.height > 0;
  const width = hasValidViewport ? input.width : worldWidth;
  const height = hasValidViewport ? input.height : worldHeight;
  const dpr = positiveFiniteOr(input.dpr, 1);
  const fit = input.fit === "cover" || input.fit === "fill"
    ? input.fit
    : "contain";

  let scaleX;
  let scaleY;

  if (fit === "fill") {
    scaleX = width / worldWidth;
    scaleY = height / worldHeight;
  } else {
    const widthScale = width / worldWidth;
    const heightScale = height / worldHeight;
    const scale = fit === "cover"
      ? Math.max(widthScale, heightScale)
      : Math.min(widthScale, heightScale);
    scaleX = scale;
    scaleY = scale;
  }

  const displayWidth = worldWidth * scaleX;
  const displayHeight = worldHeight * scaleY;
  const offsetX = (width - displayWidth) / 2;
  const offsetY = (height - displayHeight) / 2;

  // fill 按较大的显示倍率估算，避免任一轴向采样不足。
  const displayScale = Math.max(scaleX, scaleY);
  const renderScale = Math.min(
    MAX_RENDER_SCALE,
    Math.max(MIN_RENDER_SCALE, displayScale * dpr),
  );
  const renderWidth = Math.max(1, Math.round(worldWidth * renderScale));
  const renderHeight = Math.max(1, Math.round(worldHeight * renderScale));

  return {
    scaleX,
    scaleY,
    displayWidth,
    displayHeight,
    offsetX,
    offsetY,
    renderWidth,
    renderHeight,
    renderScale,
  };
}

export default fitScene;
