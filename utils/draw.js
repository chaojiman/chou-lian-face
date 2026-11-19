/**
 * Canvas 2D 渲染器
 *
 * 原版用的是 SVG + feTurbulence/feDisplacementMap 滤镜做"毛边手绘感"。
 * 小程序不支持内联 SVG，所以这里做了两件事：
 *   1. 把 SVG 的 polyline / path / circle 全部翻译成 Canvas 2D 路径指令；
 *   2. 用"低频正弦抖动 (wobble)"替代 feDisplacementMap，再叠一道错位的第二遍描边，
 *      复现那种歪歪扭扭的手绘线条。
 *
 * 坐标系与 SVG 的 viewBox="-100 -100 200 200" 保持一致：
 * 世界坐标原点在画布中心，x 向右、y 向下，可视范围 -100 ~ 100。
 * 这样一来所有几何算法都能原样复用，不需要改任何数值。
 */

var faceShape = require('./face_shape.js');
var eyeShape = require('./eye_shape.js');
var hairLines = require('./hair_lines.js');
var mouthShape = require('./mouth_shape.js');

var FACE_SCALE = 1.8;
var MAX_HAIR_LINES = 300;

function rnd(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

function rgbCss(c) {
  return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')';
}

/** 无照片时的随机发色（取自原版配色表） */
var HAIR_COLORS = [
  'rgb(0, 0, 0)', 'rgb(44, 34, 43)', 'rgb(80, 68, 68)', 'rgb(167, 133, 106)',
  'rgb(220, 208, 186)', 'rgb(233, 236, 239)', 'rgb(165, 42, 42)', 'rgb(145, 85, 61)',
  'rgb(128, 128, 128)', 'rgb(185, 55, 55)', 'rgb(255, 192, 203)', 'rgb(255, 105, 180)',
  'rgb(230, 230, 250)', 'rgb(64, 224, 208)', 'rgb(0, 191, 255)', 'rgb(148, 0, 211)',
  'rgb(50, 205, 50)', 'rgb(255, 165, 0)', 'rgb(220, 20, 60)', 'rgb(192, 192, 192)'
];

/** 无照片时的随机背景色 */
var BG_COLORS = [
  'rgb(245, 245, 220)', 'rgb(176, 224, 230)', 'rgb(211, 211, 211)', 'rgb(152, 251, 152)',
  'rgb(255, 253, 208)', 'rgb(230, 230, 250)', 'rgb(188, 143, 143)', 'rgb(135, 206, 235)',
  'rgb(245, 255, 250)', 'rgb(245, 222, 179)', 'rgb(47, 79, 79)', 'rgb(72, 61, 139)',
  'rgb(60, 20, 20)', 'rgb(25, 25, 112)', 'rgb(139, 0, 0)', 'rgb(85, 107, 47)',
  'rgb(128, 0, 128)', 'rgb(0, 100, 0)', 'rgb(0, 0, 139)', 'rgb(105, 105, 105)'
];

/* =========================================================
 *  一、参数生成
 * ========================================================= */

/**
 * 生成一张脸的全部随机参数
 * @param {object|null} palette analyzeImageData 的结果，null 表示无照片（纯随机）
 */
function buildFace(palette) {
  var usePhoto = !!(palette && palette.ok);
  var p = { fromPhoto: usePhoto };

  /* --- 脸型 --- */
  var ratio = usePhoto ? clamp(palette.faceRatio || 1, 0.88, 1.14) : 1;
  var faceResult = faceShape.generateFaceCountourPoints(100, ratio);
  p.facePoints = faceResult.face;
  p.faceWidth = faceResult.width;
  p.faceHeight = faceResult.height;

  /* --- 眼睛 --- */
  var eyes = eyeShape.generateBothEyes(p.faceWidth / 2);
  var left = eyes.left;
  var right = eyes.right;

  var distanceBetweenEyes = rnd(p.faceWidth / 4.5, p.faceWidth / 4);
  var eyeHeightOffset = rnd(p.faceHeight / 8, p.faceHeight / 6);
  var leftEyeOffsetX = rnd(-p.faceWidth / 20, p.faceWidth / 10);
  var leftEyeOffsetY = rnd(-p.faceHeight / 50, p.faceHeight / 50);
  var rightEyeOffsetX = rnd(-p.faceWidth / 20, p.faceWidth / 10);
  var rightEyeOffsetY = rnd(-p.faceHeight / 50, p.faceHeight / 50);

  p.eyes = [
    {
      upper: left.upper,
      lower: left.lower,
      contour: left.upper.slice(10, 90).concat(left.lower.slice(10, 90).reverse()),
      tx: -(distanceBetweenEyes + leftEyeOffsetX),
      ty: -(eyeHeightOffset + leftEyeOffsetY),
      upperW: 4.0 / FACE_SCALE,
      lowerW: 4.0 / FACE_SCALE
    },
    {
      upper: right.upper,
      lower: right.lower,
      contour: right.upper.slice(10, 90).concat(right.lower.slice(10, 90).reverse()),
      tx: (distanceBetweenEyes + rightEyeOffsetX),
      ty: -(eyeHeightOffset + rightEyeOffsetY),
      upperW: 3.0 / FACE_SCALE,
      lowerW: 4.0 / FACE_SCALE
    }
  ];

  // 瞳孔位移：在上下眼睑之间做随机线性插值
  p.eyes.forEach(function (eye) {
    var ind0 = Math.floor(rnd(10, eye.upper.length - 10));
    var ind1 = Math.floor(rnd(10, eye.upper.length - 10));
    var lerp = rnd(0.2, 0.8);
    eye.pupilX = eye.upper[ind0][0] * lerp + eye.lower[ind1][0] * (1 - lerp);
    eye.pupilY = eye.upper[ind0][1] * lerp + eye.lower[ind1][1] * (1 - lerp);
  });

  /* --- 头发 --- */
  var counts = [];
  for (var i = 0; i < 4; i++) counts.push(Math.floor(rnd(0, 50)));

  var hairs = [];
  var pick = [
    Math.random() > 0.3,
    Math.random() > 0.3,
    Math.random() > 0.5,
    Math.random() > 0.5
  ];
  // 保证至少有一种发型，避免出现概率约 2.25% 的"光头"
  if (!pick[0] && !pick[1] && !pick[2] && !pick[3]) {
    pick[1] = true;
  }
  if (pick[0]) hairs = hairs.concat(hairLines.generateHairLines0(p.facePoints, counts[0] + 10));
  if (pick[1]) hairs = hairs.concat(hairLines.generateHairLines1(p.facePoints, counts[1] / 1.5 + 10));
  if (pick[2]) hairs = hairs.concat(hairLines.generateHairLines2(p.facePoints, counts[2] * 3 + 10));
  if (pick[3]) hairs = hairs.concat(hairLines.generateHairLines3(p.facePoints, counts[3] * 3 + 10));

  // 小程序端控制一下线条总量，保证低端机也丝滑
  if (hairs.length > MAX_HAIR_LINES) {
    hairs = hairs.slice(0, MAX_HAIR_LINES);
  }
  p.hairs = hairs;

  /* --- 鼻子 --- */
  p.noseType = Math.random() > 0.5 ? 0 : 1; // 0 = 点状鼻，1 = 线状鼻
  p.noseRightX = rnd(p.faceWidth / 18, p.faceWidth / 12);
  p.noseRightY = rnd(0, p.faceHeight / 5);
  p.noseLeftX = rnd(-p.faceWidth / 18, -p.faceWidth / 12);
  p.noseLeftY = p.noseRightY + rnd(-p.faceHeight / 30, p.faceHeight / 20);
  p.eyeHeightOffset = eyeHeightOffset;

  /* --- 嘴巴 --- */
  var choice = Math.floor(Math.random() * 3);
  if (choice === 0) p.mouthPoints = mouthShape.generateMouthShape0(p.facePoints, p.faceHeight, p.faceWidth);
  else if (choice === 1) p.mouthPoints = mouthShape.generateMouthShape1(p.facePoints, p.faceHeight, p.faceWidth);
  else p.mouthPoints = mouthShape.generateMouthShape2(p.facePoints, p.faceHeight, p.faceWidth);

  /* --- 颜色 --- */
  if (usePhoto) {
    p.skin = rgbCss(palette.skin);
    p.hair = rgbCss(palette.hair);
    p.bg = rgbCss(palette.bg);
    p.lip = rgbCss(palette.lip);
  } else {
    p.skin = '#ffc9a9';
    p.bg = BG_COLORS[Math.floor(Math.random() * BG_COLORS.length)];
    p.lip = 'rgb(215,127,140)';
    // 10% 概率来一头彩虹染发
    p.hair = Math.random() > 0.1
      ? HAIR_COLORS[Math.floor(Math.random() * 10)]
      : HAIR_COLORS[10 + Math.floor(Math.random() * 10)];
  }

  return p;
}

/* =========================================================
 *  二、手绘抖动
 * ========================================================= */

/**
 * 给折线加低频正弦扰动，模拟 feDisplacementMap 的毛边效果。
 * closed=true 时使用整数倍频率，保证闭合处不会裂开。
 */
function wobble(points, amp, closed) {
  if (!amp) return points;
  var n = points.length;
  var TWO_PI = Math.PI * 2;
  var f1x, f2x, f1y, f2y;

  if (closed && n > 12) {
    f1x = TWO_PI * 3 / n;
    f2x = TWO_PI * 8 / n;
    f1y = TWO_PI * 5 / n;
    f2y = TWO_PI * 11 / n;
  } else {
    f1x = rnd(0.04, 0.10); f2x = rnd(0.15, 0.35);
    f1y = rnd(0.04, 0.10); f2y = rnd(0.15, 0.35);
  }

  var a1 = Math.random() * TWO_PI, a2 = Math.random() * TWO_PI;
  var a3 = Math.random() * TWO_PI, a4 = Math.random() * TWO_PI;

  var out = new Array(n);
  for (var i = 0; i < n; i++) {
    out[i] = [
      points[i][0] + amp * (0.65 * Math.sin(i * f1x + a1) + 0.35 * Math.sin(i * f2x + a2)),
      points[i][1] + amp * (0.65 * Math.sin(i * f1y + a3) + 0.35 * Math.sin(i * f2y + a4))
    ];
  }
  return out;
}

function tracePath(ctx, points) {
  if (!points || points.length < 2) return false;
  ctx.moveTo(points[0][0], points[0][1]);
  for (var i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0], points[i][1]);
  }
  return true;
}

/* =========================================================
 *  三、绘制
 * ========================================================= */

/**
 * 把一张脸画到 canvas 上
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} p buildFace() 的结果
 * @param {number} cssW 画布 CSS 宽度
 * @param {number} cssH 画布 CSS 高度
 * @param {number} dpr 设备像素比
 */
function renderFace(ctx, p, cssW, cssH, dpr) {
  dpr = dpr || 1;
  var W = cssW * dpr;
  var H = cssH * dpr;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // 世界坐标 -> 设备像素：200 单位铺满画布的 94%，四周留白
  var s = (Math.min(W, H) / 200) * 0.94;
  ctx.setTransform(s, 0, 0, s, W / 2, H / 2);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.globalAlpha = 1;
  var INK = '#1a1a1a';

  /* 1. 背景 */
  ctx.fillStyle = p.bg;
  ctx.fillRect(-112, -112, 224, 224);

  /* 2. 脸 */
  ctx.beginPath();
  tracePath(ctx, wobble(p.facePoints, 0.85, true));
  ctx.closePath();
  ctx.fillStyle = p.skin;
  ctx.fill();

  ctx.strokeStyle = INK;
  ctx.lineWidth = 3.0 / FACE_SCALE;
  ctx.stroke();

  // 第二遍错位描边 -> 手绘味
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  tracePath(ctx, wobble(p.facePoints, 1.6, true));
  ctx.closePath();
  ctx.stroke();
  ctx.globalAlpha = 1;

  /* 3. 眼睛 */
  for (var e = 0; e < p.eyes.length; e++) {
    drawEye(ctx, p.eyes[e], INK);
  }

  /* 4. 头发 */
  ctx.strokeStyle = p.hair;
  ctx.lineWidth = 2;
  for (var h = 0; h < p.hairs.length; h++) {
    var line = p.hairs[h];
    if (!line || line.length < 2) continue;
    ctx.beginPath();
    tracePath(ctx, line);
    ctx.stroke();
  }

  /* 5. 鼻子 */
  ctx.strokeStyle = INK;
  if (p.noseType === 0) {
    ctx.lineWidth = 1.0;
    drawDotCluster(ctx, p.noseLeftX, p.noseLeftY);
    drawDotCluster(ctx, p.noseRightX, p.noseRightY);
  } else {
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.noseLeftX, p.noseLeftY);
    ctx.quadraticCurveTo(
      p.noseRightX,
      p.noseRightY * 1.5,
      (p.noseLeftX + p.noseRightX) / 2,
      -p.eyeHeightOffset * 0.2
    );
    ctx.stroke();
  }

  /* 6. 嘴巴 */
  ctx.beginPath();
  tracePath(ctx, wobble(p.mouthPoints, 0.35, false));
  ctx.closePath();
  ctx.fillStyle = p.lip;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function drawEye(ctx, eye, ink) {
  ctx.save();
  ctx.translate(eye.tx, eye.ty);

  // 眼白
  ctx.beginPath();
  tracePath(ctx, eye.contour);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // 上下眼睑
  ctx.strokeStyle = ink;
  ctx.lineWidth = eye.upperW;
  ctx.beginPath();
  tracePath(ctx, wobble(eye.upper, 0.22, false));
  ctx.stroke();

  ctx.lineWidth = eye.lowerW;
  ctx.beginPath();
  tracePath(ctx, wobble(eye.lower, 0.22, false));
  ctx.stroke();

  // 瞳孔：10 个散乱的小圆圈，被眼白轮廓裁剪
  ctx.save();
  ctx.beginPath();
  tracePath(ctx, eye.contour);
  ctx.closePath();
  ctx.clip();
  ctx.lineWidth = 1.0;
  for (var i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.arc(
      eye.pupilX + Math.random() * 5 - 2.5,
      eye.pupilY + Math.random() * 5 - 2.5,
      Math.random() * 2 + 3.0,
      0, Math.PI * 2
    );
    ctx.stroke();
  }
  ctx.restore();

  ctx.restore();
}

function drawDotCluster(ctx, cx, cy) {
  for (var i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.arc(
      cx + Math.random() * 4 - 2,
      cy + Math.random() * 4 - 2,
      Math.random() * 2 + 1.0,
      0, Math.PI * 2
    );
    ctx.stroke();
  }
}

module.exports = {
  buildFace: buildFace,
  renderFace: renderFace,
  rgbCss: rgbCss
};
