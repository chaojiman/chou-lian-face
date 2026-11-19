/**
 * 生成一个"精简版"预览 SVG，用于在对话里内联展示。
 * 通过整数化坐标 + 限制头发线条数，把体积从 128KB 压到 ~15KB。
 */
const path = require('path');
const fs = require('fs');
const draw = require(path.join(__dirname, '..', 'chou-lian-face', 'utils', 'draw.js'));

class CompactContext {
  constructor() {
    this.t = [1, 0, 0, 1, 0, 0];
    this.stack = [];
    this.paths = [];
    this.cur = null;
    this.out = [];
    this.clips = [];
    this.idc = 0;
    this.fillStyle = '#000'; this.strokeStyle = '#000';
    this.lineWidth = 1; this.lineJoin = 'round'; this.lineCap = 'round';
    this.globalAlpha = 1;
  }
  setTransform(a, b, c, d, e, f) { this.t = [a, b, c, d, e, f]; }
  translate(tx, ty) {
    const [a, b, c, d, e, f] = this.t;
    this.t = [a, b, c, d, a * tx + c * ty + e, b * tx + d * ty + f];
  }
  _apply(x, y) { const [a, b, c, d, e, f] = this.t; return [Math.round(a * x + c * y + e), Math.round(b * x + d * y + f)]; }
  _sf() { const [a, b, c, d] = this.t; return Math.sqrt(Math.abs(a * d - b * c)) || 1; }
  save() {
    this.stack.push({
      t: this.t.slice(), fillStyle: this.fillStyle, strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth, globalAlpha: this.globalAlpha, clips: this.clips.slice()
    });
  }
  restore() {
    const s = this.stack.pop();
    if (!s) return;
    this.t = s.t; this.fillStyle = s.fillStyle; this.strokeStyle = s.strokeStyle;
    this.lineWidth = s.lineWidth; this.globalAlpha = s.globalAlpha; this.clips = s.clips;
  }
  beginPath() { this.paths = []; this.cur = null; }
  moveTo(x, y) { this.cur = { pts: [[x, y]], closed: false }; this.paths.push(this.cur); }
  lineTo(x, y) { if (!this.cur) this.moveTo(x, y); else this.cur.pts.push([x, y]); }
  closePath() { if (this.cur) this.cur.closed = true; }
  quadraticCurveTo(cx, cy, x, y) {
    if (!this.cur) this.moveTo(x, y);
    const p0 = this.cur.pts[this.cur.pts.length - 1];
    for (let i = 1; i <= 12; i++) {
      const t = i / 12, mt = 1 - t;
      this.cur.pts.push([mt * mt * p0[0] + 2 * mt * t * cx + t * t * x, mt * mt * p0[1] + 2 * mt * t * cy + t * t * y]);
    }
  }
  // 圆形单独记成 <circle>，比用 30 段折线逼近省 10 倍体积
  arc(x, y, r) {
    const sub = { pts: [], closed: true, circle: [x, y, r] };
    this.paths.push(sub); this.cur = sub;
  }
  _d() {
    let d = '';
    for (const sub of this.paths) {
      if (sub.circle) continue;
      if (sub.pts.length < 2) continue;
      const p = sub.pts.map(([x, y]) => this._apply(x, y));
      d += 'M' + p.map(q => q[0] + ',' + q[1]).join('L');
      if (sub.closed) d += 'Z';
    }
    return d;
  }
  _circles() {
    const out = [];
    for (const sub of this.paths) {
      if (!sub.circle) continue;
      const [x, y, r] = sub.circle;
      const c = this._apply(x, y);
      out.push({ cx: c[0], cy: c[1], r: Math.max(1, Math.round(r * this._sf())) });
    }
    return out;
  }
  _clip() { return this.clips.length ? ' clip-path="url(#' + this.clips[this.clips.length - 1] + ')"' : ''; }
  fill() {
    const d = this._d();
    if (d) this.out.push('<path d="' + d + '" fill="' + this.fillStyle + '"' + this._clip() + '/>');
    for (const c of this._circles()) {
      this.out.push('<circle cx="' + c.cx + '" cy="' + c.cy + '" r="' + c.r + '" fill="' + this.fillStyle + '"' + this._clip() + '/>');
    }
  }
  stroke() {
    const w = Math.max(1, Math.round(this.lineWidth * this._sf()));
    const d = this._d();
    if (d) this.out.push('<path d="' + d + '" fill="none" stroke="' + this.strokeStyle + '" stroke-width="' + w +
      '" stroke-linejoin="round" stroke-linecap="round"' + this._clip() + '/>');
    for (const c of this._circles()) {
      this.out.push('<circle cx="' + c.cx + '" cy="' + c.cy + '" r="' + c.r + '" fill="none" stroke="' + this.strokeStyle +
        '" stroke-width="' + w + '"' + this._clip() + '/>');
    }
  }
  clip() {
    const id = 'c' + (this.idc++);
    this.out.push('<clipPath id="' + id + '"><path d="' + this._d() + '"/></clipPath>');
    this.clips.push(id);
  }
  clearRect() {}
  fillRect(x, y, w, h) {
    const p = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(q => this._apply(q[0], q[1]));
    this.out.push('<path d="M' + p.map(q => q[0] + ',' + q[1]).join('L') + 'Z" fill="' + this.fillStyle + '"/>');
  }
}

const SIZE = 680;
const PALETTES = [
  { ok: true, skin: [236, 205, 184], hair: [38, 33, 36], bg: [172, 200, 214], lip: [206, 126, 130], faceRatio: 1.02 },
  { ok: true, skin: [132, 92, 68], hair: [28, 22, 22], bg: [214, 148, 92], lip: [148, 76, 78], faceRatio: 1.12 },
  { ok: true, skin: [228, 190, 146], hair: [98, 66, 44], bg: [232, 226, 212], lip: [198, 112, 106], faceRatio: 1.08 }
];

/** 抽稀：每隔一个点取一个。眼睑/头发本来就是密集的平滑曲线，视觉上几乎无差别。 */
function decimate(pts, n) {
  if (!pts || pts.length < 20) return pts;
  const out = [];
  for (let i = 0; i < pts.length; i += n) out.push(pts[i]);
  if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return out;
}

const svgs = PALETTES.map((pal) => {
  const ctx = new CompactContext();
  const face = draw.buildFace(pal);

  // 精简体积：抽稀眼睑曲线 + 限制头发线条数
  face.eyes.forEach((e) => {
    e.upper = decimate(e.upper, 2);
    e.lower = decimate(e.lower, 2);
    e.contour = decimate(e.contour, 2);
  });
  if (face.hairs.length > 22) face.hairs = face.hairs.slice(0, 22);
  face.hairs = face.hairs.map((h) => decimate(h, 2));
  face.facePoints = decimate(face.facePoints, 2);
  face.mouthPoints = decimate(face.mouthPoints, 2);

  draw.renderFace(ctx, face, SIZE, SIZE, 1);
  const defs = ctx.out.filter(l => l.startsWith('<clipPath')).join('');
  const body = ctx.out.filter(l => !l.startsWith('<clipPath')).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + SIZE + ' ' + SIZE + '">' +
    '<defs>' + defs + '</defs>' + body + '</svg>';
});

fs.writeFileSync(path.join(__dirname, 'widget.svg'), svgs.join('\n'), 'utf8');
console.log('单张 ' + Math.round(svgs[0].length / 1024) + 'KB，三张共 ' + Math.round(svgs.join('').length / 1024) + 'KB');
