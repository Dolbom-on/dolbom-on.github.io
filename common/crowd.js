// 반 전체 놀이용: 그림 속 친구들이 우리 반 움직임(A: 0~1)에 맞춰 움직임
export const CROWD_IMAGES = ['kid_cheer', 'girl_cheer', 'girl_jump', 'boy_dance', 'girl_dance', 'boy_pull', 'girl_pull', 'kid_jump'];

function kid(api, ctx, name, x, feetY, h, rot = 0, flip = false, alpha = 1) {
  const im = api.img(name); if (!im) return;
  const w = h * im.width / im.height;
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, feetY); if (rot) ctx.rotate(rot); if (flip) ctx.scale(-1, 1);
  ctx.drawImage(im, -w / 2, -h, w, h); ctx.restore();
}
function shadow(ctx, x, y, w) { ctx.fillStyle = 'rgba(70,90,60,.16)'; ctx.beginPath(); ctx.ellipse(x, y + 4, w, w * 0.18, 0, 0, 7); ctx.fill(); }

// 로켓 발사: 다 같이 뛰는 친구들
export function drawBouncers(api, ctx, t, A, xs = [0.1, 0.22, 0.34, 0.46, 0.58, 0.7]) {
  const { W, H } = api, h = H * 0.27, feet = H * 0.95;
  xs.forEach((fx, i) => {
    const girl = i % 2 === 1, ph = Math.abs(Math.sin(t * 6.5 + i * 1.3));
    const up = A * H * 0.07 * ph;
    const name = A > 0.45 && ph > 0.6 ? (girl ? 'girl_jump' : 'kid_cheer') : (girl ? 'girl_cheer' : 'kid_cheer');
    shadow(ctx, fx * W, feet, h * 0.22 * (1 - up / (H * 0.12)));
    kid(api, ctx, name, fx * W, feet - up, h * (name === 'girl_jump' ? 0.92 : 1), Math.sin(t * 3 + i) * 0.04 * A);
  });
}

// 줄다리기: 왼쪽 팀(오른쪽을 보고 뒤로 당김) · 오른쪽 팀(거울로 뒤집음). 밧줄 높이를 돌려줌
export function drawTeams(api, ctx, t, off, AL, AR) {
  const { W, H } = api, h = H * 0.3, feet = H * 0.92;
  const left = [0.12, 0.21, 0.3], right = [0.7, 0.79, 0.88];
  const draw = (xs, A, flip) => xs.forEach((fx, i) => {
    const x = fx * W + off, lean = (0.08 + 0.12 * Math.min(1, A)) * (flip ? 1 : -1) + Math.sin(t * 8 + i) * 0.03 * A;
    shadow(ctx, x, feet, h * 0.22);
    kid(api, ctx, i % 2 ? 'girl_pull' : 'boy_pull', x, feet, h, lean, flip);
  });
  draw(left, AL, false); draw(right, AR, true);
  return feet - h * 0.48;          // 손 높이 ≈ 밧줄 높이
}

// 얼음땡: 춤추는 친구들 (얼음일 때는 멈춤)
export function drawDancers(api, ctx, t, A, frozen, shake = 0, xs = [0.12, 0.28, 0.72, 0.88]) {
  const { W, H } = api, h = H * 0.28, feet = H * 0.94;
  const names = [['boy_dance', 'kid_cheer'], ['girl_dance', 'girl_cheer'], ['girl_dance', 'girl_cheer'], ['boy_dance', 'kid_cheer']];
  xs.forEach((fx, i) => {
    const beat = Math.floor(t / (0.42 - 0.12 * Math.min(1, A)) + i) % 2;
    const name = frozen ? names[i][0] : names[i][beat];
    const up = frozen ? 0 : Math.abs(Math.sin(t * 7 + i)) * H * 0.03 * (0.4 + A);
    const rot = frozen ? Math.sin(t * 40) * shake * 0.05 : Math.sin(t * 4 + i) * 0.08 * (0.3 + A);
    shadow(ctx, fx * W, feet, h * 0.22);
    kid(api, ctx, name, fx * W, feet - up, h, rot, i >= 2);
  });
}
