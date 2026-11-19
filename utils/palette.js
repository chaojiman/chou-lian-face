/**
 * 照片配色分析（纯前端，无网络请求）
 *
 * 把用户上传的照片缩绘到 canvas，读取像素，用一套启发式规则提取：
 *   1. 肤色 skin   —— 画面中央偏下区域的"暖色低饱和"像素
 *   2. 发色 hair   —— 顶部区域的暗色像素，且必须与肤色拉开距离
 *   3. 背景 bg     —— 画面四周环形区域的颜色
 *   4. 唇色 lip    —— 由肤色推导出的玫瑰色
 *   5. faceRatio   —— 用提取到的肤色反查全图，取包围盒长宽比
 *
 * 三个关键设计（都是踩过坑之后加的）：
 *
 *  a) 位置先验 + 两遍扫描。
 *     棕发和浅肤色的 RGB 空间高度重叠，单靠颜色无法区分。
 *     所以第一遍只在中下部找肤色，第二遍拿肤色当参照去找头发。
 *
 *  b) 用「颜色直方图取众数」而不是「取平均」。
 *     背景角落里混进来的几个像素就能把平均值拉偏，
 *     而众数代表的是画面中占据主导的那个颜色，天然抗污染。
 *
 *  c) 背景/肤色的对比度兜底。
 *     如果提取出的背景和肤色太接近，脸会融进背景里看不见，需要强制拉开。
 *
 * 全部为纯 JS 计算，不依赖任何后端服务与第三方库。
 */

var DEFAULT_PALETTE = {
  skin: [255, 201, 169],
  hair: [44, 34, 43],
  bg: [245, 245, 220],
  lip: [215, 127, 140],
  faceRatio: 1,
  ok: false
};

/* =========================================================
 *  基础色彩工具
 * ========================================================= */

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function mix(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
}

function scaleColor(c, factor) {
  return [clamp(c[0] * factor, 0, 255), clamp(c[1] * factor, 0, 255), clamp(c[2] * factor, 0, 255)];
}

function colorDistance(a, b) {
  return Math.sqrt(
    Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2)
  );
}

function rgbCss(c) {
  return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')';
}

/* =========================================================
 *  颜色直方图（16 级/通道）
 * ========================================================= */

var LEVELS = 16;
var BUCKETS = LEVELS * LEVELS * LEVELS;

function bucketKey(r, g, b) {
  return (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4);
}

function bucketCenter(key) {
  return [
    Math.floor(key / 256) * 16 + 8,
    (Math.floor(key / 16) % 16) * 16 + 8,
    (key % 16) * 16 + 8
  ];
}

function addToHist(hist, r, g, b) {
  var key = bucketKey(r, g, b);
  var bkt = hist[key];
  if (!bkt) { bkt = { n: 0, r: 0, g: 0, b: 0 }; hist[key] = bkt; }
  bkt.n++; bkt.r += r; bkt.g += g; bkt.b += b;
}

function accValue(acc) {
  return acc.n ? [acc.r / acc.n, acc.g / acc.n, acc.b / acc.n] : null;
}

var MERGE_TOLERANCE = 22; // 16 宽的桶 -> 允许合并 3x3 邻域
var SEED_COUNT = 16;

/**
 * 取"颜色簇众数"。
 *
 * 不能只看单个桶的计数：同一块纯色会因为量化和噪点被切成好几个桶
 * （例如白色背景可能同时落在 8 个相邻桶里），单桶最大值的那个颜色
 * 很可能是另一块面积更小但颜色更集中的区域（比如头发）。
 *
 * 所以这里先取计数最高的若干桶作为"种子"，再分别计算每颗种子
 * 合并邻域后的总规模，规模最大的那个簇才是真正的主色。
 */
function dominantColor(hist) {
  var keys = [];
  var k;
  for (k in hist) keys.push(parseInt(k, 10));
  if (!keys.length) return null;

  keys.sort(function (a, b) { return hist[b].n - hist[a].n; });
  var seeds = keys.slice(0, SEED_COUNT);

  var bestN = -1, bestAcc = null;
  for (var s = 0; s < seeds.length; s++) {
    var center = bucketCenter(seeds[s]);
    var acc = { n: 0, r: 0, g: 0, b: 0 };
    for (var i = 0; i < keys.length; i++) {
      var bkt = hist[keys[i]];
      var c = bucketCenter(keys[i]);
      if (Math.abs(c[0] - center[0]) <= MERGE_TOLERANCE &&
          Math.abs(c[1] - center[1]) <= MERGE_TOLERANCE &&
          Math.abs(c[2] - center[2]) <= MERGE_TOLERANCE) {
        acc.n += bkt.n; acc.r += bkt.r; acc.g += bkt.g; acc.b += bkt.b;
      }
    }
    if (acc.n > bestN) { bestN = acc.n; bestAcc = acc; }
  }
  return bestAcc && bestAcc.n ? accValue(bestAcc) : null;
}

/* =========================================================
 *  肤色判定
 * ========================================================= */

/**
 * 启发式肤色检测，对深/浅肤色都宽容。
 * 阈值经过调校：白墙（高亮低彩）、蓝天（冷色序）、红衣（高饱和）都会被排除。
 */
function isSkinish(r, g, b) {
  var mx = Math.max(r, g, b);
  var mn = Math.min(r, g, b);
  if (mx < 36) return false;                    // 太黑
  if (mx - mn < 8) return false;                // 灰阶（白墙 / 灰底 / 阴影）
  if ((mx - mn) / mx > 0.62) return false;      // 高饱和（红衣 / 荧光色）
  if (!(r >= g && g >= b)) return false;        // 必须是暖色序 R>=G>=B
  if (r - b < 18) return false;                 // 暖偏不够（冷白、青灰、白墙）
  if (mn > 212 && (mx - mn) < 32) return false; // 又亮又寡淡 -> 墙壁 / 纸
  if (r - g > 0.42 * r + 6) return false;       // 红得过分（红色物体）
  if (r > 250 && g > 244) return false;         // 过曝
  return true;
}

/* =========================================================
 *  主分析函数
 * ========================================================= */

/**
 * @param {Uint8ClampedArray} data RGBA 像素
 * @param {number} w 采样宽度（像素）
 * @param {number} h 采样高度（像素）
 * @returns {object} 调色板
 */
function analyzeImageData(data, w, h) {
  var step = Math.max(2, Math.round(Math.max(w, h) / 320));

  var borderL = w * 0.09, borderR = w * 0.91;
  var borderT = h * 0.09, borderB = h * 0.91;

  var bgHist = {};
  var skinHist = {};
  var centerAcc = { n: 0, r: 0, g: 0, b: 0 };
  var allAcc = { n: 0, r: 0, g: 0, b: 0 };

  var x, y, i, r, g, b, cx, cy;

  /* ============ 第一遍：背景 + 肤色 ============ */
  for (y = 0; y < h; y += step) {
    cy = y / h;
    for (x = 0; x < w; x += step) {
      i = (y * w + x) * 4;
      if (data[i + 3] < 128) continue;

      r = data[i]; g = data[i + 1]; b = data[i + 2];
      allAcc.n++; allAcc.r += r; allAcc.g += g; allAcc.b += b;

      // 背景：四周环形区域
      if (x < borderL || x > borderR || y < borderT || y > borderB) {
        addToHist(bgHist, r, g, b);
      }

      cx = x / w;

      // 中央偏下区域（避开额头与头发）
      if (cx > 0.22 && cx < 0.78 && cy > 0.30 && cy < 0.92) {
        centerAcc.n++; centerAcc.r += r; centerAcc.g += g; centerAcc.b += b;
        if (isSkinish(r, g, b)) addToHist(skinHist, r, g, b);
      }
    }
  }

  if (!allAcc.n) return mergeWithDefault({}, false);

  var overall = [allAcc.r / allAcc.n, allAcc.g / allAcc.n, allAcc.b / allAcc.n];

  /* --- 背景色 --- */
  var bg = dominantColor(bgHist);
  if (!bg) bg = scaleColor(overall, 1.05);
  if (luminance(bg[0], bg[1], bg[2]) < 46) bg = scaleColor(bg, 1.55); // 太暗就提亮

  /* --- 肤色 --- */
  var skinCount = 0;
  for (var sk in skinHist) skinCount += skinHist[sk].n;

  var skin;
  var skinDominant = skinCount >= 30 && skinCount / allAcc.n > 0.015
    ? dominantColor(skinHist)
    : null;

  if (skinDominant) {
    skin = mix(skinDominant, DEFAULT_PALETTE.skin, 0.15); // 轻微收敛，抑制偏色
  } else if (centerAcc.n) {
    skin = mix(DEFAULT_PALETTE.skin, accValue(centerAcc), 0.5); // 可能不是人像
  } else {
    skin = DEFAULT_PALETTE.skin.slice();
  }
  var skinLuma = luminance(skin[0], skin[1], skin[2]);
  if (skinLuma < 60) skin = scaleColor(skin, 1.45);        // 别黑到看不见线稿
  else if (skinLuma > 242) skin = scaleColor(skin, 0.93);  // 别白到没有层次

  /* ============ 第二遍：头发 + 肤色包围盒 ============ */
  var hairHist = {};
  var hitN = 0;
  var hitMinX = w, hitMaxX = -1, hitMinY = h, hitMaxY = -1;
  var scanL = borderL, scanR = borderR, scanT = borderT, scanB = borderB;

  for (y = 0; y < h; y += step) {
    cy = y / h;
    var isTop = cy < 0.36;
    for (x = 0; x < w; x += step) {
      i = (y * w + x) * 4;
      if (data[i + 3] < 128) continue;

      r = data[i]; g = data[i + 1]; b = data[i + 2];

      // 头发：顶部区域的暗色像素，且必须与肤色拉开距离
      if (isTop && luminance(r, g, b) < 118) {
        var d = Math.sqrt(
          Math.pow(r - skin[0], 2) + Math.pow(g - skin[1], 2) + Math.pow(b - skin[2], 2)
        );
        if (d > 45) addToHist(hairHist, r, g, b);
      }

      // 肤色包围盒：拿提取到的肤色全图反查
      if (x > scanL && x < scanR && y > scanT && y < scanB) {
        var dh = Math.sqrt(
          Math.pow(r - skin[0], 2) + Math.pow(g - skin[1], 2) + Math.pow(b - skin[2], 2)
        );
        if (dh < 50) {
          hitN++;
          if (x < hitMinX) hitMinX = x;
          if (x > hitMaxX) hitMaxX = x;
          if (y < hitMinY) hitMinY = y;
          if (y > hitMaxY) hitMaxY = y;
        }
      }
    }
  }

  /* --- 发色 --- */
  var hairCount = 0;
  for (var hk in hairHist) hairCount += hairHist[hk].n;

  var hair = hairCount >= 24 ? dominantColor(hairHist) : null;
  if (hair && luminance(hair[0], hair[1], hair[2]) > 150) {
    hair = mix(hair, [40, 34, 38], 0.6); // 头发别太亮，否则压不住黑色线稿
  }
  if (!hair) hair = mix(scaleColor(skin, 0.25), [40, 34, 38], 0.4);

  /* --- 背景 / 肤色对比度兜底 --- */
  if (colorDistance(bg, skin) < 70) {
    var lumaSkin = luminance(skin[0], skin[1], skin[2]);
    var candidateDark = scaleColor(bg, 0.45);
    var candidateLight = scaleColor(bg, 1.35);
    var dDark = colorDistance(candidateDark, skin);
    var dLight = colorDistance(candidateLight, skin);
    // 脸浅 -> 背景压暗；脸深 -> 背景提亮
    bg = lumaSkin > 128
      ? (dDark >= dLight ? candidateDark : candidateLight)
      : (dLight >= dDark ? candidateLight : candidateDark);
    if (colorDistance(bg, skin) < 70) bg = mix(bg, [30, 32, 40], 0.45);
  }

  /* --- 唇色 --- */
  var lip = mix(scaleColor(skin, 0.72), [198, 74, 96], 0.5);

  /* --- 脸型比例 --- */
  var faceRatio = 1;
  if (hitN >= 60 && hitMaxX > hitMinX && hitMaxY > hitMinY) {
    faceRatio = clamp((hitMaxY - hitMinY + step) / (hitMaxX - hitMinX + step), 0.88, 1.14);
  }

  return mergeWithDefault({
    skin: skin,
    hair: hair,
    bg: bg,
    lip: lip,
    faceRatio: faceRatio
  }, true);
}

function mergeWithDefault(partial, ok) {
  return {
    skin: partial.skin || DEFAULT_PALETTE.skin,
    hair: partial.hair || DEFAULT_PALETTE.hair,
    bg: partial.bg || DEFAULT_PALETTE.bg,
    lip: partial.lip || DEFAULT_PALETTE.lip,
    faceRatio: partial.faceRatio || 1,
    ok: !!ok
  };
}

module.exports = {
  DEFAULT_PALETTE: DEFAULT_PALETTE,
  analyzeImageData: analyzeImageData,
  isSkinish: isSkinish,
  rgbCss: rgbCss,
  mix: mix,
  luminance: luminance,
  colorDistance: colorDistance,
  clamp: clamp
};
