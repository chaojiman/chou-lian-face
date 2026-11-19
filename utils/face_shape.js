/**
 * 脸型生成 —— 移植自 Rockyzsu/ugly-avatar (src/utils/face_shape.js)
 * 原理：用隐式曲线 x^2/a^2 * (1+ky) + y^2/b^2 = 1 生成两条"蛋形"曲线，
 *      再以 1/4 相位差做线性混合，得到一张畸变的、无法预测的脸。
 *
 * 本版本新增 faceRatio 参数：根据上传照片的人脸长宽比拉伸纵向尺寸，
 * 让生成结果在"整体气质"上更贴近原图。
 */

function randomFromInterval(min, max) {
  return Math.random() * (max - min) + min;
}

/**
 * 生成一条歪歪扭扭的蛋形闭合曲线
 * @param {number} a x 半轴
 * @param {number} b y 半轴
 * @param {number} k 不对称系数
 * @param {number} segment_points 每段采样点数（总点数 = 4 * segment_points）
 */
function getEggShapePoints(a, b, k, segment_points) {
  var result = [];
  var i, degree, y, x;

  // 第一象限：x 正，y 正
  for (i = 0; i < segment_points; i++) {
    degree = (Math.PI / 2 / segment_points) * i +
      randomFromInterval(-Math.PI / 1.1 / segment_points, Math.PI / 1.1 / segment_points);
    y = Math.sin(degree) * b;
    x = Math.sqrt(((1 - (y * y) / (b * b)) / (1 + k * y)) * a * a) +
      randomFromInterval(-a / 200.0, a / 200.0);
    result.push([x, y]);
  }
  // 第二象限：x 负，y 正
  for (i = segment_points; i > 0; i--) {
    degree = (Math.PI / 2 / segment_points) * i +
      randomFromInterval(-Math.PI / 1.1 / segment_points, Math.PI / 1.1 / segment_points);
    y = Math.sin(degree) * b;
    x = -Math.sqrt(((1 - (y * y) / (b * b)) / (1 + k * y)) * a * a) +
      randomFromInterval(-a / 200.0, a / 200.0);
    result.push([x, y]);
  }
  // 第三象限：x 负，y 负
  for (i = 0; i < segment_points; i++) {
    degree = (Math.PI / 2 / segment_points) * i +
      randomFromInterval(-Math.PI / 1.1 / segment_points, Math.PI / 1.1 / segment_points);
    y = -Math.sin(degree) * b;
    x = -Math.sqrt(((1 - (y * y) / (b * b)) / (1 + k * y)) * a * a) +
      randomFromInterval(-a / 200.0, a / 200.0);
    result.push([x, y]);
  }
  // 第四象限：x 正，y 负
  for (i = segment_points; i > 0; i--) {
    degree = (Math.PI / 2 / segment_points) * i +
      randomFromInterval(-Math.PI / 1.1 / segment_points, Math.PI / 1.1 / segment_points);
    y = -Math.sin(degree) * b;
    x = Math.sqrt(((1 - (y * y) / (b * b)) / (1 + k * y)) * a * a) +
      randomFromInterval(-a / 200.0, a / 200.0);
    result.push([x, y]);
  }
  return result;
}

/**
 * 生成脸部轮廓多边形
 * @param {number} numPoints 每条蛋形曲线的采样段数（默认 100 -> 400 个点）
 * @param {number} faceRatio 纵向拉伸比（来自照片人脸长宽比），1 表示不拉伸
 * @returns {{face: Array, width: number, height: number, center: number[]}}
 */
function generateFaceCountourPoints(numPoints, faceRatio) {
  numPoints = numPoints || 100;
  var ratio = faceRatio || 1;
  if (ratio < 0.7) ratio = 0.7;
  if (ratio > 1.5) ratio = 1.5;

  var faceSizeX0 = randomFromInterval(50, 100);
  var faceSizeY0 = randomFromInterval(70, 100) * ratio;

  var faceSizeY1 = randomFromInterval(50, 80) * ratio;
  var faceSizeX1 = randomFromInterval(70, 100);

  var faceK0 = randomFromInterval(0.001, 0.005) * (Math.random() > 0.5 ? 1 : -1);
  var faceK1 = randomFromInterval(0.001, 0.005) * (Math.random() > 0.5 ? 1 : -1);

  var face0TranslateX = randomFromInterval(-5, 5);
  var face0TranslateY = randomFromInterval(-15, 15);
  var face1TranslateY = randomFromInterval(-5, 5);
  var face1TranslateX = randomFromInterval(-5, 25);

  var results0 = getEggShapePoints(faceSizeX0, faceSizeY0, faceK0, numPoints);
  var results1 = getEggShapePoints(faceSizeX1, faceSizeY1, faceK1, numPoints);

  var i;
  for (i = 0; i < results0.length; i++) {
    results0[i][0] += face0TranslateX;
    results0[i][1] += face0TranslateY;
    results1[i][0] += face1TranslateX;
    results1[i][1] += face1TranslateY;
  }

  var results = [];
  var center = [0, 0];
  var quarter = results0.length / 4;

  for (i = 0; i < results0.length; i++) {
    var j = (i + quarter) % results0.length;
    results.push([
      results0[i][0] * 0.5 + results1[j][1] * 0.5,
      results0[i][1] * 0.5 - results1[j][0] * 0.5
    ]);
    center[0] += results[i][0];
    center[1] += results[i][1];
  }
  center[0] /= results.length;
  center[1] /= results.length;

  // 居中
  for (i = 0; i < results.length; i++) {
    results[i][0] -= center[0];
    results[i][1] -= center[1];
  }

  var width = results[0][0] - results[results.length / 2][0];
  var height = results[results.length / 4][1] - results[(results.length * 3) / 4][1];

  // 首尾闭合
  results.push(results[0]);
  results.push(results[1]);

  return { face: results, width: width, height: height, center: [0, 0] };
}

module.exports = {
  randomFromInterval: randomFromInterval,
  getEggShapePoints: getEggShapePoints,
  generateFaceCountourPoints: generateFaceCountourPoints
};
