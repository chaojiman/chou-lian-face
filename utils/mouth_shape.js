/**
 * 嘴巴生成 —— 移植自 Rockyzsu/ugly-avatar (src/utils/mouth_shape.js)
 * 三种嘴型：咧嘴大笑 / 歪嘴 / 椭圆厚唇，随机三选一。
 */

var faceShape = require('./face_shape.js');

function randomFromInterval(min, max) {
  return Math.random() * (max - min) + min;
}

function cubicBezier(P0, P1, P2, P3, t) {
  var mt = 1 - t;
  var x = mt * mt * mt * P0[0] + 3 * mt * mt * t * P1[0] + 3 * mt * t * t * P2[0] + t * t * t * P3[0];
  var y = mt * mt * mt * P0[1] + 3 * mt * mt * t * P1[1] + 3 * mt * t * t * P2[1] + t * t * t * P3[1];
  return [x, y];
}

/** 嘴型 0：夸张的 U 形大嘴 */
function generateMouthShape0(faceCountour, faceHeight, faceWidth) {
  var mouthRightY = randomFromInterval(faceHeight / 7, faceHeight / 3.5);
  var mouthLeftY = randomFromInterval(faceHeight / 7, faceHeight / 3.5);
  var mouthRightX = randomFromInterval(faceWidth / 10, faceWidth / 2);
  var mouthLeftX = -mouthRightX + randomFromInterval(-faceWidth / 20, faceWidth / 20);

  var mouthRight = [mouthRightX, mouthRightY];
  var mouthLeft = [mouthLeftX, mouthLeftY];

  var controlPoint0 = [randomFromInterval(0, mouthRightX), randomFromInterval(mouthLeftY + 5, faceHeight / 1.5)];
  var controlPoint1 = [randomFromInterval(mouthLeftX, 0), randomFromInterval(mouthLeftY + 5, faceHeight / 1.5)];

  var mouthPoints = [];
  var i;
  for (i = 0; i < 1; i += 0.01) {
    mouthPoints.push(cubicBezier(mouthLeft, controlPoint1, controlPoint0, mouthRight, i));
  }

  if (Math.random() > 0.5) {
    for (i = 0; i < 1; i += 0.01) {
      mouthPoints.push(cubicBezier(mouthRight, controlPoint0, controlPoint1, mouthLeft, i));
    }
  } else {
    var y_offset_portion = randomFromInterval(0, 0.8);
    for (i = 0; i < 100; i += 1) {
      mouthPoints.push([
        mouthPoints[99][0] * (1 - i / 100.0) + mouthPoints[0][0] * i / 100.0,
        (mouthPoints[99][1] * (1 - i / 100.0) + mouthPoints[0][1] * i / 100.0) * (1 - y_offset_portion) +
          mouthPoints[99 - i][1] * y_offset_portion
      ]);
    }
  }
  return mouthPoints;
}

/** 嘴型 1：小一号、被翻转拉伸过的歪嘴 */
function generateMouthShape1(faceCountour, faceHeight, faceWidth) {
  var mouthRightY = randomFromInterval(faceHeight / 7, faceHeight / 4);
  var mouthLeftY = randomFromInterval(faceHeight / 7, faceHeight / 4);
  var mouthRightX = randomFromInterval(faceWidth / 10, faceWidth / 2);
  var mouthLeftX = -mouthRightX + randomFromInterval(-faceWidth / 20, faceWidth / 20);

  var mouthRight = [mouthRightX, mouthRightY];
  var mouthLeft = [mouthLeftX, mouthLeftY];

  var controlPoint0 = [randomFromInterval(0, mouthRightX), randomFromInterval(mouthLeftY + 5, faceHeight / 1.5)];
  var controlPoint1 = [randomFromInterval(mouthLeftX, 0), randomFromInterval(mouthLeftY + 5, faceHeight / 1.5)];

  var mouthPoints = [];
  var i;
  for (i = 0; i < 1; i += 0.01) {
    mouthPoints.push(cubicBezier(mouthLeft, controlPoint1, controlPoint0, mouthRight, i));
  }

  var center = [(mouthRight[0] + mouthLeft[0]) / 2, mouthPoints[25][1] / 2 + mouthPoints[75][1] / 2];

  if (Math.random() > 0.5) {
    for (i = 0; i < 1; i += 0.01) {
      mouthPoints.push(cubicBezier(mouthRight, controlPoint0, controlPoint1, mouthLeft, i));
    }
  } else {
    var y_offset_portion = randomFromInterval(0, 0.8);
    for (i = 0; i < 100; i += 1) {
      mouthPoints.push([
        mouthPoints[99][0] * (1 - i / 100.0) + mouthPoints[0][0] * i / 100.0,
        (mouthPoints[99][1] * (1 - i / 100.0) + mouthPoints[0][1] * i / 100.0) * (1 - y_offset_portion) +
          mouthPoints[99 - i][1] * y_offset_portion
      ]);
    }
  }

  for (i = 0; i < mouthPoints.length; i++) {
    mouthPoints[i][0] -= center[0];
    mouthPoints[i][1] -= center[1];
    mouthPoints[i][1] = -mouthPoints[i][1];
    mouthPoints[i][0] = mouthPoints[i][0] * 0.6;
    mouthPoints[i][1] = mouthPoints[i][1] * 0.6;
    mouthPoints[i][0] += center[0];
    mouthPoints[i][1] += center[1] * 0.8;
  }
  return mouthPoints;
}

/** 嘴型 2：一个被旋转的蛋形厚唇（噘嘴） */
function generateMouthShape2(faceCountour, faceHeight, faceWidth) {
  var center = [
    randomFromInterval(-faceWidth / 8, faceWidth / 8),
    randomFromInterval(faceHeight / 4, faceHeight / 2.5)
  ];

  var mouthPoints = faceShape.getEggShapePoints(
    randomFromInterval(faceWidth / 10, faceWidth / 4),
    randomFromInterval(faceHeight / 20, faceHeight / 10),
    0.001,
    50
  );

  var rot = randomFromInterval(-Math.PI / 9.5, Math.PI / 9.5);
  var cos = Math.cos(rot);
  var sin = Math.sin(rot);
  for (var i = 0; i < mouthPoints.length; i++) {
    var x = mouthPoints[i][0];
    var y = mouthPoints[i][1];
    mouthPoints[i][0] = x * cos - y * sin + center[0];
    mouthPoints[i][1] = x * sin + y * cos + center[1];
  }
  return mouthPoints;
}

module.exports = {
  generateMouthShape0: generateMouthShape0,
  generateMouthShape1: generateMouthShape1,
  generateMouthShape2: generateMouthShape2
};
