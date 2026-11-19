/**
 * 生成一张 3x2 的效果预览图（9 张脸太密，用 6 张）
 * 全部使用"照片配色"模式，模拟用户上传照片后的效果。
 */
const path = require('path');
const fs = require('fs');
const draw = require(path.join(__dirname, '..', 'chou-lian-face', 'utils', 'draw.js'));

class RecorderContext {
  constructor() {
    this.t = [1, 0, 0, 1, 0, 0];
    this.stack = [];
    this.paths = [];
    this.cur = null;
    this.out = [];
    this.clips = [];
    this.idc = 0;
    this.fillStyle = '#000'; this.strokeStyle = '#000';
    this.lineWidth = 1; this.lineJoin = 'miter'; this.lineCap = 'butt';
    this.globalAlpha = 1;
  }
  setTransform(a, b, c, d, e, f) { this.t = [a, b, c, d, e, f]; }
  translate(tx, ty) {
    const [a, b, c, d, e, f] = this.t;
    this.t = [a, b, c, d, a * tx + c * ty + e, b * tx + d * ty + f];
  }
  _apply(x, y) { const [a, b, c, d, e, f] = this.t; return [a * x + c * y + e, b * x + d * y + f]; }
  _sf() { const [a, b, c, d] = this.t; return Math.sqrt(Math.abs(a * d - b * c)) || 1; }
  save() {
    this.stack.push({
      t: this.t.slice(), fillStyle: this.fillStyle, strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth, lineJoin: this.lineJoin, lineCap: this.lineCap,
      globalAlpha: this.globalAlpha, clips: this.clips.slice()
    });
  }
  restore() {
    const s = this.stack.pop();
    if (!s) return;
    this.t = s.t; this.fillStyle = s.fillStyle; this.strokeStyle = s.strokeStyle;
    this.lineWidth = s.lineWidth; this.lineJoin = s.lineJoin; this.lineCap = s.lineCap;
    this.globalAlpha = s.globalAlpha; this.clips = s.clips;
  }
  beginPath() { this.paths = []; this.cur = null; }
  moveTo(x, y) { this.cur = { pts: [[x, y]], closed: false }; this.paths.push(this.cur); }
  lineTo(x, y) { if (!this.cur) this.moveTo(x, y); else this.cur.pts.push([x, y]); }
  closePath() { if (this.cur) this.cur.closed = true; }
  quadraticCurveTo(cx, cy, x, y) {
    if (!this.cur) this.moveTo(x, y);
    const p0 = this.cur.pts[this.cur.pts.length - 1];
    for (let i = 1; i <= 14; i++) {
      const t = i / 14, mt = 1 - t;
      this.cur.pts.push([
        mt * mt * p0[0] + 2 * mt * t * cx + t * t * x,
        mt * mt * p0[1] + 2 * mt * t * cy + t * t * y
      ]);
    }
  }
  arc(x, y, r, a0, a1) {
    const seg = 40;
    const sub = { pts: [], closed: true };
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (a1 - a0) * (i / seg);
      sub.pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
    this.paths.push(sub); this.cur = sub;
  }
  _d() {
    let d = '';
    for (const sub of this.paths) {
      if (sub.pts.length < 2) continue;
      const p = sub.pts.map(([x, y]) => this._apply(x, y));
      d += 'M' + p.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join('L');
      if (sub.closed) d += 'Z';
    }
    return d;
  }
  _clip() { return this.clips.length ? ' clip-path="url(#' + this.clips[this.clips.length - 1] + ')"' : ''; }
  fill() {
    const d = this._d(); if (!d) return;
    this.out.push('<path d="' + d + '" fill="' + this.fillStyle + '" opacity="' + this.globalAlpha.toFixed(2) + '"' + this._clip() + '/>');
  }
  stroke() {
    const d = this._d(); if (!d) return;
    this.out.push('<path d="' + d + '" fill="none" stroke="' + this.strokeStyle + '" stroke-width="' +
      (this.lineWidth * this._sf()).toFixed(2) + '" stroke-linejoin="' + this.lineJoin +
      '" stroke-linecap="' + this.lineCap + '" opacity="' + this.globalAlpha.toFixed(2) + '"' + this._clip() + '/>');
  }
  clip() {
    const id = 'c' + (this.idc++);
    this.out.push('<clipPath id="' + id + '"><path d="' + this._d() + '"/></clipPath>');
    this.clips.push(id);
  }
  clearRect() {}
  fillRect(x, y, w, h) {
    const p = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(q => this._apply(q[0], q[1]));
    this.out.push('<path d="M' + p.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join('L') + 'Z" fill="' + this.fillStyle + '"/>');
  }
}

const SIZE = 300;
const PALETTES = [
  { name: '冷白皮 / 黑发 / 天蓝', ok: true, skin: [236, 205, 184], hair: [38, 33, 36], bg: [172, 200, 214], lip: [206, 126, 130], faceRatio: 1.02 },
  { name: '暖黄皮 / 棕发 / 米白', ok: true, skin: [228, 190, 146], hair: [98, 66, 44], bg: [232, 226, 212], lip: [198, 112, 106], faceRatio: 1.08 },
  { name: '小麦色 / 黑发 / 深灰', ok: true, skin: [198, 154, 112], hair: [34, 28, 28], bg: [86, 92, 100], lip: [180, 100, 96], faceRatio: 1.00 },
  { name: '深肤色 / 卷发 / 暖橙', ok: true, skin: [132, 92, 68], hair: [28, 22, 22], bg: [214, 148, 92], lip: [148, 76, 78], faceRatio: 1.12 },
  { name: '白皙 / 挑染 / 薄荷', ok: true, skin: [242, 216, 198], hair: [122, 98, 86], bg: [168, 214, 190], lip: [212, 138, 142], faceRatio: 0.96 },
  { name: '暖调 / 灰发 / 雾霾蓝', ok: true, skin: [220, 176, 142], hair: [116, 116, 120], bg: [126, 152, 178], lip: [196, 110, 110], faceRatio: 1.06 }
];

const cells = PALETTES.map((pal) => {
  const ctx = new RecorderContext();
  const face = draw.buildFace(pal);
  draw.renderFace(ctx, face, SIZE, SIZE, 1);
  const defs = ctx.out.filter(l => l.startsWith('<clipPath')).join('');
  const body = ctx.out.filter(l => !l.startsWith('<clipPath')).join('');
  return {
    name: pal.name,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">` +
      `<defs>${defs}</defs><rect width="${SIZE}" height="${SIZE}" fill="#fff"/>${body}</svg>`,
    swatch: '#' + [pal.skin, pal.hair, pal.bg].map(c =>
      c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')).join(',#')
  };
});

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}
body{margin:0;padding:28px;background:#f7f4ee;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#14110f}
h1{font-size:22px;margin:0 0 4px;letter-spacing:2px}
p.sub{margin:0 0 22px;font-size:13px;color:#8a8175}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.card{background:#fff;border:2px solid #14110f;border-radius:14px;overflow:hidden;box-shadow:5px 5px 0 #14110f}
.card svg{display:block;width:100%;height:auto}
.meta{padding:10px 12px;border-top:2px solid #14110f;background:#fdfcfa}
.nm{font-size:12.5px;font-weight:700}
.dots{display:flex;gap:5px;margin-top:7px}
.dot{width:14px;height:14px;border-radius:50%;border:1.5px solid rgba(20,17,15,.25)}
</style></head><body>
<h1>抽象丑脸 · 效果预览</h1>
<p class="sub">上传照片后，小程序会提取「肤色 / 发色 / 背景色 / 脸型比例」四项参数驱动生成 —— 下面是 6 组不同照片配色的生成结果</p>
<div class="grid">
${cells.map(c => `<div class="card">${c.svg}<div class="meta"><div class="nm">${c.name}</div><div class="dots">${
  c.swatch.split(',').map(s => `<div class="dot" style="background:${s}"></div>`).join('')
}</div></div></div>`).join('')}
</div></body></html>`;

fs.writeFileSync(path.join(__dirname, 'grid.html'), html, 'utf8');
console.log('已生成 tools/grid.html');
