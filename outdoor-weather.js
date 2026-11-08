// Independent weather overlay for assets/exterior.png in the 1008 × 567 world.
// Draw after the exterior background. No camera, DOM, network, or timer access.

const WIDTH = 1008;
const HEIGHT = 567;
const IMAGE_WIDTH = 1672;
const IMAGE_HEIGHT = 941;
const SCALE_X = WIDTH / IMAGE_WIDTH;
const SCALE_Y = HEIGHT / IMAGE_HEIGHT;

// Only the visible opening in the upper-right skyline is treated as sky.
const SKY = [
  [[1557, 0], [1672, 0], [1672, 116], [1640, 92], [1605, 112], [1577, 78]],
];

// Storefront glass, measured in exterior.png pixels. Openings and frames are
// deliberately excluded so afternoon light does not wash over the whole shop.
const GLASS = [
  [[249, 347], [480, 347], [480, 508], [249, 508]],
  [[501, 347], [690, 347], [690, 508], [501, 508]],
  [[710, 347], [914, 347], [914, 508], [710, 508]],
  [[249, 531], [480, 531], [480, 650], [249, 650]],
  [[501, 531], [690, 531], [690, 650], [501, 650]],
  [[710, 531], [914, 531], [914, 650], [710, 650]],
  [[977, 390], [1113, 390], [1113, 562], [977, 562]],
  [[1142, 390], [1333, 390], [1333, 562], [1142, 562]],
  [[977, 581], [1113, 581], [1113, 773], [977, 773]],
  [[1142, 581], [1333, 581], [1333, 773], [1142, 773]],
];

const GROUND = [
  [[0, 805], [1375, 798], [1490, 574], [1672, 566], [1672, 941], [0, 941]],
];

const REFLECTIONS = [
  {
    points: [[285, 806], [386, 806], [438, 941], [238, 941]],
    rgb: '255, 202, 119',
  },
  {
    points: [[585, 803], [704, 803], [751, 941], [548, 941]],
    rgb: '255, 218, 143',
  },
  {
    points: [[1000, 794], [1130, 787], [1187, 941], [964, 941]],
    rgb: '255, 190, 105',
  },
  {
    points: [[1240, 777], [1335, 744], [1414, 941], [1230, 941]],
    rgb: '190, 70, 70',
  },
];

// Twenty-four fixed drops: deterministic for a given elapsed time and below
// the thirty-drop budget. Speed is normalized per millisecond.
const RAIN_DROPS = [
  { x: 0.035, phase: 0.12, speed: 0.00017, length: 15, slant: 4 },
  { x: 0.083, phase: 0.68, speed: 0.00021, length: 19, slant: 5 },
  { x: 0.129, phase: 0.37, speed: 0.00015, length: 13, slant: 4 },
  { x: 0.176, phase: 0.91, speed: 0.00019, length: 18, slant: 5 },
  { x: 0.224, phase: 0.49, speed: 0.00016, length: 16, slant: 4 },
  { x: 0.271, phase: 0.04, speed: 0.00022, length: 20, slant: 6 },
  { x: 0.319, phase: 0.76, speed: 0.00018, length: 14, slant: 4 },
  { x: 0.366, phase: 0.28, speed: 0.00020, length: 18, slant: 5 },
  { x: 0.414, phase: 0.58, speed: 0.00014, length: 13, slant: 4 },
  { x: 0.462, phase: 0.96, speed: 0.00019, length: 17, slant: 5 },
  { x: 0.509, phase: 0.19, speed: 0.00017, length: 15, slant: 4 },
  { x: 0.556, phase: 0.72, speed: 0.00021, length: 20, slant: 6 },
  { x: 0.604, phase: 0.43, speed: 0.00016, length: 14, slant: 4 },
  { x: 0.651, phase: 0.84, speed: 0.00018, length: 18, slant: 5 },
  { x: 0.699, phase: 0.08, speed: 0.00022, length: 19, slant: 6 },
  { x: 0.747, phase: 0.54, speed: 0.00015, length: 13, slant: 4 },
  { x: 0.794, phase: 0.31, speed: 0.00020, length: 17, slant: 5 },
  { x: 0.842, phase: 0.88, speed: 0.00017, length: 16, slant: 4 },
  { x: 0.889, phase: 0.62, speed: 0.00021, length: 20, slant: 6 },
  { x: 0.937, phase: 0.24, speed: 0.00016, length: 14, slant: 4 },
  { x: 0.981, phase: 0.79, speed: 0.00019, length: 18, slant: 5 },
  { x: 0.153, phase: 0.16, speed: 0.00020, length: 12, slant: 4 },
  { x: 0.575, phase: 0.97, speed: 0.00015, length: 13, slant: 4 },
  { x: 0.912, phase: 0.46, speed: 0.00018, length: 15, slant: 5 },
];

function mapX(x) {
  return x * SCALE_X;
}

function mapY(y) {
  return y * SCALE_Y;
}

function trace(ctx, points) {
  ctx.moveTo(mapX(points[0][0]), mapY(points[0][1]));
  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(mapX(points[index][0]), mapY(points[index][1]));
  }
  ctx.closePath();
}

function traceRegions(ctx, regions) {
  ctx.beginPath();
  for (const region of regions) trace(ctx, region);
}

function fillRegions(ctx, regions, fillStyle) {
  traceRegions(ctx, regions);
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

function verticalGradient(stops, top = 0, bottom = IMAGE_HEIGHT) {
  return (ctx) => {
    const gradient = ctx.createLinearGradient(0, mapY(top), 0, mapY(bottom));
    for (const [offset, color] of stops) gradient.addColorStop(offset, color);
    return gradient;
  };
}

function drawAfternoon(ctx) {
  // Local warm light only: sky, glass and pavement never become a global tint.
  // Screen brightens the existing paint without replacing its underlying detail.
  ctx.globalCompositeOperation = 'screen';
  fillRegions(ctx, SKY, verticalGradient([
    [0, 'rgba(255, 231, 181, 0.22)'],
    [1, 'rgba(255, 211, 146, 0.04)'],
  ], 0, 180)(ctx));

  fillRegions(ctx, GLASS, verticalGradient([
    [0, 'rgba(255, 226, 166, 0.15)'],
    [0.55, 'rgba(255, 202, 126, 0.09)'],
    [1, 'rgba(255, 187, 105, 0.025)'],
  ], 340, 780)(ctx));

  fillRegions(ctx, GROUND, verticalGradient([
    [0, 'rgba(255, 220, 157, 0.04)'],
    [0.62, 'rgba(255, 215, 145, 0.12)'],
    [1, 'rgba(255, 198, 119, 0.07)'],
  ], 570, IMAGE_HEIGHT)(ctx));
}

function drawWetGround(ctx) {
  ctx.save();
  traceRegions(ctx, GROUND);
  ctx.clip();

  ctx.fillStyle = verticalGradient([
    [0, 'rgba(23, 48, 57, 0.12)'],
    [0.55, 'rgba(20, 43, 54, 0.24)'],
    [1, 'rgba(14, 34, 47, 0.34)'],
  ], 570, IMAGE_HEIGHT)(ctx);
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Warm broken reflections retain the shop's dusk palette under cool rain.
  for (const reflection of REFLECTIONS) {
    const gradient = ctx.createLinearGradient(0, mapY(780), 0, mapY(IMAGE_HEIGHT));
    gradient.addColorStop(0, `rgba(${reflection.rgb}, 0.22)`);
    gradient.addColorStop(0.45, `rgba(${reflection.rgb}, 0.11)`);
    gradient.addColorStop(1, `rgba(${reflection.rgb}, 0)`);
    fillRegions(ctx, [reflection.points], gradient);
  }

  ctx.beginPath();
  const glints = [
    [265, 857, 405, 855], [315, 895, 458, 892], [560, 845, 715, 843],
    [610, 910, 790, 906], [962, 850, 1148, 844], [1030, 902, 1210, 895],
    [1270, 831, 1405, 820], [1340, 889, 1510, 875], [1480, 755, 1615, 741],
  ];
  for (const [x1, y1, x2, y2] of glints) {
    ctx.moveTo(mapX(x1), mapY(y1));
    ctx.lineTo(mapX(x2), mapY(y2));
  }
  ctx.strokeStyle = 'rgba(255, 218, 154, 0.20)';
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

function wrap01(value) {
  const wrapped = value % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

function drawRain(ctx, elapsed) {
  // A restrained cool cast contrasts with, rather than replaces, warm interiors.
  ctx.fillStyle = 'rgba(15, 35, 49, 0.10)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  fillRegions(ctx, GLASS, verticalGradient([
    [0, 'rgba(20, 46, 64, 0.17)'],
    [1, 'rgba(28, 57, 68, 0.08)'],
  ], 340, 780)(ctx));
  drawWetGround(ctx);

  for (const [i,drop] of RAIN_DROPS.entries()) {
    ctx.beginPath();
    const progress = wrap01(drop.phase + elapsed * drop.speed);
    const x = drop.x * WIDTH;
    const y = -24 + progress * (HEIGHT + 48);
    ctx.moveTo(x, y);
    ctx.lineTo(x + drop.slant*.35, y + drop.length*(i%3===0?.6:.35));
    ctx.strokeStyle = `rgba(194, 220, 226, ${i%3===0?.23:.12})`;
    ctx.lineWidth = i%3===0?.65:.45;
    ctx.stroke();
  }
  // A few small ground ripples, clipped to pavement rather than furniture.
  ctx.save();traceRegions(ctx,GROUND);ctx.clip();
  for(let i=0;i<12;i++){
    const phase=wrap01(elapsed/1400+i*.173),x=(i*179+73)%WIDTH,y=490+(i*37)%74;
    ctx.beginPath();ctx.ellipse(x,y,1+phase*4,.4+phase*1.3,0,0,Math.PI*2);
    ctx.strokeStyle=`rgba(210,222,216,${(1-phase)*.18})`;ctx.lineWidth=.5;ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw the standalone exterior weather layer.
 * @param {CanvasRenderingContext2D} ctx context already in 1008 × 567 world space
 * @param {{variant?: 'dusk'|'afternoon'|'rain', elapsed?: number}} options
 * elapsed is milliseconds; rain positions are pure functions of that value.
 */
export function drawOutdoorWeather(ctx, { variant = 'dusk', elapsed = 0 } = {}) {
  if (!ctx || (variant !== 'afternoon' && variant !== 'rain')) {
    // Dusk and unknown variants leave the existing exterior completely intact.
    return;
  }

  const time = Number.isFinite(elapsed) ? elapsed : 0;
  ctx.save();
  try {
    if (variant === 'afternoon') drawAfternoon(ctx);
    else drawRain(ctx, time);
  } finally {
    ctx.restore();
  }
}
