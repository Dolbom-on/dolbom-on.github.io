// 몸 둘레에 물건(카드·재료)을 놓고, 손을 대고 잠깐 머물면 고르는 놀이용 도구
// 칸: 몸 가운데에서 좌우로 어깨너비의 1.6배·2.5배 떨어진 4줄 × 2~4층 (바깥 줄은 옆걸음, 위층은 팔 뻗기, 아래층은 쪼그려 앉기)
// cx: 칸의 가운데 (판을 시작할 때 선 자리로 고정해서 넘겨 줌)
export function makeSlots(api, rows, topOffset = 0.16, cx = api.base.cx) {
  const b = { ...api.base, cx }, k = b.T / 0.2;           // 몸이 작게 잡히면(멀리 서면) 그만큼 좁고 낮게
  // 줄 간격: 어깨너비에 비례하되, 카드끼리 겹치지 않게 최소 간격을 둠
  const inner = Math.max(1.6 * b.W, 0.15), outer = inner + Math.max(0.9 * b.W, 0.14);
  const cols = [-outer, -inner, inner, outer];
  const top = Math.max(0.12, b.noseY - topOffset * k), bottom = Math.min(0.9, (b.kneeL + b.kneeR) / 2);
  const ys = rows === 1 ? [b.shY] : Array.from({ length: rows }, (_, i) => top + (bottom - top) * i / (rows - 1));
  const out = [];
  for (const y of ys) for (const c of cols) out.push({ x: Math.max(0.08, Math.min(api.aspect - 0.08, b.cx + c)), y, low: y > b.hipY + 0.02 });
  return out;
}

// 손(손목·손가락)이 물건 위에 머문 시간을 재서, dwell 초를 넘으면 그 물건을 돌려줌
export function handHover(api, items, dt, dwell, size) {
  const lm = api.lm; if (!lm) { items.forEach(it => { it.hover = 0; }); return null; }
  // 손마다(왼손 15·19 / 오른손 16·20) 가장 가까운 물건 하나만 "닿은 것"으로 봄
  const touched = new Set();
  for (const hand of [[15, 19], [16, 20]]) {
    const pts = hand.filter(i => (lm[i].v ?? 1) >= 0.5).map(i => lm[i]); if (!pts.length) continue;
    let best = null, bd = 9;
    for (const it of items) {
      if (it.locked) continue;
      const w = (it.w || size) * 0.6, h = (it.h || size) * 0.6;
      for (const p of pts) if (Math.abs(p.x - it.x) < w && Math.abs(p.y - it.y) < h) { const d = Math.hypot(p.x - it.x, p.y - it.y); if (d < bd) { bd = d; best = it; } }
    }
    if (best) touched.add(best);
  }
  let picked = null;
  for (const it of items) {
    // 손이 떨어지면 기다린 시간을 처음부터 다시 셈 (지나가다 잠깐씩 닿아도 고르지 않게)
    it.hover = touched.has(it) ? (it.hover || 0) + dt : 0;
    if (it.hover >= dwell && !picked) { picked = it; it.hover = 0; }
  }
  return picked;
}

// 머무는 동안 차오르는 동그라미
export function drawDwell(api, ctx, it, dwell, size) {
  if (!it.hover) return;
  const s = api.toScreen(it), r = size * api.unit * 0.62;
  ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(s.x, s.y, r, -Math.PI / 2, -Math.PI / 2 + Math.min(1, it.hover / dwell) * Math.PI * 2); ctx.stroke();
}
