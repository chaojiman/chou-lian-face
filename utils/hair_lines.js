/**
 * 头发线条生成 —— 移植自 Rockyzsu/ugly-avatar (src/utils/hair_lines.js)
 * 原理：从脸部轮廓上随机取点，串成高维贝塞尔曲线（"头发丝"），四种生成器随机叠加，
 *      制造出杂乱、缠绕、油腻或像素级的发型。
 *
 * 性能优化：原实现在 t 循环内部反复算阶乘与二项式系数，
 *          单条曲线就要几十万次运算；这里改为"一次预计算 + 复用"。
 */

var faceShape = require('./face_shape.js');

var FACTORIAL_CACHE = [1];
(function buildFactorialCache() {
  var v = 1;
  for (var n = 1; n <= 200; n++) {
    v *= n;
    FACTORIAL_CACHE[n] = v;
  }
})();

function factorial(n) {
  if (n <= 1) return 1;
  if (n < FACTORIAL_CACHE.length) return FACTORIAL_CACHE[n];
  var v = FACTORIAL_CACHE[FACTORIAL_CACHE.length - 1];
  for (var i = FACTORIAL_CACHE.length; i <= n; i++) v *= i;
  return v;
}

function binomialCoefficient(n, k) {
  if (k < 0 || k > n) return 0;
  return factorial(n) / (factorial(k) * factorial(n - k));
}

/** 安全取模，避免负索引 */
function mod(i, len) {
  var r = i % len;
  return r < 0 ? r + len : r;
}

/** 预计算二项式系数后求整条贝塞尔曲线 */
function computeBezierCurve(controlPoints, numberOfPoints) {
  var n = controlPoints.length - 1;
  if (n < 1) return [[controlPoints[0].x, controlPoints[0].y]];

  var coeff = new Array(n + 1);
  var i;
  for (i = 0; i <= n; i++) coeff[i] = binomialCoefficient(n, i);

  var curve = new Array(numberOfPoints + 1);
  for (var s = 0; s <= numberOfPoints; s++) {
    var t = s / numberOfPoints;
    var mt = 1 - t;
    var x = 0, y = 0;
    for (i = 0; i <= n; i++) {
      var w = coeff[i] * Math.pow(mt, n - i) * Math.pow(t, i);
      x += w * controlPoints[i].x;
      y += w * controlPoints[i].y;
    }
    curve[s] = [x, y];
  }
  return curve;
}

function randomFromInterval(min, max) {
  return Math.random() * (max - min) + min;
}

/** 光滑缠绕型：两条轮廓曲线互补混合 */
function generateHairLines0(faceCountour, numHairLines) {
  numHairLines = numHairLines || 100;
  var src = faceCountour.slice(0, faceCountour.length - 2);
  var len = src.length;
  var results = [];
  var i, j;

  for (i = 0; i < numHairLines; i++) {
    var numHairPoints = 20 + Math.floor(randomFromInterval(-5, 5));

    var hair_line = [];
    var index_offset = Math.floor(randomFromInterval(30, 140));
    for (j = 0; j < numHairPoints; j++) {
      var p0 = src[mod(len - (j + index_offset), len)];
      hair_line.push({ x: p0[0], y: p0[1] });
    }
    var d0 = computeBezierCurve(hair_line, numHairPoints);

    hair_line = [];
    index_offset = Math.floor(randomFromInterval(30, 140));
    for (j = 0; j < numHairPoints; j++) {
      var p1 = src[mod(len - (-j + index_offset), len)];
      hair_line.push({ x: p1[0], y: p1[1] });
    }
    var d1 = computeBezierCurve(hair_line, numHairPoints);

    var d = new Array(numHairPoints);
    for (j = 0; j < numHairPoints; j++) {
      var w = Math.pow(j * (1 / numHairPoints), 2);
      d[j] = [
        d0[j][0] * w + d1[j][0] * (1 - w),
        d0[j][1] * w + d1[j][1] * (1 - w)
      ];
    }
    results.push(d);
  }
  return results;
}

/** 散射型：轮廓上随便取点串起来 */
function generateHairLines1(faceCountour, numHairLines) {
  numHairLines = numHairLines || 100;
  var src = faceCountour.slice(0, faceCountour.length - 2);
  var len = src.length;
  var results = [];
  var i, j;

  for (i = 0; i < numHairLines; i++) {
    var numHairPoints = 20 + Math.floor(randomFromInterval(-5, 5));
    var hair_line = [];
    var p = src[mod(len - Math.floor(randomFromInterval(20, 160)), len)];
    hair_line.push({ x: p[0], y: p[1] });

    for (j = 1; j < numHairPoints + 1; j++) {
      var q = src[mod(len - Math.floor(randomFromInterval(20, 160)), len)];
      hair_line.push({ x: q[0], y: q[1] });
    }
    results.push(computeBezierCurve(hair_line, numHairPoints));
  }
  return results;
}

/** 放射型：沿轮廓向上外扩，长度随机 */
function generateHairLines2(faceCountour, numHairLines) {
  numHairLines = numHairLines || 100;
  var src = faceCountour.slice(0, faceCountour.length - 2);
  var len = src.length;
  var results = [];
  var pickedIndices = [];
  var i, j;

  for (i = 0; i < numHairLines; i++) {
    pickedIndices.push(Math.floor(randomFromInterval(10, 180)));
  }
  pickedIndices.sort(function (a, b) { return a - b; });

  for (i = 0; i < numHairLines; i++) {
    var numHairPoints = 20 + Math.floor(randomFromInterval(-5, 5));
    var hair_line = [];
    var index_offset = pickedIndices[i];
    var lower = randomFromInterval(0.8, 1.4);
    var reverse = Math.random() > 0.5 ? 1 : -1;

    for (j = 0; j < numHairPoints; j++) {
      var powerscale = randomFromInterval(0.1, 3);
      var portion = (1 - Math.pow(j / numHairPoints, powerscale)) * (1 - lower) + lower;
      var pt = src[mod(len - (reverse * j + index_offset), len)];
      hair_line.push({ x: pt[0] * portion, y: pt[1] * portion });
    }

    var d = computeBezierCurve(hair_line, numHairPoints);
    if (Math.random() > 0.7) d.reverse();

    if (results.length === 0) {
      results.push(d);
      continue;
    }
    var prev = results[results.length - 1];
    var lastHairPoint = prev[prev.length - 1];
    var lastPointsDistance = Math.sqrt(
      Math.pow(d[0][0] - lastHairPoint[0], 2) + Math.pow(d[0][1] - lastHairPoint[1], 2)
    );
    if (Math.random() > 0.5 && lastPointsDistance < 100) {
      results[results.length - 1] = prev.concat(d);
    } else {
      results.push(d);
    }
  }
  return results;
}

/** 长条束状：只在 y 方向拉伸，形成垂发/长刘海 */
function generateHairLines3(faceCountour, numHairLines) {
  numHairLines = numHairLines || 100;
  var src = faceCountour.slice(0, faceCountour.length - 2);
  var len = src.length;
  var results = [];
  var pickedIndices = [];
  var i, j;

  for (i = 0; i < numHairLines; i++) {
    pickedIndices.push(Math.floor(randomFromInterval(10, 180)));
  }
  pickedIndices.sort(function (a, b) { return a - b; });

  var splitPoint = Math.floor(randomFromInterval(0, 200));

  for (i = 0; i < numHairLines; i++) {
    var numHairPoints = 30 + Math.floor(randomFromInterval(-8, 8));
    var hair_line = [];
    var index_offset = pickedIndices[i];
    var lower = randomFromInterval(1, 2.3);
    if (Math.random() > 0.9) lower = randomFromInterval(0, 1);
    var reverse = index_offset > splitPoint ? 1 : -1;

    for (j = 0; j < numHairPoints; j++) {
      var powerscale = randomFromInterval(0.1, 3);
      var portion = (1 - Math.pow(j / numHairPoints, powerscale)) * (1 - lower) + lower;
      var pt = src[mod(len - (reverse * j * 2 + index_offset), len)];
      hair_line.push({ x: pt[0] * portion, y: pt[1] });
    }
    results.push(computeBezierCurve(hair_line, numHairPoints));
  }
  return results;
}

module.exports = {
  computeBezierCurve: computeBezierCurve,
  generateHairLines0: generateHairLines0,
  generateHairLines1: generateHairLines1,
  generateHairLines2: generateHairLines2,
  generateHairLines3: generateHairLines3
};
