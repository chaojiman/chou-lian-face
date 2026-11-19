/**
 * 眼睛生成 —— 移植自 Rockyzsu/ugly-avatar (src/utils/eye_shape.js)
 * 原理：上下眼睑各用一条三次贝塞尔曲线，控制点随机偏移产生"大小眼 / 下垂眼 / 死鱼眼"；
 *      再用一条从端点收敛到对侧控制点的辅助曲线做二次混合，制造诡异的眼形。
 */

function randomFromInterval(min, max) {
  return Math.random() * (max - min) + min;
}

function cubicBezier(P0, P1, P2, P3, t) {
  var mt = 1 - t;
  var x = mt * mt * mt * P0[0] + 3 * mt * mt * t * P1[0] + 3 * mt * t * t * P2[0] + t * t * t * P3[0];
  var y = mt * mt * mt * P0[1] + 3 * mt * mt * t * P1[1] + 3 * mt * t * t * P2[1] + t * t * t * P3[1];
  return [x, y];
}

function generateEyeParameters(width) {
  var height_upper = Math.random() * width / 1.2;
  var height_lower = Math.random() * width / 1.2;

  var P0_upper_randX = Math.random() * 0.4 - 0.2;
  var P3_upper_randX = Math.random() * 0.4 - 0.2;
  var P0_upper_randY = Math.random() * 0.4 - 0.2;
  var P3_upper_randY = Math.random() * 0.4 - 0.2;

  var offset_upper_left_randY = Math.random();
  var offset_upper_right_randY = Math.random();

  var P0_upper = [-width / 2 + P0_upper_randX * width / 16, P0_upper_randY * height_upper / 16];
  var P3_upper = [width / 2 + P3_upper_randX * width / 16, P3_upper_randY * height_upper / 16];
  var eye_true_width = P3_upper[0] - P0_upper[0];

  var offset_upper_left_x = randomFromInterval(-eye_true_width / 10.0, eye_true_width / 2.3);
  var offset_upper_right_x = randomFromInterval(-eye_true_width / 10.0, eye_true_width / 2.3);
  var offset_upper_left_y = offset_upper_left_randY * height_upper;
  var offset_upper_right_y = offset_upper_right_randY * height_upper;
  var offset_lower_left_x = randomFromInterval(offset_upper_left_x, eye_true_width / 2.1);
  var offset_lower_right_x = randomFromInterval(offset_upper_right_x, eye_true_width / 2.1);
  var offset_lower_left_y = randomFromInterval(-offset_upper_left_y + 5, height_lower);
  var offset_lower_right_y = randomFromInterval(-offset_upper_right_y + 5, height_lower);

  return {
    height_upper: height_upper,
    height_lower: height_lower,
    P0_upper_randX: P0_upper_randX,
    P3_upper_randX: P3_upper_randX,
    P0_upper_randY: P0_upper_randY,
    P3_upper_randY: P3_upper_randY,
    offset_upper_left_randY: offset_upper_left_randY,
    offset_upper_right_randY: offset_upper_right_randY,
    eye_true_width: eye_true_width,
    offset_upper_left_x: offset_upper_left_x,
    offset_upper_right_x: offset_upper_right_x,
    offset_upper_left_y: offset_upper_left_y,
    offset_upper_right_y: offset_upper_right_y,
    offset_lower_left_x: offset_lower_left_x,
    offset_lower_right_x: offset_lower_right_x,
    offset_lower_left_y: offset_lower_left_y,
    offset_lower_right_y: offset_lower_right_y,
    left_converge0: Math.random(),
    right_converge0: Math.random(),
    left_converge1: Math.random(),
    right_converge1: Math.random()
  };
}

function generateEyePoints(rands, width) {
  width = width || 50;

  var P0_upper = [-width / 2 + rands.P0_upper_randX * width / 16, rands.P0_upper_randY * rands.height_upper / 16];
  var P3_upper = [width / 2 + rands.P3_upper_randX * width / 16, rands.P3_upper_randY * rands.height_upper / 16];
  var P0_lower = P0_upper;
  var P3_lower = P3_upper;

  var P1_upper = [P0_upper[0] + rands.offset_upper_left_x, P0_upper[1] + rands.offset_upper_left_y];
  var P2_upper = [P3_upper[0] - rands.offset_upper_right_x, P3_upper[1] + rands.offset_upper_right_y];
  var P1_lower = [P0_lower[0] + rands.offset_lower_left_x, P0_lower[1] - rands.offset_lower_left_y];
  var P2_lower = [P3_lower[0] - rands.offset_lower_right_x, P3_lower[1] - rands.offset_lower_right_y];

  var i, t, weight;

  // 上眼睑
  var upper_eyelid_points = [];
  var upper_eyelid_points_left_control = [];
  var upper_eyelid_points_right_control = [];
  var upper_eyelid_left_control_point = [
    P0_upper[0] * (1 - rands.left_converge0) + P1_lower[0] * rands.left_converge0,
    P0_upper[1] * (1 - rands.left_converge0) + P1_lower[1] * rands.left_converge0
  ];
  var upper_eyelid_right_control_point = [
    P3_upper[0] * (1 - rands.right_converge0) + P2_lower[0] * rands.right_converge0,
    P3_upper[1] * (1 - rands.right_converge0) + P2_lower[1] * rands.right_converge0
  ];

  for (t = 0; t < 100; t++) {
    upper_eyelid_points.push(cubicBezier(P0_upper, P1_upper, P2_upper, P3_upper, t / 100));
    upper_eyelid_points_left_control.push(cubicBezier(upper_eyelid_left_control_point, P0_upper, P1_upper, P2_upper, t / 100));
    upper_eyelid_points_right_control.push(cubicBezier(P1_upper, P2_upper, P3_upper, upper_eyelid_right_control_point, t / 100));
  }
  for (i = 0; i < 75; i++) {
    weight = Math.pow((75.0 - i) / 75.0, 2);
    upper_eyelid_points[i] = [
      upper_eyelid_points[i][0] * (1 - weight) + upper_eyelid_points_left_control[i + 25][0] * weight,
      upper_eyelid_points[i][1] * (1 - weight) + upper_eyelid_points_left_control[i + 25][1] * weight
    ];
    upper_eyelid_points[i + 25] = [
      upper_eyelid_points[i + 25][0] * weight + upper_eyelid_points_right_control[i][0] * (1 - weight),
      upper_eyelid_points[i + 25][1] * weight + upper_eyelid_points_right_control[i][1] * (1 - weight)
    ];
  }

  // 下眼睑
  var lower_eyelid_points = [];
  var lower_eyelid_points_left_control = [];
  var lower_eyelid_points_right_control = [];
  var lower_eyelid_left_control_point = [
    P0_lower[0] * (1 - rands.left_converge0) + P1_upper[0] * rands.left_converge0,
    P0_lower[1] * (1 - rands.left_converge0) + P1_upper[1] * rands.left_converge0
  ];
  var lower_eyelid_right_control_point = [
    P3_lower[0] * (1 - rands.right_converge1) + P2_upper[0] * rands.right_converge1,
    P3_lower[1] * (1 - rands.right_converge1) + P2_upper[1] * rands.right_converge1
  ];

  for (t = 0; t < 100; t++) {
    lower_eyelid_points.push(cubicBezier(P0_lower, P1_lower, P2_lower, P3_lower, t / 100));
    lower_eyelid_points_left_control.push(cubicBezier(lower_eyelid_left_control_point, P0_lower, P1_lower, P2_lower, t / 100));
    lower_eyelid_points_right_control.push(cubicBezier(P1_lower, P2_lower, P3_lower, lower_eyelid_right_control_point, t / 100));
  }
  for (i = 0; i < 75; i++) {
    weight = Math.pow((75.0 - i) / 75.0, 2);
    lower_eyelid_points[i] = [
      lower_eyelid_points[i][0] * (1 - weight) + lower_eyelid_points_left_control[i + 25][0] * weight,
      lower_eyelid_points[i][1] * (1 - weight) + lower_eyelid_points_left_control[i + 25][1] * weight
    ];
    lower_eyelid_points[i + 25] = [
      lower_eyelid_points[i + 25][0] * weight + lower_eyelid_points_right_control[i][0] * (1 - weight),
      lower_eyelid_points[i + 25][1] * weight + lower_eyelid_points_right_control[i][1] * (1 - weight)
    ];
  }

  // canvas 与 svg 一样是 y 向下，这里翻转 y 让"上眼睑"真的在上面
  for (i = 0; i < 100; i++) {
    lower_eyelid_points[i][1] = -lower_eyelid_points[i][1];
    upper_eyelid_points[i][1] = -upper_eyelid_points[i][1];
  }

  var eyeCenter = [
    upper_eyelid_points[50][0] / 2.0 + lower_eyelid_points[50][0] / 2.0,
    upper_eyelid_points[50][1] / 2.0 + lower_eyelid_points[50][1] / 2.0
  ];
  for (i = 0; i < 100; i++) {
    lower_eyelid_points[i][0] -= eyeCenter[0];
    lower_eyelid_points[i][1] -= eyeCenter[1];
    upper_eyelid_points[i][0] -= eyeCenter[0];
    upper_eyelid_points[i][1] -= eyeCenter[1];
  }

  return { upper: upper_eyelid_points, lower: lower_eyelid_points, center: [[0, 0]] };
}

/**
 * 生成左右两只眼（右眼参数在左眼基础上做随机扰动，保证"不对称"）
 */
function generateBothEyes(width) {
  width = width || 50;
  var rands_left = generateEyeParameters(width);
  var rands_right = {};
  var key;
  for (key in rands_left) {
    rands_right[key] = typeof rands_left[key] === 'number'
      ? rands_left[key] + randomFromInterval(-rands_left[key] / 2.0, rands_left[key] / 2.0)
      : rands_left[key];
  }

  var left_eye = generateEyePoints(rands_left, width);
  var right_eye = generateEyePoints(rands_right, width);

  // 左眼整体镜像
  for (key in left_eye) {
    if (typeof left_eye[key] === 'object' && left_eye[key].length) {
      for (var i = 0; i < left_eye[key].length; i++) {
        if (left_eye[key][i] && typeof left_eye[key][i][0] === 'number') {
          left_eye[key][i][0] = -left_eye[key][i][0];
        }
      }
    }
  }
  return { left: left_eye, right: right_eye };
}

module.exports = {
  generateEyeParameters: generateEyeParameters,
  generateEyePoints: generateEyePoints,
  generateBothEyes: generateBothEyes
};
