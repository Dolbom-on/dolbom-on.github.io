// 배경음악 — 파일 없이 브라우저 소리 기능(Web Audio)으로 직접 연주하는 자작곡 5곡 (저작권 걱정 없음)
// Songs are original, written for this site. Notation (one bar = 16 steps of a 16th note):
//   lead: '.' rest, '-' hold previous note, '0'..'9','a','b' = scale step (0 = key root, 7 = one octave up)
//   bass: 'R' chord root, '5' fifth, 'O' octave, '.' rest   chord: 'x' stab   drums: k kick, s snare, h hat
const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];

export const SONGS = {
  run: {
    name: '신나는 달리기', bpm: 150, root: 60, scale: MAJOR, prog: [0, 4, 5, 3, 0, 4, 3, 4],
    lead: ['4.4.2.4.7-..6.4.', '4-2-1-..1.2.4-..', '5.5.4.5.9-..7.5.', '7-5-3-..2.3.4---',
           '7.7.9.7.6.4.2.4.', '6-4-8-..6.4.1---', '5.5.7.5.3.5.7.9.', '8-..6-..4-..1.2.'],
    bass: 'R.R.5.R.R.R.5.O.', chord: '..x...x...x...x.',
    kick: 'k...k...k...k...', snare: '....s.......s...', hat: 'h.h.h.h.h.h.h.h.',
    leadType: 'square', leadVol: 0.07, leadCut: 2600, leadLen: 0.9, chordType: 'triangle', chordVol: 0.03, bassVol: 0.16,
  },
  bounce: {
    name: '통통 튀는 손놀이', bpm: 124, root: 65, scale: MAJOR, prog: [0, 5, 1, 4, 0, 5, 3, 4],
    lead: ['0.4.7.4.9.7.4.2.', '5.7.9.7.5.4.2.4.', '1.3.5.3.8.5.3.1.', '4.6.8.6.4---2.1.',
           '7..7..9.7.4.2.0.', '5..5..7.5.2.0.2.', '3..3..5.7.5.3.2.', '4.6.8.a.8---..4.'],
    bass: 'R..R..5.R..R..O.', chord: '....x.......x...',
    kick: 'k.....k.k.......', snare: '....s.......s..s', hat: '..h...h...h...h.',
    leadType: 'mallet', leadVol: 0.14, chordType: 'triangle', chordVol: 0.03, bassVol: 0.15,
  },
  calm: {
    name: '차분한 산책', bpm: 104, root: 67, scale: MAJOR, prog: [0, 3, 5, 4, 0, 3, 1, 4],
    lead: ['4---2-0-2---4-..', '5---4-3-2-------', '4---5-7-9---7-..', '8---6-4-1-------',
           '7---6-4-6---7-..', '9---7-5-7-------', '8---7-5-1---5-..', '1---4-6-8-------'],
    bass: 'R.....5.R.....5.', chord: 'arp8',
    kick: 'k.......k.......', snare: '', hat: '....h.......h...',
    leadType: 'triangle', leadVol: 0.1, leadLen: 0.95, chordType: 'pluck', chordVol: 0.045, bassVol: 0.13, oct: -12,
  },
  rocket: {
    name: '두근두근 로켓', bpm: 128, root: 57, scale: MINOR, prog: [0, 5, 2, 6, 0, 5, 2, 6],
    lead: ['7---------4-5-7-', '7---5---2-------', '9---------7-9-a-', 'a---8---6-------',
           '7-7-4-7-9-7-5-4-', '5-5-2-5-7-5-4-2-', '6-6-4-6-9-6-4-2-', '6-6-3-6-8-6-a---'],
    bass: 'R.RR.RR.R.RR.RO.', chord: 'arp16',
    kick: 'k...k...k...k...', snare: '....s.......s...', hat: '..h...h...h...h.',
    leadType: 'square', leadVol: 0.065, leadCut: 2200, leadLen: 0.92, chordType: 'pluck', chordVol: 0.035, bassVol: 0.16, layered: true,
  },
  puzzle: {
    name: '딱 맞는 퍼즐', bpm: 116, root: 62, scale: MINOR, prog: [0, 3, 6, 2, 5, 3, 4, 4],
    lead: ['7.4.2.4.7.9.8.7.', '3.5.7.5.a.9.7.5.', '6.8.a.8.6.4.1.4.', '2.4.6.9-------..',
           '5.7.9.7.5.2.0.2.', '3.5.7.5.3.5.7.a.', '4.6.8.6.b.8.6.4.', '8---6---4---1-2-'],
    bass: 'R...R.5.R...R.O.', chord: '..x...x...x...x.',
    kick: 'k.......k.k.....', snare: '....s.......s...', hat: 'h.h.h.h.h.h.h.h.',
    leadType: 'square', leadVol: 0.06, leadCut: 1800, leadLen: 0.6, chordType: 'triangle', chordVol: 0.03, bassVol: 0.15,
  },
};

// which song each game uses (a game can override with cfg.bgm)
export const SONG_OF = {
  'log-jump': 'run', 'stone-bridge': 'run', 'animal-race': 'run', 'tag-dodge': 'run',
  'veggie-slice': 'bounce', 'boxing-pads': 'bounce', 'goalkeeper': 'bounce', 'target-kick': 'bounce',
  'memory-match': 'calm', 'cooking-tycoon': 'calm', 'rocket-launch': 'rocket', 'human-tetris': 'puzzle',
};

const DIGITS = '0123456789ab';
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const deg = (song, d) => song.root + Math.floor(d / 7) * 12 + song.scale[((d % 7) + 7) % 7];   // scale step -> midi
const triad = (song, bar) => { const r = song.prog[bar % song.prog.length]; return [deg(song, r), deg(song, r + 2), deg(song, r + 4)]; };

let NOISE = null;
function noiseBuf(ac) {
  if (NOISE && NOISE.sampleRate === ac.sampleRate) return NOISE;
  const b = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return (NOISE = b);
}

function tone(ac, out, type, f, t, dur, vol, cut) {
  const g = ac.createGain(); let src = out;
  if (cut) { const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cut; lp.connect(out); src = lp; }
  g.connect(src);
  const osc = (wave, freq, v) => { const o = ac.createOscillator(); o.type = wave; o.frequency.value = freq; const og = ac.createGain(); og.gain.value = v; o.connect(og).connect(g); o.start(t); o.stop(t + dur + 0.05); };
  if (type === 'mallet') {           // marimba-like: sine + soft overtone, fast decay
    osc('sine', f, 1); osc('sine', f * 4, 0.12);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(dur, 0.35));
  } else if (type === 'pluck') {
    osc('triangle', f, 1);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(dur, 0.25));
  } else {
    osc(type, f, 1);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.setValueAtTime(vol, t + Math.max(0.01, dur - 0.04)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
}
function drum(ac, out, kind, t, vol) {
  if (kind === 'k') {
    const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(vol * 0.42, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); o.connect(g).connect(out); o.start(t); o.stop(t + 0.2);
    return;
  }
  const n = ac.createBufferSource(); n.buffer = noiseBuf(ac);
  const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = kind === 's' ? 1500 : 7000;
  const g = ac.createGain(), d = kind === 's' ? 0.12 : 0.035;
  g.gain.setValueAtTime(vol * (kind === 's' ? 0.16 : 0.05), t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  n.connect(f).connect(g).connect(out); n.start(t, Math.random() * 0.3); n.stop(t + d + 0.02);
}

// schedule everything that starts on one 16th step. intensity 0..1 (only 'layered' songs use it)
export function playStep(ac, out, song, step, t, sd, intensity = 1) {
  const bar = Math.floor(step / 16) % song.lead.length, s = step % 16, L = song.layered ? intensity : 1;
  const ch = triad(song, bar), oct = song.oct || 0;
  // lead
  const line = song.lead[bar], c = line[s];
  if (DIGITS.includes(c) && (!song.layered || L > 0.15)) {
    let n = 1; while (s + n < 16 && line[s + n] === '-') n++;
    tone(ac, out, song.leadType, mtof(deg(song, DIGITS.indexOf(c)) + 12 + oct), t, n * sd * (song.leadLen || 1), song.leadVol, song.leadCut);
  }
  // bass
  const b = song.bass[s];
  if (b && b !== '.') tone(ac, out, 'triangle', mtof(ch[0] - 24 + (b === '5' ? 7 : b === 'O' ? 12 : 0)), t, sd * 1.6, song.bassVol);
  // chords
  if (song.chord === 'arp8' || song.chord === 'arp16') {
    const every = song.chord === 'arp8' ? 2 : 1;
    if (s % every === 0 && (!song.layered || L > 0.6)) { const i = (s / every) % 4, m = [ch[0], ch[1], ch[2], ch[1]][i]; tone(ac, out, song.chordType, mtof(m + (song.chord === 'arp16' ? 12 : 0)), t, sd * every, song.chordVol); }
  } else if (song.chord[s] === 'x') ch.forEach(m => tone(ac, out, song.chordType, mtof(m), t, sd * 1.5, song.chordVol));
  // drums (layered songs add them as the intensity goes up)
  if (song.kick[s] === 'k' && L > 0.25) drum(ac, out, 'k', t, 1);
  if (song.snare && song.snare[s] === 's' && L > 0.45) drum(ac, out, 's', t, 1);
  if (song.hat[s] === 'h' && L > 0.55) drum(ac, out, 'h', t, s % 4 === 0 ? 1 : 0.7);
}

// Player: music → volume → duck (dips under sound effects) → speakers
export function createBgm(ac) {
  const vol = ac.createGain(), duckG = ac.createGain();
  vol.gain.value = 0; vol.connect(duckG).connect(ac.destination);
  let song = null, step = 0, next = 0, timer = null, tempo = 1, intensity = 1, level = 0.32;   // music stays well under the sound effects (beep peak 0.13)
  const sd = () => 60 / (song.bpm * tempo) / 4;
  function tick() {
    if (!song) return;
    if (next < ac.currentTime) next = ac.currentTime + 0.03;          // after a pause (hidden tab): restart cleanly
    while (next < ac.currentTime + 0.15) { playStep(ac, vol, song, step, next, sd(), intensity); next += sd(); step++; }
  }
  return {
    get playing() { return !!song; },
    play(name, opts = {}) {
      this.stop(0);
      song = SONGS[name] || SONGS.run; step = 0; tempo = opts.tempo || 1; intensity = opts.intensity ?? 1; next = ac.currentTime + 0.08;
      vol.gain.cancelScheduledValues(ac.currentTime); vol.gain.setValueAtTime(0.0001, ac.currentTime); vol.gain.exponentialRampToValueAtTime(level, ac.currentTime + 0.4);
      timer = setInterval(tick, 25); tick();
    },
    stop(fade = 0.5) {
      if (timer) clearInterval(timer); timer = null; song = null;
      const t = ac.currentTime; vol.gain.cancelScheduledValues(t); vol.gain.setValueAtTime(Math.max(0.0001, vol.gain.value), t); vol.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.02, fade));
    },
    set tempo(v) { tempo = v; }, get tempo() { return tempo; },
    set intensity(v) { intensity = v; },
    duck(d = 0.35) { const t = ac.currentTime; duckG.gain.cancelScheduledValues(t); duckG.gain.setValueAtTime(0.45, t); duckG.gain.linearRampToValueAtTime(1, t + d); },
  };
}
