// 돌봄놀이터 온(ON) 공통 놀이 엔진
// - 카메라 + MediaPipe Pose (몸 인식) / 화면 변화량(움직임 양)
// - 카메라 없이 연습: 키보드·마우스로 움직이는 가상 몸
// - 시험용: window.__game.sim.pose / sim.energy 로 가상 자세를 직접 넣을 수 있음
//
// 좌표 단위 u: 카메라 화면 높이 = 1. 가로는 0 ~ ASPECT(=4/3). 거울처럼 좌우를 뒤집어 둠
// (화면 왼쪽에 보이는 것이 아이의 왼쪽 몸).
// 기준 몸 크기: T = 어깨 중점~골반 중점 거리, W = 어깨 너비 (시작할 때 2초 가만히 서서 잼)

// 몸 인식 프로그램(MediaPipe 0.10.14)과 모델은 사이트 안(vendor/mediapipe)에 넣어 둠 — 외부 서버가 막혀도 동작
const MP_URL = new URL('../vendor/mediapipe', import.meta.url).href;
const MODEL = new URL('../vendor/mediapipe/pose_landmarker_lite.task', import.meta.url).href;
export const ASPECT = 4 / 3;
const ART = new URL('./art/', import.meta.url).href;

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
// 선분 ab 와 점 p 의 거리
export function segDist(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy;
  const t = l2 ? clamp(((p.x - a.x) * vx + (p.y - a.y) * vy) / l2, 0, 1) : 0;
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (a, q) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

// 팔다리 방향 → 각도(도). 0 = 아래, 90 = 몸 바깥쪽 수평, 180 = 위. side: 'L' | 'R'
export function limbAngle(from, to, side) {
  const dx = (to.x - from.x) * (side === 'L' ? -1 : 1), dy = to.y - from.y;
  return Math.atan2(dx, dy) * 180 / Math.PI;
}
function fromAngle(p, len, deg, side) {
  const r = deg * Math.PI / 180;
  return { x: p.x + (side === 'L' ? -1 : 1) * Math.sin(r) * len, y: p.y + Math.cos(r) * len };
}

// 각도 정의로 몸(33개 점) 만들기 — 연습 모드와 인간 테트리스 구멍 모양에 같이 씀
// def: { la1, la2, ra1, ra2 (팔: 위팔·아래팔 각도), ll, rl (다리 각도), squat 0~1, raise: 'L'|'R'|null, jump(u), cx, hipY }
export function buildBody(def = {}) {
  const d = Object.assign({ la1: 14, la2: 8, ra1: 14, ra2: 8, ll: 4, rl: 4, squat: 0, raise: null, jump: 0, cx: ASPECT / 2, hipY: 0.6, scale: 1 }, def);
  const s = d.scale, T = 0.2 * s, SHW = 0.13 * s, HIPW = 0.085 * s;
  const UA = 0.1 * s, FA = 0.095 * s, TH = 0.14 * s, SH = 0.14 * s;
  const ground = d.hipY + (TH + SH) * 0.98;
  const hipY = d.hipY + d.squat * 0.11 * s - d.jump;
  const shY = hipY - T * (1 - d.squat * 0.12);
  const cx = d.cx;
  const P = new Array(33);
  const shL = { x: cx - SHW / 2, y: shY }, shR = { x: cx + SHW / 2, y: shY };
  const hipL = { x: cx - HIPW / 2, y: hipY }, hipR = { x: cx + HIPW / 2, y: hipY };
  const elL = fromAngle(shL, UA, d.la1, 'L'), wrL = fromAngle(elL, FA, d.la2, 'L');
  const elR = fromAngle(shR, UA, d.ra1, 'R'), wrR = fromAngle(elR, FA, d.ra2, 'R');
  const leg = (hip, ang, side) => {
    const raised = d.raise === side;
    if (raised) {
      const knee = { x: hip.x + (side === 'L' ? -0.01 : 0.01) * s, y: hip.y + TH * 0.25 };
      return [knee, { x: knee.x, y: knee.y + SH * 0.85 }];
    }
    if (d.squat > 0.05) {
      const out = (side === 'L' ? -1 : 1) * d.squat * 0.06 * s;
      const ankle = { x: hip.x + out * 0.6 + (side === 'L' ? -1 : 1) * Math.sin(ang * Math.PI / 180) * (TH + SH) * 0.9, y: ground - d.jump };
      const knee = { x: (hip.x + ankle.x) / 2 + out, y: (hip.y + ankle.y) / 2 - d.squat * 0.01 };
      return [knee, ankle];
    }
    const knee = fromAngle(hip, TH, ang, side), ankle = fromAngle(knee, SH, ang, side);
    return [knee, ankle];
  };
  const [knL, anL] = leg(hipL, d.ll, 'L'), [knR, anR] = leg(hipR, d.rl, 'R');
  const nose = { x: cx, y: shY - 0.085 * s };
  const set = (i, p) => { P[i] = { x: p.x, y: p.y, v: 0.99 }; };
  set(0, nose); for (let i = 1; i <= 10; i++) set(i, { x: nose.x + (i <= 4 ? -0.01 : 0.01) * (i % 5), y: nose.y - 0.01 + (i > 8 ? 0.03 : 0) });
  set(11, shL); set(12, shR); set(13, elL); set(14, elR); set(15, wrL); set(16, wrR);
  [17, 19, 21].forEach(i => set(i, wrL)); [18, 20, 22].forEach(i => set(i, wrR));
  set(23, hipL); set(24, hipR); set(25, knL); set(26, knR); set(27, anL); set(28, anR);
  set(29, anL); set(31, { x: anL.x, y: anL.y + 0.01 }); set(30, anR); set(32, { x: anR.x, y: anR.y + 0.01 });
  return P;
}

// ─────────── 그림 캐릭터: 몸 점 33개를 따라 움직이는 아이 (매뉴얼 그림체 색) ───────────
const PCBASE = { line: '#7A5442', skin: '#FBDCC6', skinShade: '#F3C9AE', shirt: '#7CC4F2', shirtShade: '#62B0E4', shorts: '#C5C9CF', sock: '#FFFFFF', shoe: '#3E6FD0', hair: '#5A3A26' };
export const SHIRT2 = { shirt: '#F59AA0', shirtShade: '#E9808A' };   // 두 번째 친구 옷 색
const PSTBASE = { size: null, roll: 0 };        // 캐릭터 크기·머리 기울기 (부드럽게)
export function puppetHeadRadius(W) { return W * 0.8; }   // 머리 그림 반지름 ≈ 어깨너비×0.8 (테트리스 구멍과 맞춤)
export function drawPuppet(ctx, P, map, opt = {}) {
  const PC = opt.colors ? { ...PCBASE, ...opt.colors } : PCBASE;
  const PST = opt.state || PSTBASE;
  const S = (i) => map(P[i]);
  const ok = (i) => P[i] && Number.isFinite(P[i].x) && Number.isFinite(P[i].y) && (P[i].v ?? 1) >= 0.5;
  const sL = S(11), sR = S(12), hL = S(23), hR = S(24);
  // 크기: 지금 어깨 너비를 쓰되, 기준 너비의 0.75~1.3배로 제한하고 부드럽게 (옆으로 돌아도 갑자기 작아지지 않게)
  let Wd = Math.max(8, Math.hypot(sR.x - sL.x, sR.y - sL.y));
  if (opt.refW) Wd = Math.max(opt.refW * 0.75, Math.min(opt.refW * 1.3, Wd));
  PST.size = PST.size == null ? Wd : PST.size + (Wd - PST.size) * 0.25; Wd = PST.size;
  const lw = Math.max(1.5, Wd * 0.03);
  const lerp = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
  const away = (a, b, k) => ({ x: a.x + (a.x - b.x) * k, y: a.y + (a.y - b.y) * k });
  const tex = paperTexture(ctx);
  // 칠하기: 바탕색 → 종이 질감 → 색연필 테두리
  const paint = (fill, outline = true) => {
    ctx.fillStyle = fill; ctx.fill();
    if (tex) { ctx.fillStyle = tex; ctx.fill(); }
    if (outline) { ctx.strokeStyle = PC.line; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); }
  };
  // 팔다리: 마디마다 굵기가 다른 부드러운 관 모양 (관절은 둥글게 이어짐)
  const limb = (pts, ws) => {
    const n = pts.length, Lp = [], Rp = [], ang = [];
    for (let i = 0; i < n; i++) {
      let nx = 0, ny = 0;
      for (const [a, b] of [[i - 1, i], [i, i + 1]]) {
        if (a < 0 || b >= n) continue;
        const dx = pts[b].x - pts[a].x, dy = pts[b].y - pts[a].y, l = Math.hypot(dx, dy) || 1;
        nx += -dy / l; ny += dx / l;
      }
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      Lp.push({ x: pts[i].x + nx * ws[i] / 2, y: pts[i].y + ny * ws[i] / 2 });
      Rp.push({ x: pts[i].x - nx * ws[i] / 2, y: pts[i].y - ny * ws[i] / 2 });
      ang.push(Math.atan2(ny, nx));
    }
    ctx.beginPath(); ctx.moveTo(Lp[0].x, Lp[0].y);
    if (n === 3) ctx.quadraticCurveTo(Lp[1].x, Lp[1].y, Lp[2].x, Lp[2].y); else ctx.lineTo(Lp[n - 1].x, Lp[n - 1].y);
    ctx.arc(pts[n - 1].x, pts[n - 1].y, ws[n - 1] / 2, ang[n - 1], ang[n - 1] + Math.PI, true);      // 끝(손목·발목 쪽)은 둥글게
    if (n === 3) ctx.quadraticCurveTo(Rp[1].x, Rp[1].y, Rp[0].x, Rp[0].y); else ctx.lineTo(Rp[0].x, Rp[0].y);
    ctx.arc(pts[0].x, pts[0].y, ws[0] / 2, ang[0] + Math.PI, ang[0], true);                        // 시작(어깨·엉덩이 쪽)도 둥글게
    ctx.closePath();
  };
  const oval = (c, rx, ry, rot) => { ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, rot, 0, Math.PI * 2); };

  // 바닥 그림자 (두 발목이 보일 때만)
  const aL = S(27), aR = S(28);
  if (ok(27) && ok(28)) { ctx.fillStyle = 'rgba(70,90,60,.16)'; oval({ x: (aL.x + aR.x) / 2, y: Math.max(aL.y, aR.y) + Wd * 0.14 }, Wd * 1.05, Wd * 0.17, 0); ctx.fill(); }

  // 다리 (살 → 양말 → 신발) — 보이는 마디까지만
  const legs = [[23, 25, 27, 31, hL, hR], [24, 26, 28, 32, hR, hL]];
  for (const [hi, ki, ai, fi, h, other] of legs) {
    if (!ok(ki)) continue;
    const top = away(h, other, 0.05), k = S(ki), a = S(ai);
    if (ok(ai)) {
      limb([top, k, a], [Wd * 0.44, Wd * 0.34, Wd * 0.27]); paint(PC.skin);
      limb([lerp(k, a, 0.6), a], [Wd * 0.3, Wd * 0.29]); paint(PC.sock);
      const f = ok(fi) ? S(fi) : { x: a.x + (a.x < (hL.x + hR.x) / 2 ? -1 : 1) * Wd * 0.2, y: a.y + Wd * 0.05 };
      const dir = Math.atan2(f.y - a.y, f.x - a.x), side = Math.cos(dir) < 0 ? -1 : 1;
      const toe = { x: a.x + side * Wd * 0.12, y: a.y + Wd * 0.1 };
      ctx.beginPath(); ctx.ellipse(toe.x, toe.y, Wd * 0.27, Wd * 0.14, side * 0.12, 0, Math.PI * 2); paint(PC.shoe);
      ctx.beginPath(); ctx.moveTo(toe.x - Wd * 0.24, toe.y + Wd * 0.07); ctx.quadraticCurveTo(toe.x, toe.y + Wd * 0.14, toe.x + Wd * 0.24, toe.y + Wd * 0.07);
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = lw * 0.9; ctx.stroke();                   // 밑창 선
    } else { limb([top, k], [Wd * 0.44, Wd * 0.34]); paint(PC.skin); }
  }
  // 반바지: 허리 띠 + 양쪽 바짓가랑이 (한 덩어리처럼 보이게 테두리 먼저, 색 나중)
  const shortsParts = [];
  for (const [hi, ki, , , h, other] of legs) if (ok(ki)) shortsParts.push([away(h, other, 0.04), lerp(h, S(ki), 0.4)]);
  const waistL = away(hL, hR, 0.2), waistR = away(hR, hL, 0.2);
  const pelvis = () => { ctx.beginPath(); ctx.moveTo(waistL.x, waistL.y - Wd * 0.14); ctx.lineTo(waistR.x, waistR.y - Wd * 0.14);
    ctx.quadraticCurveTo(waistR.x + Wd * 0.03, waistR.y + Wd * 0.12, waistR.x - Wd * 0.04, waistR.y + Wd * 0.26);
    ctx.lineTo(waistL.x + Wd * 0.04, waistL.y + Wd * 0.26); ctx.quadraticCurveTo(waistL.x - Wd * 0.03, waistL.y + Wd * 0.12, waistL.x, waistL.y - Wd * 0.14); ctx.closePath(); };
  ctx.strokeStyle = PC.line; ctx.lineWidth = lw * 3;
  for (const [a, b] of shortsParts) { limb([a, b], [Wd * 0.5, Wd * 0.46]); ctx.stroke(); }
  pelvis(); ctx.stroke();
  for (const [a, b] of shortsParts) { limb([a, b], [Wd * 0.5, Wd * 0.46]); paint(PC.shorts, false); }
  pelvis(); paint(PC.shorts, false);

  // 목
  const neckB = lerp(sL, sR, 0.5);
  const up = { x: (sL.y - sR.y), y: -(sR.x - sL.x) }, ul = Math.hypot(up.x, up.y) || 1;   // 어깨선에 수직인 위쪽
  const head = ok(0) ? S(0) : { x: neckB.x + up.x / ul * Wd * 0.75, y: neckB.y + up.y / ul * Wd * 0.75 };
  limb([neckB, lerp(neckB, head, 0.5)], [Wd * 0.3, Wd * 0.28]); paint(PC.skin);

  // 몸통: 비스듬한 어깨선 → 겨드랑이 → 살짝 들어간 허리 → 둥근 밑단 (티셔츠 모양)
  const ux = up.x / ul, uy = up.y / ul;                                      // 위쪽 방향
  const outL = { x: (sL.x - sR.x) / Wd, y: (sL.y - sR.y) / Wd }, outR = { x: -outL.x, y: -outL.y };
  const shoulder = (s, o) => ({ x: s.x + o.x * Wd * 0.06 - ux * Wd * 0.07, y: s.y + o.y * Wd * 0.06 - uy * Wd * 0.07 });   // 비스듬히 내려간 어깨
  const neckSide = (o) => ({ x: neckB.x + o.x * Wd * 0.2 + ux * Wd * 0.06, y: neckB.y + o.y * Wd * 0.2 + uy * Wd * 0.06 });
  const armpit = (s, h, o) => { const p = lerp(s, h, 0.3); return { x: p.x + o.x * Wd * 0.02, y: p.y + o.y * Wd * 0.02 }; };
  const hem = (h, other) => { const p = away(h, other, 0.3); return { x: p.x, y: p.y + Wd * 0.04 }; };
  const nL = neckSide(outL), nR = neckSide(outR), shL = shoulder(sL, outL), shR = shoulder(sR, outR);
  const apL = armpit(sL, hL, outL), apR = armpit(sR, hR, outR), hmL = hem(hL, hR), hmR = hem(hR, hL);
  const hemMid = { x: (hmL.x + hmR.x) / 2 - ux * Wd * 0.06, y: (hmL.y + hmR.y) / 2 - uy * Wd * 0.06 };
  const torso = () => {
    ctx.beginPath(); ctx.moveTo(nL.x, nL.y);
    ctx.quadraticCurveTo((nL.x + shL.x) / 2 + ux * Wd * 0.03, (nL.y + shL.y) / 2 + uy * Wd * 0.03, shL.x, shL.y);
    ctx.quadraticCurveTo(shL.x + outL.x * Wd * 0.05, shL.y + outL.y * Wd * 0.05 - uy * Wd * 0.1, apL.x, apL.y);
    ctx.quadraticCurveTo(apL.x - outL.x * Wd * 0.05, (apL.y + hmL.y) / 2, hmL.x, hmL.y);
    ctx.quadraticCurveTo(hemMid.x, hemMid.y, hmR.x, hmR.y);
    ctx.quadraticCurveTo(apR.x - outR.x * Wd * 0.05, (apR.y + hmR.y) / 2, apR.x, apR.y);
    ctx.quadraticCurveTo(shR.x + outR.x * Wd * 0.05, shR.y + outR.y * Wd * 0.05 - uy * Wd * 0.1, shR.x, shR.y);
    ctx.quadraticCurveTo((nR.x + shR.x) / 2 + ux * Wd * 0.03, (nR.y + shR.y) / 2 + uy * Wd * 0.03, nR.x, nR.y);
    ctx.quadraticCurveTo(neckB.x - ux * Wd * 0.12, neckB.y - uy * Wd * 0.12, nL.x, nL.y);              // 둥근 목둘레
    ctx.closePath();
  };
  // 소매: 몸통 어깨선(어깨~어깨 바로 아래 옆선)에 붙어서 위팔 절반까지 내려오는 티셔츠 소매
  const sleeves = [];
  for (const [si, ei, sh, out, apFull] of [[11, 13, shL, outL, apL], [12, 14, shR, outR, apR]]) {
    if (!ok(ei)) continue;
    const s = S(si), e = S(ei), root = { x: s.x - out.x * Wd * 0.02, y: s.y - out.y * Wd * 0.02 }, end = lerp(root, e, 0.46);
    const ap = lerp(sh, apFull, Math.min(1, Wd * 0.38 / (Math.hypot(apFull.x - sh.x, apFull.y - sh.y) || 1)));
    const dx = e.x - root.x, dy = e.y - root.y, dl = Math.hypot(dx, dy) || 1, px = -dy / dl * Wd * 0.18, py = dx / dl * Wd * 0.18;
    let E1 = { x: end.x + px, y: end.y + py }, E2 = { x: end.x - px, y: end.y - py };
    if (Math.hypot(E1.x - sh.x, E1.y - sh.y) > Math.hypot(E2.x - sh.x, E2.y - sh.y)) [E1, E2] = [E2, E1];   // 어깨 쪽 끝과 짝
    const cuff = { x: end.x + dx / dl * Wd * 0.05, y: end.y + dy / dl * Wd * 0.05 };
    sleeves.push({ si, path: (close) => { ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(E1.x, E1.y); ctx.quadraticCurveTo(cuff.x, cuff.y, E2.x, E2.y); ctx.lineTo(ap.x, ap.y); if (close) ctx.closePath(); } });
  }
  // 몸통+소매를 한 장의 티셔츠처럼: 테두리를 먼저 굵게 그리고 색을 나중에 덮어 안쪽 이음선을 없앰
  ctx.strokeStyle = PC.line; ctx.lineWidth = lw * 2.2; ctx.lineJoin = 'round';
  torso(); ctx.stroke(); for (const sv of sleeves) { sv.path(true); ctx.stroke(); }
  torso(); paint(PC.shirt, false);
  torso(); { const g = ctx.createLinearGradient(apL.x, apL.y, apR.x, apR.y); g.addColorStop(0, 'rgba(40,70,110,.12)'); g.addColorStop(0.45, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,.08)'); ctx.fillStyle = g; ctx.fill(); }
  for (const sv of sleeves) { sv.path(true); paint(PC.shirt, false); }
  ctx.strokeStyle = PC.shirtShade; ctx.lineWidth = lw * 1.3;                 // 목둘레 안쪽 선
  ctx.beginPath(); ctx.moveTo(nL.x, nL.y); ctx.quadraticCurveTo(neckB.x - ux * Wd * 0.04, neckB.y - uy * Wd * 0.04, nR.x, nR.y); ctx.stroke();

  // 머리 (그림). 두 귀가 잘 보이고 충분히 떨어져 있을 때만 기울기를 바꾸고, 부드럽게
  const im = opt.imgs && (opt.imgs['head_' + (opt.face || 'happy')] || opt.imgs.head_happy);
  const eL = S(7), eR = S(8);
  if (ok(7) && ok(8) && Math.hypot(eR.x - eL.x, eR.y - eL.y) > Wd * 0.25) {
    const r = Math.max(-0.4, Math.min(0.4, Math.atan2(eR.y - eL.y, eR.x - eL.x)));
    PST.roll += (r - PST.roll) * 0.2;
  } else PST.roll *= 0.9;
  const hw = puppetHeadRadius(Wd) * 2, hc = { x: head.x, y: head.y - Wd * 0.1 };     // 매뉴얼 그림처럼 머리를 크게
  if (im) {
    const hh = hw * im.height / im.width;
    ctx.save(); ctx.translate(hc.x, hc.y); ctx.rotate(PST.roll); ctx.drawImage(im, -hw / 2, -hh * 0.55, hw, hh); ctx.restore();
  } else {
    ctx.beginPath(); ctx.arc(hc.x, hc.y, hw * 0.42, 0, 7); paint(PC.skin);
    ctx.fillStyle = PC.hair; ctx.beginPath(); ctx.arc(hc.x, hc.y - hw * 0.05, hw * 0.44, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
  }

  // 팔: 살(어깨→팔꿈치→손목, 점점 가늘게) → 반팔 소매 → 손. 머리보다 나중에 그려 얼굴 앞의 손이 보이게
  for (const [si, ei, wi, sh, out] of [[11, 13, 15, shL, outL], [12, 14, 16, shR, outR]]) {
    const s = S(si), root = { x: s.x - out.x * Wd * 0.02, y: s.y - out.y * Wd * 0.02 };
    if (!ok(ei)) { limb([sh, lerp(sh, { x: sh.x + out.x * Wd, y: sh.y + out.y * Wd + Wd * 0.5 }, 0.25)], [Wd * 0.42, Wd * 0.38]); paint(PC.shirt); continue; }
    const e = S(ei), w = S(wi), armTop = lerp(root, e, 0.32);       // 살색은 소매 안쪽에서 시작 (어깨 위로 삐져나오지 않게)
    limb(ok(wi) ? [armTop, e, w] : [armTop, e], ok(wi) ? [Wd * 0.29, Wd * 0.25, Wd * 0.21] : [Wd * 0.29, Wd * 0.25]); paint(PC.skin);
    // 소매를 팔 위에 다시 덮음 (몸통에 붙는 쪽은 선 없이)
    const sv = sleeves.find(v => v.si === si);
    if (sv) { sv.path(true); paint(PC.shirt, false); sv.path(false); ctx.strokeStyle = PC.line; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); }
    if (opt.hands !== false && ok(wi)) {
      const d = Math.atan2(w.y - e.y, w.x - e.x), hand = away(w, e, 0.16);
      ctx.beginPath(); ctx.ellipse(hand.x, hand.y, Wd * 0.17, Wd * 0.14, d, 0, Math.PI * 2); paint(PC.skin);       // 주먹 쥔 손
      const th = { x: hand.x + Math.cos(d - 1.3) * Wd * 0.12, y: hand.y + Math.sin(d - 1.3) * Wd * 0.12 };
      ctx.beginPath(); ctx.ellipse(th.x, th.y, Wd * 0.07, Wd * 0.05, d, 0, Math.PI * 2); paint(PC.skin);           // 엄지
    }
  }
}
// 색연필 종이 질감 (한 번만 만들어 둠)
let TEXP = null;
function paperTexture(ctx) {
  if (TEXP !== null) return TEXP;
  try {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    for (let i = 0; i < 1600; i++) {
      g.fillStyle = Math.random() < 0.55 ? 'rgba(255,255,255,.10)' : 'rgba(120,80,50,.06)';
      g.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 1.6, 1 + Math.random() * 1.6);
    }
    TEXP = ctx.createPattern(c, 'repeat');
  } catch { TEXP = false; }
  return TEXP;
}

// ───────────────────────── 엔진 ─────────────────────────
export function start(cfg) {
  const levels = cfg.levels;
  const params = new URLSearchParams(location.search);
  let level = levels[params.get('level')] ? params.get('level') : 'easy';
  const SENS = clamp(parseFloat(params.get('sens')) || 1, 0.5, 2);
  const usePose = cfg.pose !== false, useEnergy = !!cfg.energy;
  const view = cfg.view || 'camera';      // camera: 카메라 화면 위에 놀이 / scene: 그림 배경 + 작은 카메라
  let duo = !!cfg.duo && params.get('duo') === '1';   // 두 명 같이 (cfg.duo 인 놀이만)

  document.title = `${cfg.title} · 돌봄놀이터 온(ON)`;
  document.body.className = 'cat-' + (cfg.cat || 'run');
  document.body.innerHTML = `
<canvas id="game"></canvas>
<video id="video" playsinline muted></video>
<div class="hud" id="hud" hidden><div class="grp" id="hud-l"></div><div class="grp" id="hud-r"></div></div>
<div id="status"></div>
<div id="cam"><canvas id="camfx" width="320" height="240"></canvas><span class="tag">카메라</span></div>
<div id="keys" hidden></div>
<div class="overlay" id="start"><div class="panel">
  <h1>${cfg.emoji} ${cfg.title}</h1>
  <p>${cfg.desc}</p>
  ${cfg.how ? `<ol class="how">${cfg.how.map(s => `<li>${s}</li>`).join('')}</ol>` : ''}
  ${cfg.duo ? '<div class="lv duo" id="duo-pick"></div>' : ''}
  <div class="lv" id="lv-start"></div>
  <button class="btn" id="go-cam">📷 카메라로 시작</button>
  <button class="btn sub" id="go-key">⌨️ 카메라 없이 연습</button>
  <p class="err" id="err" hidden></p>
  <p class="note">카메라 영상은 이 컴퓨터 안에서만 쓰고, 저장하거나 보내지 않아요.<br>${cfg.place || '카메라에서 약 2.5~3m 떨어져, 머리부터 발까지 보이게 서요.'}</p>
  <a class="back" href="../../index.html#${cfg.id}">← 놀이 목록으로</a>
</div></div>
<div class="overlay" id="end" hidden><div class="panel">
  <h1>끝! 잘했어요 🎉</h1>
  <div class="stats" id="e-stats"></div>
  <p id="e-msg"></p>
  <div class="lv" id="lv-end"></div>
  <button class="btn" id="again">다시 하기</button>
  <a class="back" href="../../index.html#${cfg.id}">← 놀이 목록으로</a>
</div></div>`;

  const $ = (id) => document.getElementById(id);
  const cv = $('game'), ctx = cv.getContext('2d');
  const video = $('video');
  let W = 0, H = 0;
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', resize); resize();

  // 그림
  const IMG = {};
  const imgList = [...(cfg.images || []), ...(view === 'camera' && cfg.puppet !== false ? ['head_happy', 'head_wow', 'head_focus'] : [])];
  const loads = [];
  const load = (src, ok) => loads.push(new Promise(res => { const im = new Image(); im.onload = () => { ok(im); res(); }; im.onerror = () => res(); im.src = src; }));
  imgList.forEach(n => load(ART + n + '.png', im => { IMG[n] = im; }));
  let BG = null;
  if (cfg.bg) load(ART + cfg.bg + '.jpg', im => { BG = im; });
  // 그림을 다 불러온 뒤 시작 (느린 인터넷에서도 안 보이는 표적이 생기지 않게, 최대 8초 기다림)
  const imagesReady = Promise.race([Promise.all(loads), new Promise(r => setTimeout(r, 8000))]);

  // 소리
  let ac = null;
  const beep = (f, d = 0.12, type = 'sine', vol = 0.13, delay = 0) => {
    if (!ac) return;
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = f; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.02);
  };

  // ── 상태 ──
  let mode = 'start';       // start | calib | ecalib | countdown | play | end
  let input = 'camera';     // camera | synth
  let landmarker = null, lastVideoTime = -1, lastFrameAt = 0;
  let VA = ASPECT;          // 실제 카메라 가로/세로 비율 (카메라를 켜면 다시 잼)
  let countEnd = 0, playEnd = 0, lastCount = 0, endAt = 0;
  const fx = [];            // 떠오르는 글자 · 반짝이
  const hudVals = {};

  // 몸 (부드럽게 다듬은 점들)
  const body = { lm: null, raw: null, visible: false, lastSeen: -9, t: 0, prev: null, prevT: 0, vel: new Array(33).fill(null).map(() => ({ x: 0, y: 0 })) };
  const base = { ok: false, T: 0.2, W: 0.13, cx: ASPECT / 2, cy: 0.5, shY: 0.4, hipY: 0.6, noseY: 0.3, ankL: 0.85, ankR: 0.85, kneeL: 0.73, kneeR: 0.73 };
  const calib = { win: [] };
  // 두 번째 친구 (duo): 화면 오른쪽에 선 사람
  const body2 = { lm: null, visible: false, t: 0, lastSeen: -9 };
  const base2 = { ok: false, T: 0.2, W: 0.13, cx: ASPECT / 2, cy: 0.5, shY: 0.4, hipY: 0.6, noseY: 0.3, ankL: 0.85, ankR: 0.85, kneeL: 0.73, kneeR: 0.73 };
  const calib2 = { win: [] };
  const pstate = [{ size: null, roll: 0 }, { size: null, roll: 0 }];
  const jump = { air: false, airSince: 0, standSince: 0, upHold: 0 };
  const duck = { on: false, hold: 0, offHold: 0 };

  // 움직임 양
  const EC = document.createElement('canvas'); EC.width = 64; EC.height = 48;
  const ectx = EC.getContext('2d', { willReadFrequently: true });
  let prevGray = null, lastEnergyAt = 0;
  const energy = { E: 0, L: 0, R: 0, A: 0, AL: 0, AR: 0, N: 0.01, D: 0.06, NL: 0.01, DL: 0.06, NR: 0.01, DR: 0.06, ok: false };
  const ecal = { phase: 'still', until: 0, still: [], stillL: [], stillR: [], move: [], moveL: [], moveR: [] };

  // ── 카메라 없이 연습: 가상 몸 ──
  const synth = { cx: ASPECT / 2, squat: 0, squatTarget: 0, jumpT: -9, hand: null, kick: { side: null, t: -9 }, knees: false, preset: null, keys: {}, pumpL: 0, pumpR: 0, prevLm: null };
  const synth2 = { cx: ASPECT / 2 + 0.3, preset: null };       // 연습 모드 두 번째 친구 (자세만)
  function synthBody(now) {
    const s = synth;
    s.squat += (s.squatTarget - s.squat) * 0.25;
    const jt = now - s.jumpT, jumpH = jt >= 0 && jt <= 0.55 ? 4 * (jt / 0.55) * (1 - jt / 0.55) * 0.07 : 0;
    const def = Object.assign({ cx: s.cx, squat: s.squat, jump: jumpH }, s.preset || {});
    if (s.knees) def.raise = Math.floor(now / 0.28) % 2 ? 'L' : 'R';
    if (s.kick.side && now - s.kick.t < 0.35) def.raise = s.kick.side;
    const P = buildBody(def);
    if (s.hand) {     // 마우스 쪽 손을 마우스 위치로
      const side = s.hand.x < s.cx ? 'L' : 'R';
      const sh = P[side === 'L' ? 11 : 12];
      let tx = s.hand.x, ty = s.hand.y; const d = Math.hypot(tx - sh.x, ty - sh.y), reach = 0.19;
      if (d > reach) { tx = sh.x + (tx - sh.x) / d * reach; ty = sh.y + (ty - sh.y) / d * reach; }
      const el = { x: (sh.x + tx) / 2 + (side === 'L' ? -0.02 : 0.02), y: (sh.y + ty) / 2 + 0.02 };
      const iw = side === 'L' ? 15 : 16, ie = side === 'L' ? 13 : 14;
      P[ie] = { x: el.x, y: el.y, v: 0.99 }; P[iw] = { x: tx, y: ty, v: 0.99 };
      (side === 'L' ? [17, 19, 21] : [18, 20, 22]).forEach(i => { P[i] = { x: tx, y: ty, v: 0.99 }; });
    }
    return P;
  }

  // ── 몸 처리: 부드럽게 + 기준 + 점프·숙이기 ──
  const CORE = [11, 12, 23, 24];
  function processPose(raw, now) {
    const dt = Math.max(0.001, now - body.t);
    const vis = raw && CORE.every(i => raw[i] && (raw[i].v ?? 1) >= 0.6);
    if (!vis) {
      body.visible = false; calib.win = [];
      if (mode === 'calib' && duo && now - body.lastSeen > 1) base.ok = false;   // 기준을 잰 뒤 오래 사라지면 다시 잼
      if (now - body.lastSeen > 0.2) body.prev = null;   // 오래 끊기면 손 궤적 버림
      return;
    }
    if (!body.visible && now - body.lastSeen > 0.5) body.reacq = now;   // 다시 잡힌 시각
    body.visible = true; body.lastSeen = now;
    const sm = body.lm || raw.map(p => ({ ...p }));
    const next = raw.map((p, i) => {
      const tau = (i >= 13 && i <= 22) || i >= 25 ? 0.04 : 0.08;
      const q = sm[i] || p, pv = p.v ?? 1, qv = q.v ?? 1;
      // 안 보이는 점은 위치를 그대로 두고, 다시 보이면 새 위치로 바로 옮김 (몸을 가로질러 늘어나지 않게)
      const a = pv < 0.5 ? 0 : qv < 0.5 ? 1 : 1 - Math.exp(-dt / tau);
      return { x: q.x + (p.x - q.x) * a, y: q.y + (p.y - q.y) * a, v: pv };
    });
    if (body.lm && dt < 0.2) next.forEach((p, i) => { body.vel[i] = { x: (p.x - body.lm[i].x) / dt, y: (p.y - body.lm[i].y) / dt }; });
    else body.vel.forEach(v => { v.x = 0; v.y = 0; });
    body.prev = body.lm; body.prevT = body.t;
    body.lm = next; body.t = now;
    const m = metrics(next);

    if (mode === 'calib') {
      if (base.ok) return;                       // (두 명일 때) 친구 기준을 기다리는 중
      // 이 놀이에 꼭 필요한 점(무릎·발목 등)이 잘 보일 때만 기준을 잼
      if ((cfg.need || []).some(i => (next[i].v ?? 1) < 0.6)) { calib.win = []; calib.needMiss = true; return; }
      calib.needMiss = false;
      if (calib.win.length && now - calib.win[calib.win.length - 1].t > 0.2) calib.win = [];
      calib.win.push({ t: now, ...m });
      while (calib.win.length && now - calib.win[0].t > 2) calib.win.shift();
      const span = calib.win.length ? now - calib.win[0].t : 0;
      const ys = calib.win.map(s => s.cy), range = Math.max(...ys) - Math.min(...ys);
      if (span > 1.8 && range < 0.1 * m.T) {
        const md = (k) => median(calib.win.map(s => s[k]));
        Object.assign(base, { ok: true, T: md('T'), W: md('W'), cx: md('cx'), cy: md('cy'), shY: md('shY'), hipY: md('hipY'), noseY: md('noseY'), ankL: md('ankL'), ankR: md('ankR'), kneeL: md('kneeL'), kneeR: md('kneeR') });
        if (!duo || (base2.ok && body2.visible)) startCountdown(now);
      }
      return;
    }
    if (!base.ok) return;
    // 점프 (몸 가운데가 기준보다 0.16T 위)
    const rise = (base.cy - m.cy) / base.T;
    const UP = 0.16 / SENS, DOWN = 0.07 / SENS;
    if (!jump.air) {
      if (rise > UP) { jump.upHold += dt; if (jump.upHold >= 0.05) { jump.air = true; jump.airSince = now; jump.upHold = 0; if (cfg.onJump) cfg.onJump(api, now); } }
      else jump.upHold = 0;
    } else if (rise < DOWN) jump.air = false;
    // 오래 '공중'이면 기준이 틀어진 것: 0.7초 가만히 서 있는 것을 확인한 뒤 새 기준
    if (jump.air && now - jump.airSince > 1.2) {
      if (Math.abs(m.cy - (jump.lastCy ?? m.cy)) < 0.03 * base.T) { jump.standSince ||= now; if (now - jump.standSince > 0.7) { base.cy = m.cy; base.shY = m.shY; base.hipY = m.hipY; jump.air = false; jump.standSince = 0; } }
      else jump.standSince = 0;
    }
    jump.lastCy = m.cy;
    // 숙이기 (어깨 0.30T + 골반 0.12T 아래로)
    const shDrop = (m.shY - base.shY) / base.T, hipDrop = (m.hipY - base.hipY) / base.T;
    if (!duck.on) { if (shDrop > 0.3 / SENS && hipDrop > 0.12 / SENS) { duck.hold += dt; if (duck.hold >= 0.08) { duck.on = true; duck.hold = 0; duck.since = now; if (cfg.onDuck) cfg.onDuck(api, now); } } else duck.hold = 0; }
    else if (shDrop < 0.15) { duck.offHold += dt; if (duck.offHold >= 0.12) { duck.on = false; duck.offHold = 0; } } else duck.offHold = 0;
    // 서 있을 때 기준을 천천히 따라감 (앞뒤로 움직여도 맞게)
    if (!jump.air && !duck.on && Math.abs(rise) < 0.1) {
      const k = 1 - Math.exp(-dt / 3);
      base.cy += (m.cy - base.cy) * k; base.shY += (m.shY - base.shY) * k; base.hipY += (m.hipY - base.hipY) * k;
      base.T += (m.T - base.T) * k * 0.5; base.W += (m.W - base.W) * k * 0.5; base.cx += (m.cx - base.cx) * k;
    }
  }
  // 두 번째 친구: 부드럽게 다듬기 + 기준 재기만 (점프·숙이기 판정은 하지 않음)
  function processPose2(raw, now) {
    const vis = raw && CORE.every(i => raw[i] && (raw[i].v ?? 1) >= 0.6);
    if (!vis) { body2.visible = false; calib2.win = []; if (mode === 'calib' && now - body2.lastSeen > 1) base2.ok = false; return; }
    const dt = Math.max(0.001, now - body2.t);
    const sm = body2.lm || raw.map(p => ({ ...p }));
    body2.lm = raw.map((p, i) => {
      const tau = (i >= 13 && i <= 22) || i >= 25 ? 0.04 : 0.08;
      const q = sm[i] || p, pv = p.v ?? 1, qv = q.v ?? 1;
      const a = pv < 0.5 ? 0 : qv < 0.5 ? 1 : 1 - Math.exp(-dt / tau);
      return { x: q.x + (p.x - q.x) * a, y: q.y + (p.y - q.y) * a, v: pv };
    });
    body2.t = now; body2.visible = true; body2.lastSeen = now;
    const m = metrics(body2.lm);
    if (mode === 'calib') {
      if (base2.ok) return;
      if (calib2.win.length && now - calib2.win[calib2.win.length - 1].t > 0.2) calib2.win = [];
      calib2.win.push({ t: now, ...m });
      while (calib2.win.length && now - calib2.win[0].t > 2) calib2.win.shift();
      const span = calib2.win.length ? now - calib2.win[0].t : 0, ys = calib2.win.map(s => s.cy);
      if (span > 1.8 && Math.max(...ys) - Math.min(...ys) < 0.1 * m.T) {
        const md = (k) => median(calib2.win.map(s => s[k]));
        Object.assign(base2, { ok: true, T: md('T'), W: md('W'), cx: md('cx'), cy: md('cy'), shY: md('shY'), hipY: md('hipY'), noseY: md('noseY'), ankL: md('ankL'), ankR: md('ankR'), kneeL: md('kneeL'), kneeR: md('kneeR') });
        if (base.ok && body.visible) startCountdown(now);
      }
      return;
    }
    if (base2.ok && Math.abs((base2.cy - m.cy) / base2.T) < 0.1) {   // 서 있을 때 기준을 천천히 따라감
      const k = 1 - Math.exp(-dt / 3);
      base2.cy += (m.cy - base2.cy) * k; base2.shY += (m.shY - base2.shY) * k; base2.hipY += (m.hipY - base2.hipY) * k; base2.cx += (m.cx - base2.cx) * k;
    }
  }
  // 두 명이 잡혔을 때 왼쪽 사람 = 1번, 오른쪽 사람 = 2번. 한 명만 잡히면 가까운 쪽에 붙임
  function splitPeople(list) {
    const hipX = (P) => (P[23].x + P[24].x) / 2;
    const ps = list.filter(Boolean).sort((a, b) => hipX(a) - hipX(b)).slice(0, 2);
    if (!ps.length) return [null, null];
    // 직전 위치(최근 0.5초 안에 보였을 때)와 가장 가깝게 짝지음 — 서로 자리를 바꿔도 사람이 뒤바뀌지 않게
    const t = now();
    const p1 = body.lm && t - body.lastSeen < 0.5 ? hipX(body.lm) : null, p2 = body2.lm && t - body2.lastSeen < 0.5 ? hipX(body2.lm) : null;
    if (ps.length === 2) {
      if (p1 === null || p2 === null) return [ps[0], ps[1]];          // 처음엔 왼쪽 사람이 1번
      const keep = Math.abs(hipX(ps[0]) - p1) + Math.abs(hipX(ps[1]) - p2), swap = Math.abs(hipX(ps[1]) - p1) + Math.abs(hipX(ps[0]) - p2);
      return keep <= swap ? [ps[0], ps[1]] : [ps[1], ps[0]];
    }
    const x = hipX(ps[0]), x1 = p1 ?? base.cx, x2 = p2 ?? base2.cx;
    return Math.abs(x - x1) <= Math.abs(x - x2) ? [ps[0], null] : [null, ps[0]];
  }
  function metrics(P) {
    const sh = mid(P[11], P[12]), hip = mid(P[23], P[24]);
    return { T: Math.max(0.03, dist(sh, hip)), W: Math.max(0.03, dist(P[11], P[12])), cx: (sh.x + hip.x) / 2, cy: (sh.y + hip.y) / 2,
      shY: sh.y, hipY: hip.y, noseY: P[0].y, ankL: P[27].y, ankR: P[28].y, kneeL: P[25].y, kneeR: P[26].y };
  }

  // ── 움직임 양 (화면 변화량) ──
  function computeEnergy(now) {
    if (now - lastEnergyAt < 1 / 15) return;           // 15번/초
    const gap = now - lastEnergyAt; lastEnergyAt = now;
    ectx.save(); ectx.scale(-1, 1); ectx.drawImage(video, -64, 0, 64, 48); ectx.restore();
    const d = ectx.getImageData(0, 0, 64, 48).data, g = new Uint8Array(64 * 48);
    for (let i = 0; i < g.length; i++) g[i] = (d[i * 4] * 77 + d[i * 4 + 1] * 150 + d[i * 4 + 2] * 29) >> 8;
    if (prevGray && gap < 0.15) {
      const diffs = new Int16Array(g.length);
      for (let i = 0; i < g.length; i++) diffs[i] = g[i] - prevGray[i];
      const shift = median(Array.from(diffs.filter((_, i) => i % 7 === 0)));   // 화면 전체 밝기 변화는 빼기
      let c = 0, cl = 0, cr = 0;
      for (let y = 0; y < 48; y++) for (let x = 0; x < 64; x++) {
        if (x >= 29 && x < 35) continue;                     // 가운데 빈 줄 (팀 경계)
        if (Math.abs(diffs[y * 64 + x] - shift) > 25) { c++; if (x < 32) cl++; else cr++; }
      }
      setEnergy(c / (58 * 48), cl / (29 * 48), cr / (29 * 48), now);
    }
    prevGray = g;
  }
  function setEnergy(E, L, R, now) {
    const k = 0.35;
    energy.E += (E - energy.E) * k; energy.L += (L - energy.L) * k; energy.R += (R - energy.R) * k;
    if (mode === 'ecalib') {
      if (ecal.phase === 'still') { ecal.still.push(E); ecal.stillL.push(L); ecal.stillR.push(R); }
      else { ecal.move.push(E); ecal.moveL.push(L); ecal.moveR.push(R); }
    }
    const A = (e, n, d) => clamp((e - n) / Math.max(0.008, d - n), 0, 1.5);
    energy.A = A(energy.E, energy.N, energy.D); energy.AL = A(energy.L, energy.NL, energy.DL); energy.AR = A(energy.R, energy.NR, energy.DR);
  }
  function finishEnergyCalib() {
    energy.N = pct(ecal.still, 0.95); energy.NL = pct(ecal.stillL, 0.95); energy.NR = pct(ecal.stillR, 0.95);
    // 실제로 움직인 만큼을 기준으로 (너무 작으면 잡음에 휘둘리지 않게 아주 작은 하한만)
    energy.D = energy.N + Math.max(0.008, median(ecal.move) - energy.N);
    energy.DL = energy.NL + Math.max(0.008, median(ecal.moveL) - energy.NL);
    energy.DR = energy.NR + Math.max(0.008, median(ecal.moveR) - energy.NR);
    energy.ok = true;
  }

  // ── 화면 좌표 ──
  function videoRect() {
    const vw = input === 'camera' && video.videoWidth ? video.videoWidth : 640, vh = input === 'camera' && video.videoHeight ? video.videoHeight : 480;
    // 카메라 화면 전체가 보이게(머리·발이 잘리지 않게) 맞춤. 장면형 놀이는 꽉 채움
    const sc = view === 'camera' ? Math.min(W / vw, H / vh) : Math.max(W / vw, H / vh), w = vw * sc, h = vh * sc;
    return { x: (W - w) / 2, y: (H - h) / 2, w, h };
  }
  let VR = { x: 0, y: 0, w: 1, h: 1 };
  const toScreen = (p) => ({ x: VR.x + p.x * VR.h, y: VR.y + p.y * VR.h });
  const fromScreen = (x, y) => ({ x: (x - VR.x) / VR.h, y: (y - VR.y) / VR.h });

  // ── API (각 놀이에서 씀) ──
  const api = {
    ctx, get W() { return W; }, get H() { return H; }, get level() { return level; }, get L() { return levels[level]; },
    get mode() { return mode; }, get input() { return input; }, get timeLeft() { return Math.max(0, playEnd - now()); },
    get lm() { return body.visible ? body.lm : null; }, get visible() { return body.visible; }, vel: (i) => body.vel[i],
    get prevLm() { return body.prev; }, get prevT() { return body.prevT; }, get poseT() { return body.t; },
    base, get jumping() { return jump.air; }, get ducking() { return duck.on; }, energy,
    toScreen, fromScreen, get unit() { return VR.h; }, get rect() { return VR; }, get aspect() { return input === 'camera' ? VA : ASPECT; },
    img: (n) => IMG[n] || null, beep, synth, synth2,
    get duo() { return duo; },
    // 사람별 정보 (0 = 왼쪽/혼자, 1 = 오른쪽 친구)
    get people() { return [{ lm: body.visible ? body.lm : null, base, visible: body.visible }, { lm: body2.visible ? body2.lm : null, base: base2, visible: body2.visible }]; },
    react(name, dur = 0.6) { faceName = name; faceUntil = now() + dur; },   // 캐릭터 표정: happy | wow | focus
    hud(k, v) { hudVals[k] = v; },
    pop(text, x, y, color = '#F26B4F', size = 0.05) { fx.push({ type: 'text', text, x, y, color, size, t: now() }); },
    burst(x, y, color = '#FFD24D', n = 10) { for (let i = 0; i < n; i++) fx.push({ type: 'dot', x, y, vx: rand(-1, 1) * 220, vy: rand(-1.3, 0.3) * 220, color, t: now() }); },
    finish() { if (mode === 'play' && !endAt) endAt = now() + 0.6; },
    status: setStatus,
    drawImg(name, x, y, w, rot = 0, alpha = 1, flip = false) {
      const im = IMG[name]; if (!im) return false;
      const h = w * im.height / im.width;
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); if (rot) ctx.rotate(rot); if (flip) ctx.scale(-1, 1);
      ctx.drawImage(im, -w / 2, -h / 2, w, h); ctx.restore(); return true;
    },
    text(t, x, y, size, color = '#1F2430', weight = 800, align = 'center') {
      ctx.font = `${weight} ${Math.round(size)}px "Pretendard","Malgun Gothic",sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(3, size * 0.14); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineJoin = 'round';
      ctx.strokeText(t, x, y); ctx.fillStyle = color; ctx.fillText(t, x, y);
    },
  };
  let VT = null;                                   // 시험용 가상 시계 (__game.step 을 쓸 때만)
  const now = () => VT ?? performance.now() / 1000;

  // ── HUD ──
  function renderHud() {
    const items = (cfg.hud || []).map(([k, label, unit]) => `<div class="pill"><small>${label}</small><span id="hud-${k}">0</span>${unit || ''}</div>`).join('');
    $('hud-l').innerHTML = items + `<div class="pill"><small>남은 시간</small><span id="hud-time">0</span>초</div>`;
    $('hud-r').innerHTML = `<div class="pill"><small>난이도</small><span>${levels[level].name}</span></div>`;
  }
  function updateHud() {
    for (const [k] of cfg.hud || []) { const el = $('hud-' + k); if (el && el.textContent !== String(hudVals[k] ?? 0)) el.textContent = hudVals[k] ?? 0; }
    const t = $('hud-time'); if (t) t.textContent = Math.ceil(Math.max(0, playEnd - now()));
  }
  function setStatus(t) { const s = $('status'); if (s.textContent !== t) s.textContent = t; s.style.display = t ? 'block' : 'none'; }

  // ── 진행 ──
  function startCountdown(t) { mode = 'countdown'; countEnd = t + 3; lastCount = 4; setStatus(''); }
  function startPlay(t) {
    mode = 'play'; endAt = 0; fx.length = 0;
    Object.keys(hudVals).forEach(k => delete hudVals[k]);
    playEnd = t + (levels[level].duration || cfg.duration || 60);
    renderHud(); $('hud').hidden = false;
    cfg.init && cfg.init(api, t);
  }
  function finish() {
    mode = 'end'; $('hud').hidden = true; setStatus('');
    const r = cfg.result ? cfg.result(api) : { stats: [], msg: '' };
    $('e-stats').innerHTML = r.stats.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
    $('e-msg').textContent = r.msg || '';
    $('end').hidden = false; beep(784, 0.15); beep(1046, 0.3, 'sine', 0.13, 0.16);
  }
  function beginRound() {
    const t = now();
    // 판마다 동작 감지·연습 캐릭터 상태를 모두 처음으로
    Object.assign(jump, { air: false, airSince: 0, standSince: 0, upHold: 0 }); Object.assign(duck, { on: false, hold: 0, offHold: 0 });
    Object.assign(synth, { squat: 0, squatTarget: 0, jumpT: -9, hand: null, kick: { side: null, t: -9 }, knees: false, preset: null, keys: {}, pumpL: 0, pumpR: 0, act: 0, prevLm: null });
    synth2.preset = null;
    base2.ok = false; calib2.win = []; body2.visible = false; body2.lm = null;
    if (input === 'synth') { setSynthBase(); startCountdown(t); return; }
    if (useEnergy && !usePose) { mode = 'ecalib'; ecal.phase = 'still'; ecal.until = t + 2.5; ['still', 'stillL', 'stillR', 'move', 'moveL', 'moveR'].forEach(k => ecal[k] = []); return; }
    if (usePose) { mode = 'calib'; calib.win = []; base.ok = false; return; }
    startCountdown(t);
  }
  function setSynthBase() {
    synth.cx = duo ? ASPECT / 2 - 0.3 : ASPECT / 2; synth2.cx = ASPECT / 2 + 0.3;
    const m = metrics(buildBody({ cx: synth.cx }));
    Object.assign(base, { ok: true, T: m.T, W: m.W, cx: m.cx, cy: m.cy, shY: m.shY, hipY: m.hipY, noseY: m.noseY, ankL: m.ankL, ankR: m.ankR, kneeL: m.kneeL, kneeR: m.kneeR });
    if (duo) { const m2 = metrics(buildBody({ cx: synth2.cx })); Object.assign(base2, { ok: true, T: m2.T, W: m2.W, cx: m2.cx, cy: m2.cy, shY: m2.shY, hipY: m2.hipY, noseY: m2.noseY, ankL: m2.ankL, ankR: m2.ankR, kneeL: m2.kneeL, kneeR: m2.kneeR }); }
    Object.assign(energy, { N: 0.01, D: 0.08, NL: 0.01, DL: 0.08, NR: 0.01, DR: 0.08, ok: true });
  }

  // ── 그리기 공통 ──
  // 그림 배경 (카메라 영상 대신). 카메라는 오른쪽 아래 작은 화면으로만 보여 줌
  let softColor = null;
  function drawStage(t) {
    softColor ||= getComputedStyle(document.body).getPropertyValue('--c-soft').trim() || '#FFE9E3';
    if (BG) {
      const sc = Math.max(W / BG.width, H / BG.height), w = BG.width * sc, h = BG.height * sc;
      ctx.drawImage(BG, (W - w) / 2, (H - h) / 2, w, h);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#FFF6F0'); g.addColorStop(1, softColor);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    cfg.drawBack && cfg.drawBack(api, ctx, t);
    // 몸을 찾았을 때만 캐릭터를 그림 (장갑 등 놀이 그림과 같은 기준)
    if (cfg.puppet !== false && body.lm && body.visible && mode !== 'start') {
      drawPuppet(ctx, body.lm, toScreen, { face: t < faceUntil ? faceName : (jump.air ? 'happy' : 'focus'), hands: cfg.hands !== false, imgs: IMG, refW: base.ok ? base.W * VR.h : 0, state: pstate[0] });
    }
    if (duo && cfg.puppet !== false && body2.lm && body2.visible && mode !== 'start') {
      drawPuppet(ctx, body2.lm, toScreen, { face: t < faceUntil ? faceName : 'focus', hands: cfg.hands !== false, imgs: IMG, refW: base2.ok ? base2.W * VR.h : 0, state: pstate[1], colors: SHIRT2 });
    }
  }
  let faceName = 'happy', faceUntil = 0;
  function drawSkeleton(c, P, map, unit, cute) {
    const L = (a, b, w) => { const p = map(P[a]), q = map(P[b]); c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.lineWidth = w; c.stroke(); };
    c.lineCap = 'round'; c.lineJoin = 'round';
    const bones = [[11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28], [11, 23], [12, 24], [11, 12], [23, 24]];
    c.strokeStyle = cute ? '#FFFFFF' : 'rgba(46,229,157,.9)'; bones.forEach(([a, b]) => L(a, b, unit * (cute ? 0.032 : 0.012)));
    if (cute) { c.strokeStyle = '#8FCBF2'; bones.forEach(([a, b]) => L(a, b, unit * 0.02)); }
    if (cute) { const n = map(P[0]); c.fillStyle = '#FBDCC6'; c.strokeStyle = '#fff'; c.lineWidth = unit * 0.01; c.beginPath(); c.arc(n.x, n.y, unit * 0.055, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#5A3A26'; c.beginPath(); c.arc(n.x, n.y - unit * 0.012, unit * 0.057, Math.PI * 1.05, Math.PI * 1.95); c.fill(); }
  }
  function drawPip() {
    const fc = $('camfx').getContext('2d');
    if (input !== 'camera' || !video.videoWidth) return;
    fc.save(); fc.translate(320, 0); fc.scale(-1, 1); fc.drawImage(video, 0, 0, 320, 240); fc.restore();
    if (usePose) { fc.strokeStyle = body.visible && (!duo || body2.visible) ? '#2EC27E' : '#FF6B6B'; fc.lineWidth = 10; fc.strokeRect(0, 0, 320, 240); }   // 몸을 찾으면 초록 테두리
  }
  function drawFx(t) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i], age = t - f.t;
      if (age > (f.type === 'text' ? 1.1 : 0.7)) { fx.splice(i, 1); continue; }
      if (f.type === 'text') { ctx.globalAlpha = 1 - age / 1.1; api.text(f.text, f.x, f.y - age * 60, H * f.size, f.color); ctx.globalAlpha = 1; }
      else { ctx.globalAlpha = 1 - age / 0.7; ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(f.x + f.vx * age, f.y + f.vy * age + 300 * age * age, H * 0.008, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    }
  }
  function drawCenter(t) {
    if (mode === 'countdown') {
      const n = Math.ceil(countEnd - t);
      api.text(n > 0 ? n : '시작!', W / 2, H * 0.4, H * 0.22, '#1F2430', 900);
      if (cfg.tip) api.text(cfg.tip, W / 2, H * 0.55, H * 0.04, '#1F2430', 800);
    } else if (mode === 'calib') {
      const ready = body.visible && (!duo || body2.visible);
      api.text(ready ? '그대로 가만히 서 있어요…' : duo ? '두 사람이 나란히 서 주세요' : '카메라 앞에 서 주세요', W / 2, H * 0.3, H * 0.055);
    } else if (mode === 'ecalib') {
      const left = Math.ceil(ecal.until - t);
      if (ecal.phase === 'still') api.text(`모두 가만히! ${left}`, W / 2, H * 0.32, H * 0.07, '#3A7BEB', 900);
      else api.text(`이번엔 다 같이 제자리에서 뛰어요! ${left}`, W / 2, H * 0.32, H * 0.06, '#F26B4F', 900);
      api.text('움직임을 재는 중이에요', W / 2, H * 0.42, H * 0.035, '#5B6170', 700);
    }
  }

  // ── 매 프레임 ──
  let lastT = now();
  function frame() { if (VT === null) { frameBody(); } requestAnimationFrame(frame); }
  function frameBody() {
    const t = now(), dt = Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
    if (input === 'synth') {                      // 연습 모드: ← → 로 옆으로 이동
      if (synth.keys.left) synth.cx = Math.max(0.25, synth.cx - 0.75 * dt);
      if (synth.keys.right) synth.cx = Math.min(ASPECT - 0.25, synth.cx + 0.75 * dt);
    }
    if (input === 'camera' && video.videoWidth) VA = video.videoWidth / video.videoHeight;
    VR = videoRect();
    // 입력
    const sim = window.__game.sim;
    if (sim.pose || sim.energy) {
      if (sim.pose) processPose(sim.pose, t);
      if (sim.pose2) processPose2(sim.pose2, t);
      if (sim.energy) setEnergy(sim.energy.E ?? 0, sim.energy.L ?? 0, sim.energy.R ?? 0, t);
    } else if (input === 'camera') {
      if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime; lastFrameAt = t;
        if (useEnergy) computeEnergy(t);
        if (landmarker) {
          try {
            const res = landmarker.detectForVideo(video, performance.now());
            const list = (res.landmarks || []).map(L => L.map(p => ({ x: (1 - p.x) * VA, y: p.y, v: p.visibility ?? 1 })));
            if (duo) { const [a, b] = splitPeople(list); processPose(a, t); processPose2(b, t); }
            else processPose(list[0] || null, t);
          } catch (e) { console.warn(e); }
        }
      }
      // 카메라 영상이 멈추면(0.25초 이상 새 화면 없음) 몸·움직임 입력을 쓰지 않음
      if (mode !== 'start' && t - lastFrameAt > 0.25) {
        body.visible = false; body.prev = null; body2.visible = false; calib.win = []; calib2.win = [];
        energy.A = energy.AL = energy.AR = 0; energy.E = energy.L = energy.R = 0;
      }
    } else if (mode !== 'start' && mode !== 'end') {
      const P = synthBody(t);
      processPose(P, t);
      if (duo) processPose2(buildBody(Object.assign({ cx: synth2.cx }, synth2.preset || {})), t);
      // 연습 모드 움직임 양: 몸 움직임 + 키(A/L)
      let mv = 0; if (synth.prevLm) for (const i of [0, 15, 16, 25, 26, 27, 28, 11, 12]) mv += Math.hypot(P[i].x - synth.prevLm[i].x, P[i].y - synth.prevLm[i].y);
      synth.prevLm = P;
      synth.pumpL *= 0.94; synth.pumpR *= 0.94;
      synth.act = (synth.act || 0) * Math.exp(-dt / 0.2) + mv * 0.3;    // 움직임을 잠깐(0.2초) 이어서 셈
      const e = clamp(synth.act, 0, 0.2);
      const left = synth.cx < ASPECT / 2;
      setEnergy(e + (synth.pumpL + synth.pumpR) / 2, (left ? e : 0) + synth.pumpL, (left ? 0 : e) + synth.pumpR, t);
    }
    // 움직임 양 보정 단계
    if (mode === 'ecalib' && t >= ecal.until) {
      if (ecal.phase === 'still') { ecal.phase = 'move'; ecal.until = t + 5; beep(660, 0.15); }
      else { finishEnergyCalib(); startCountdown(t); }
    }
    // 상태 안내
    if (input === 'camera' && usePose && mode !== 'start' && mode !== 'end') {
      if (mode === 'calib') setStatus(calib.needMiss ? (cfg.needMsg || '발끝까지 화면에 보이게 조금 뒤로 가 주세요')
        : duo ? '두 사람이 카메라에서 3m쯤 떨어져, 팔을 벌려도 닿지 않게 나란히 서요' : (cfg.place || '카메라에서 약 2.5~3m 떨어져, 머리부터 발까지 보이게 서요'));
      else setStatus(body.visible && (!duo || body2.visible) ? '' : duo ? '두 사람 모두 화면에 보이게 서 주세요' : '몸이 잘 안 보여요. 카메라에서 조금 떨어져 주세요');
    }
    // 진행
    if (mode === 'countdown') {
      const n = Math.ceil(countEnd - t);
      if (n !== lastCount && n > 0) { beep(660, 0.12); lastCount = n; }
      if (t >= countEnd) { beep(990, 0.25); startPlay(t); }
    }
    if (mode === 'play') {
      cfg.update && cfg.update(api, t, dt);
      if (t >= playEnd && !endAt) endAt = t + (cfg.endDelay ?? 0.8);
      if (endAt && t >= endAt) finish();
      updateHud();
    }
    // 그리기
    if (view === 'camera') drawStage(t);
    cfg.draw && cfg.draw(api, ctx, t);
    drawFx(t);
    drawCenter(t);
    drawPip();
  }

  // ── 시작 화면 ──
  function renderLv(id) {
    const box = $(id);
    box.innerHTML = Object.entries(levels).map(([k, v]) => `<button data-k="${k}" aria-pressed="${k === level}">${v.name}<small>${v.sub}</small></button>`).join('');
    box.querySelectorAll('button').forEach(b => b.onclick = () => {
      level = b.dataset.k; renderLv('lv-start'); renderLv('lv-end');
      const u = new URL(location.href); u.searchParams.set('level', level); history.replaceState(null, '', u);
    });
  }
  renderLv('lv-start'); renderLv('lv-end');
  // 혼자 / 둘이 고르기 (cfg.duo 인 놀이만)
  function renderDuo() {
    const box = $('duo-pick'); if (!box) return;
    box.style.gridTemplateColumns = '1fr 1fr';
    box.innerHTML = [[false, '🙋 혼자', '한 명'], [true, '👫 둘이', '두 명 같이']].map(([v, a, b]) => `<button data-v="${v}" aria-pressed="${v === duo}">${a}<small>${b}</small></button>`).join('');
    box.querySelectorAll('button').forEach(b => b.onclick = () => {
      duo = b.dataset.v === 'true'; renderDuo();
      const u = new URL(location.href); if (duo) u.searchParams.set('duo', '1'); else u.searchParams.delete('duo'); history.replaceState(null, '', u);
    });
  }
  renderDuo();
  const initAudio = () => { if (!ac) { try { ac = new AudioContext(); } catch {} } else if (ac.state === 'suspended') ac.resume(); };

  async function startCamera() {
    const btn = $('go-cam'); btn.disabled = true; $('err').hidden = true; initAudio();
    try {
      btn.textContent = '카메라를 켜는 중…';
      if (!video.srcObject) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 }, facingMode: 'user' }, audio: false });
        video.srcObject = stream; await video.play();
      }
      if (usePose && !landmarker) {
        btn.textContent = '몸 인식 준비 중… (처음엔 조금 걸려요)';
        const { PoseLandmarker, FilesetResolver } = await import(`${MP_URL}/vision_bundle.mjs`);
        const vision = await FilesetResolver.forVisionTasks(`${MP_URL}/wasm`);
        const opts = (delegate) => ({ baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numPoses: duo ? 2 : 1,
          minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
        try { landmarker = await PoseLandmarker.createFromOptions(vision, opts('GPU')); }
        catch { landmarker = await PoseLandmarker.createFromOptions(vision, opts('CPU')); }
        landmarker.__poses = duo ? 2 : 1;
      }
      if (landmarker && landmarker.__poses !== (duo ? 2 : 1)) { await landmarker.setOptions({ numPoses: duo ? 2 : 1 }); landmarker.__poses = duo ? 2 : 1; }
      await imagesReady;
      input = 'camera'; $('start').hidden = true; $('keys').hidden = true;
      $('cam').style.display = 'block';
      beginRound();
    } catch (e) {
      console.error(e);
      const msg = e && e.name === 'NotAllowedError' ? '카메라 사용이 허용되지 않았어요. 주소창의 카메라 아이콘에서 허용해 주세요.'
        : e && e.name === 'NotFoundError' ? '연결된 카메라를 찾지 못했어요.'
        : '카메라나 몸 인식을 시작하지 못했어요. (' + (e && e.message ? e.message : e) + ')';
      $('err').textContent = msg + ' 카메라 없이 연습하기로 해 볼 수 있어요.'; $('err').hidden = false;
    } finally { btn.disabled = false; btn.textContent = '📷 카메라로 시작'; }
  }
  async function startSynth() {
    initAudio(); await imagesReady; input = 'synth'; $('start').hidden = true;
    $('keys').innerHTML = cfg.keys || '<b>←→</b> 옆으로 · <b>스페이스</b> 점프 · <b>↓</b> 쪼그려 앉기 · <b>마우스</b> 손 움직이기';
    $('keys').hidden = false; beginRound();
  }
  $('go-cam').onclick = startCamera;
  $('go-key').onclick = startSynth;
  $('again').onclick = () => { $('end').hidden = true; beginRound(); };

  // 연습 모드 조작
  addEventListener('keydown', (e) => {
    if (input !== 'synth' || mode === 'start' || mode === 'end') return;
    const k = e.code;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
    if (k === 'Space' || k === 'ArrowUp') { if (now() - synth.jumpT > 0.5) synth.jumpT = now(); }
    if (k === 'ArrowDown') synth.squatTarget = 1;
    if (k === 'ArrowLeft') synth.keys.left = true;
    if (k === 'ArrowRight') synth.keys.right = true;
    if (k === 'KeyR') synth.knees = true;
    if (k === 'KeyZ') synth.kick = { side: 'L', t: now() };
    if (k === 'KeyX') synth.kick = { side: 'R', t: now() };
    if (k === 'KeyA') synth.pumpL = Math.min(0.25, synth.pumpL + 0.05);
    if (k === 'KeyL') synth.pumpR = Math.min(0.25, synth.pumpR + 0.05);
    cfg.onKey && cfg.onKey(api, e);
  });
  addEventListener('keyup', (e) => {
    if (e.code === 'ArrowDown') synth.squatTarget = 0;
    if (e.code === 'ArrowLeft') synth.keys.left = false;
    if (e.code === 'ArrowRight') synth.keys.right = false;
    if (e.code === 'KeyR') synth.knees = false;
  });
  cv.addEventListener('mousemove', (e) => { if (input === 'synth') synth.hand = fromScreen(e.clientX, e.clientY); });
  cv.addEventListener('mouseleave', () => { synth.hand = null; });

  window.__game = { api, sim: { pose: null, pose2: null, energy: null }, get mode() { return mode; }, base, base2, energy,
    setDuo(v) { duo = !!v && !!cfg.duo; renderDuo(); },
    skip() { if (mode === 'countdown') countEnd = now(); },
    end() { if (mode === 'play') playEnd = now(); },
    now,
    // 시험용: 화면이 숨겨져 있어도 가상 시계로 n프레임을 바로 돌림. each(t) 를 매 프레임 부름
    step(n, dt = 1 / 60, each) { if (VT === null) VT = performance.now() / 1000; for (let i = 0; i < n; i++) { VT += dt; each && each(VT); frameBody(); } },
    realtime() { VT = null; lastT = now(); } };
  requestAnimationFrame(frame);
  return api;
}
