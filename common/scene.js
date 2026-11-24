// 달리기 장면(하늘·구름·나무·땅·덤불) 공통 그리기 — 통나무 점프 그림체와 같음
export function makeScene() {
  const clouds = Array.from({ length: 5 }, () => ({ x: Math.random(), y: 0.08 + Math.random() * 0.22, s: 0.6 + Math.random() * 0.6, v: 0.004 + Math.random() * 0.006 }));
  const trees = [0.08, 0.5, 0.86, 1.25], bushes = [0.15, 0.62, 1.05];
  let off = 0;
  return {
    get off() { return off; },
    scroll(dx) { off = (off + dx) % 100000; },
    draw(api, ctx, gy, sky = ['#FFF3EC', '#FFE1D6']) {
      const { W, H } = api;
      const g = ctx.createLinearGradient(0, 0, 0, gy); g.addColorStop(0, sky[0]); g.addColorStop(1, sky[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      clouds.forEach(c => {
        c.x -= c.v * 0.16; if (c.x < -0.25) { c.x = 1.2; c.y = 0.08 + Math.random() * 0.22; }
        const w = c.s * H * 0.21; api.drawImg('cloud', c.x * W, c.y * H, w) || (ctx.fillStyle = '#fff', ctx.beginPath(), ctx.arc(c.x * W, c.y * H, w * 0.3, 0, 7), ctx.fill());
      });
      ctx.fillStyle = '#E3F1D2';
      for (let i = -1; i < 4; i++) { const x = (i * 0.45 - (off * 0.0004) % 0.45) * W; ctx.beginPath(); ctx.ellipse(x + W * 0.2, gy + 6, W * 0.28, H * 0.09, 0, Math.PI, 0); ctx.fill(); }
      const tree = api.img('tree');
      if (tree) { const th = H * 0.36, tw = th * tree.width / tree.height, loop = W * 1.5;
        trees.forEach(t => { const x = ((t * W - off * 0.3) % loop + loop) % loop - W * 0.25; ctx.drawImage(tree, x - tw / 2, gy - th + H * 0.015, tw, th); }); }
      ctx.fillStyle = '#D3EBBA'; ctx.fillRect(0, gy, W, H - gy);
      ctx.fillStyle = '#C2E2A2'; ctx.fillRect(0, gy, W, 6);
      ctx.strokeStyle = '#9CCB7C'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      const step = 90;
      for (let x = -(off % step); x < W + step; x += step) {
        const yy = gy + 30 + ((Math.floor((x + off) / step) * 37) % 3) * 22;
        ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x - 4, yy - 10); ctx.moveTo(x + 6, yy); ctx.lineTo(x + 8, yy - 12); ctx.moveTo(x + 12, yy); ctx.lineTo(x + 16, yy - 8); ctx.stroke();
      }
      const bush = api.img('bush');
      if (bush) { const bh = H * 0.08, bw = bh * bush.width / bush.height, loop = W * 1.3;
        bushes.forEach(b => { const x = ((b * W - off) % loop + loop) % loop - W * 0.15; ctx.drawImage(bush, x - bw / 2, gy + H * 0.012 - bh, bw, bh); }); }
    },
  };
}

// ── Two players, split screen (left half = left friend, right half = right friend) ──
// viewFor(api, k): an api for one half — W is half the screen, lm/base/jumping/char are that friend's, pop/burst are shifted.
export function viewFor(api, k) {
  if (!api.duo) return api;
  const off = k * api.W / 2;
  return Object.create(api, {
    W: { get: () => api.W / 2 }, k: { value: k }, off: { value: off },
    char: { get: () => api.charOf(k) },
    lm: { get: () => api.people[k].lm }, base: { get: () => api.people[k].base },
    visible: { get: () => api.people[k].visible }, jumping: { get: () => api.people[k].jumping }, ducking: { get: () => api.people[k].ducking },
    pop: { value: (text, x, y, ...r) => api.pop(text, x + off, y, ...r) },
    burst: { value: (x, y, ...r) => api.burst(x + off, y, ...r) },
  });
}
// draw fn(view, k) once (one player) or into each half (two players), with a white divider
export function eachHalf(api, ctx, fn) {
  if (!api.duo) { fn(api, 0); return; }
  for (let k = 0; k < 2; k++) {
    const v = viewFor(api, k);
    ctx.save(); ctx.beginPath(); ctx.rect(v.off, 0, v.W, api.H); ctx.clip(); ctx.translate(v.off, 0);
    fn(v, k); ctx.restore();
  }
  ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fillRect(api.W / 2 - 4, 0, 8, api.H);
  ctx.fillStyle = 'rgba(31,36,48,.12)'; ctx.fillRect(api.W / 2 - 1, 0, 2, api.H);
}
// name label at the top of each half
export function halfLabel(v, text) { if (v.duo) v.text(text, v.W / 2, v.H * 0.17,v.H * 0.034, '#1F2430', 900); }

// Whole-body sprite of the picked mascot, feet at (x, feetY). pose: fstand|fstep|foops (front) or bstand|bjump|boops (back).
// height = on-screen height of the standing sprite; other poses keep their size relative to it. flip mirrors left/right.
export const SPRITE_POSES = ['fstand', 'fstep', 'foops', 'bstand', 'bjump', 'boops'];
export function drawCharSprite(api, ctx, pose, x, feetY, height, flip = false, shadowY = feetY) {
  const c = api.char || 'bear', ref = api.img(`${c}_${pose[0]}stand`), im = api.img(`${c}_${pose}`) || ref;
  if (!im || !ref) return false;
  const k = height / ref.height, w = im.width * k, h = im.height * k;
  const lift = Math.max(0, shadowY - feetY) / height;
  ctx.fillStyle = 'rgba(60,80,60,.18)'; ctx.beginPath(); ctx.ellipse(x, shadowY, height * 0.2 * (1 - lift * 0.5), height * 0.045 * (1 - lift * 0.5), 0, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(x, feetY); if (flip) ctx.scale(-1, 1); ctx.drawImage(im, -w / 2, -h, w, h); ctx.restore();
  return true;
}

// 아이 그림 (발 위치 기준). pose: run | jump | oops | duck | cheer
export function drawKid(api, ctx, x, feetY, height, pose, t, moving = true, groundY = feetY) {
  const pre = api.char && api.img(api.char + '_run1') ? api.char + '_' : 'kid_';     // picked mascot's side-view sprites (fallback: kid_)
  const run1 = api.img(pre + 'run1');
  if (!run1) { ctx.fillStyle = '#7CC4F2'; ctx.fillRect(x - height * 0.15, feetY - height, height * 0.3, height); return; }
  let name = 'run1';
  if (pose === 'jump') name = 'jump';
  else if (pose === 'oops') name = 'oops';
  else if (pose === 'duck') name = 'duck';
  else if (pose === 'cheer') name = 'cheer';
  else if (moving && Math.floor(t / 0.16) % 2) name = 'run2';
  const im = api.img(pre + name) || api.img('kid_' + name) || run1;
  let k = height / run1.height;
  if (name === 'duck' && pre === 'kid_') k *= 0.85;      // old boy sprite was drawn larger; mascot duck sprites share the run scale
  const bob = pose === 'run' && moving ? Math.abs(Math.sin(t * Math.PI / 0.16)) * height * 0.015 : 0;
  ctx.fillStyle = 'rgba(80,110,60,.18)';
  const lift = Math.max(0, groundY - feetY) / height;
  ctx.beginPath(); ctx.ellipse(x, groundY + 4, height * 0.28 * (1 - lift * 0.5), height * 0.06 * (1 - lift * 0.5), 0, 0, 7); ctx.fill();
  ctx.drawImage(im, x - im.width * k / 2, feetY - im.height * k - bob + height * 0.01, im.width * k, im.height * k);
}
