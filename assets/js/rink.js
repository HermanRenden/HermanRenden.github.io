/* ============================================================
   rink.js — tiny hockey shootout
   Aim with mouse, click to shoot, beat the goalie.
   Vanilla JS, one <canvas>, no libraries.
   ============================================================ */

(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);

  /* ---------- DOM ---------- */
  const cv = $("#rink");
  const ctx = cv.getContext("2d");

  const sbShots  = $("#sbShots");
  const sbGoals  = $("#sbGoals");
  const sbSaves  = $("#sbSaves");
  const sbStreak = $("#sbStreak");
  const sbHigh   = $("#sbHigh");

  const overlay     = $("#rinkOverlay");
  const overlayBtn  = $("#overlayBtn");
  const overlayT    = $("#overlayTitle");
  const overlayB    = $("#overlayBody");

  /* ---------- custom cursor on rink page ---------- */
  const dot  = $("#cursorDot");
  const ring = $("#cursorRing");
  if (dot && ring && matchMedia("(pointer: fine)").matches) {
    let mx = -100, my = -100, rx = -100, ry = -100, raf;
    const tick = () => {
      rx += (mx - rx) * 0.2; ry += (my - ry) * 0.2;
      dot.style.transform  = `translate(${mx - 3}px, ${my - 3}px)`;
      ring.style.transform = `translate(${rx - 16}px, ${ry - 16}px)`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("mousemove", (e) => { mx = e.clientX; my = e.clientY;
      if (!raf) raf = requestAnimationFrame(tick); }, { passive: true });
    const hov = "a, button, canvas";
    document.addEventListener("mouseover", (e) => { if (e.target.closest(hov)) ring.classList.add("is-hover"); });
    document.addEventListener("mouseout",  (e) => { if (e.target.closest(hov)) ring.classList.remove("is-hover"); });
  } else if (dot && ring) { dot.remove(); ring.remove(); }

  /* ---------- constants ---------- */
  const W = 900, H = 500;
  const NET_X = 810;        // goalie line / front of crease
  const NET_BACK = 870;     // back of net (line to cross for goal)
  const NET_TOP = 170;
  const NET_BOT = 360;
  const GOALIE_W = 20;
  const GOALIE_H = 74;
  const SHOOTER = { x: 110, y: 370 };
  const PUCK_START = { x: 148, y: 378 };
  const PUCK_R = 9;
  const PUCK_SPEED = 920;
  const MAX_SHOTS = 10;

  const HIGH_KEY = "hr-rink-high-v1";

  /* ---------- state ---------- */
  const state = {
    shots: 0, goals: 0, saves: 0,
    streak: 0, bestStreak: 0,
    high: Number(localStorage.getItem(HIGH_KEY)) || 0,
    running: false, over: false,
    puck: null,
    goalieY: NET_TOP + (NET_BOT - NET_TOP) / 2 - GOALIE_H / 2,
    mouse: { x: W * 0.8, y: H * 0.5 },
    particles: [],
    flash: null,         // { t0, color }
    toast: null,         // { t0, text, color }
    iceMarks: [],        // static skate-mark decorations
  };

  // seed some random skate marks on the ice
  for (let i = 0; i < 14; i++) {
    state.iceMarks.push({
      x: Math.random() * W,
      y: 60 + Math.random() * (H - 80),
      l: 8 + Math.random() * 18,
      a: Math.random() * Math.PI,
    });
  }

  updateBoard();

  /* ---------- HiDPI canvas scaling ---------- */
  function fitCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = cv.getBoundingClientRect();
    cv.width  = Math.round(rect.width * dpr);
    cv.height = Math.round(rect.height * dpr);
    const sx = cv.width  / W;
    const sy = cv.height / H;
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
  }
  fitCanvas();
  window.addEventListener("resize", fitCanvas);

  /* ---------- input ---------- */
  function canvasToLocal(clientX, clientY) {
    const r = cv.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * W,
      y: ((clientY - r.top)  / r.height) * H,
    };
  }

  cv.addEventListener("mousemove", (e) => {
    state.mouse = canvasToLocal(e.clientX, e.clientY);
  });
  cv.addEventListener("click", (e) => {
    const p = canvasToLocal(e.clientX, e.clientY);
    state.mouse = p;
    shoot();
  });
  cv.addEventListener("touchstart", (e) => {
    if (!e.touches.length) return;
    const t = e.touches[0];
    state.mouse = canvasToLocal(t.clientX, t.clientY);
    shoot();
    e.preventDefault();
  }, { passive: false });
  cv.addEventListener("touchmove", (e) => {
    if (!e.touches.length) return;
    const t = e.touches[0];
    state.mouse = canvasToLocal(t.clientX, t.clientY);
    e.preventDefault();
  }, { passive: false });

  window.addEventListener("keydown", (e) => {
    if (e.key === " " || e.code === "Space") { shoot(); e.preventDefault(); }
    else if (e.key === "r" || e.key === "R") { reset(); }
  });

  overlayBtn.addEventListener("click", () => {
    if (state.over) reset();
    start();
  });

  /* ---------- game flow ---------- */
  function start() {
    state.running = true;
    state.over = false;
    overlay.classList.add("is-hidden");
  }

  function reset() {
    state.shots = 0;
    state.goals = 0;
    state.saves = 0;
    state.streak = 0;
    state.bestStreak = 0;
    state.puck = null;
    state.particles = [];
    state.over = false;
    updateBoard();
    showOverlay("Ready?",
      "Move your mouse to aim. Click anywhere to shoot. You get ten shots — try to beat the goalie.",
      "Drop the puck");
  }

  function showOverlay(title, body, btn) {
    overlayT.textContent = title;
    overlayB.textContent = body;
    overlayBtn.textContent = btn;
    overlay.classList.remove("is-hidden");
  }

  function shoot() {
    if (!state.running || state.over) return;
    if (state.puck && state.puck.active) return;

    const dx = state.mouse.x - PUCK_START.x;
    const dy = state.mouse.y - PUCK_START.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    state.puck = {
      x: PUCK_START.x, y: PUCK_START.y,
      px: PUCK_START.x, py: PUCK_START.y,   // previous for continuous collision
      vx: (dx / len) * PUCK_SPEED,
      vy: (dy / len) * PUCK_SPEED,
      active: true,
      trail: [],
      spin: 0,
    };
  }

  function resolveShot(kind) {
    state.shots++;
    if (state.puck) state.puck.active = false;

    if (kind === "goal") {
      state.goals++;
      state.streak++;
      if (state.streak > state.bestStreak) state.bestStreak = state.streak;
      burst(state.puck.x, state.puck.y, "#4ade80", 42);
      setFlash("#4ade80");
      toast("GOAL!", "#4ade80");
    } else if (kind === "save") {
      state.saves++;
      state.streak = 0;
      burst(state.puck.x, state.puck.y, "#f8fafc", 18);
      setFlash("rgba(245, 158, 11, 0.35)");
      toast("SAVE", "#f8fafc");
    } else {
      state.streak = 0;
      setFlash("rgba(148,163,184,0.3)");
      toast("WIDE", "#94a3b8");
    }

    updateBoard();

    if (state.shots >= MAX_SHOTS) {
      if (state.goals > state.high) {
        state.high = state.goals;
        localStorage.setItem(HIGH_KEY, String(state.high));
        updateBoard();
      }
      state.over = true;
      setTimeout(showGameOver, 900);
    } else {
      setTimeout(() => { state.puck = null; }, 550);
    }
  }

  function showGameOver() {
    state.running = false;
    let title, body;
    const ratio = state.goals / MAX_SHOTS;
    if (state.goals === MAX_SHOTS)      { title = "10 for 10.";             body = "Unreal. You might have a career in this."; }
    else if (ratio >= 0.7)              { title = "Top shelf.";              body = `${state.goals}/${MAX_SHOTS} goals with a best streak of ${state.bestStreak}. That's a nasty snipe session.`; }
    else if (ratio >= 0.4)              { title = "Solid night.";            body = `${state.goals} goals, ${state.saves} stopped. Come back and try the hat-trick next round.`; }
    else if (state.goals > 0)           { title = "Goalie's night.";         body = `${state.goals} past him out of ${MAX_SHOTS}. Keep shooting.`; }
    else                                 { title = "Hit the iron.";          body = `No goals this round — but the rink's open. Try again.`; }
    showOverlay(title, body, "Play again");
  }

  function setFlash(color) {
    state.flash = { t0: performance.now(), color };
  }
  function toast(text, color) {
    state.toast = { t0: performance.now(), text, color };
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 180 + Math.random() * 360;
      state.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 120,
        life: 0.5 + Math.random() * 0.5,
        max:  1,
        color,
        r: 2 + Math.random() * 2.5,
      });
    }
  }

  function updateBoard() {
    sbShots.innerHTML  = `${state.shots}<span class="sb-total">/${MAX_SHOTS}</span>`;
    sbGoals.textContent  = state.goals;
    sbSaves.textContent  = state.saves;
    sbStreak.textContent = state.bestStreak;
    sbHigh.textContent   = state.high;
  }

  /* ---------- simulation ---------- */
  function update(dt) {
    // goalie AI
    const skill = 0.35 + (state.shots / MAX_SHOTS) * 0.6;   // 0.35 → 0.95
    const errPx = (1 - skill) * 70;

    let target;
    if (state.puck && state.puck.active) {
      const dxToLine = NET_X - state.puck.x;
      const tToLine = state.puck.vx > 0 ? dxToLine / state.puck.vx : 0;
      target = state.puck.y + state.puck.vy * tToLine;
      target += (Math.random() - 0.5) * errPx * 2;
    } else {
      target = (NET_TOP + NET_BOT) / 2 - GOALIE_H / 2
             + Math.sin(performance.now() * 0.0018) * 22;
    }
    const minY = NET_TOP;
    const maxY = NET_BOT - GOALIE_H;
    target = Math.max(minY, Math.min(maxY, target - GOALIE_H / 2));
    const maxSpeed = 280 + state.shots * 22;
    const d = target - state.goalieY;
    const step = Math.max(-maxSpeed * dt, Math.min(maxSpeed * dt, d));
    state.goalieY += step;

    // puck
    const p = state.puck;
    if (p && p.active) {
      p.px = p.x; p.py = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.995;
      p.vy *= 0.995;
      p.spin += 0.4;

      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 14) p.trail.shift();

      // collision with goalie — continuous at line NET_X
      if (p.px < NET_X && p.x >= NET_X) {
        const t = (NET_X - p.px) / (p.x - p.px || 1);
        const yAt = p.py + (p.y - p.py) * t;
        if (yAt >= state.goalieY && yAt <= state.goalieY + GOALIE_H) {
          // save
          p.x = NET_X; p.y = yAt;
          // puck bounces back softly
          p.vx = -Math.abs(p.vx) * 0.4;
          p.vy = (Math.random() - 0.5) * 120;
          resolveShot("save");
          return;
        }
      }

      // goal — crossed past the goalie and into the net opening
      if (p.x >= NET_BACK - 6) {
        if (p.y > NET_TOP + 4 && p.y < NET_BOT - 4) {
          resolveShot("goal");
          return;
        }
      }

      // out of bounds — wide/high/low
      if (p.x > W + 40 || p.y < -30 || p.y > H + 30) {
        resolveShot("miss");
        return;
      }
    }

    // particles
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const pp = state.particles[i];
      pp.x += pp.vx * dt; pp.y += pp.vy * dt;
      pp.vy += 450 * dt;
      pp.vx *= 0.99;
      pp.life -= dt;
      if (pp.life <= 0) state.particles.splice(i, 1);
    }
  }

  /* ---------- render ---------- */
  function draw() {
    // ice base with subtle gradient
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#f0f9ff");
    g.addColorStop(1, "#dbeafe");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // static skate marks
    ctx.strokeStyle = "rgba(56,189,248,0.22)";
    ctx.lineWidth = 1.2;
    for (const m of state.iceMarks) {
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x + Math.cos(m.a) * m.l, m.y + Math.sin(m.a) * m.l);
      ctx.stroke();
    }

    // rink lines: blue line + center red + goal line
    ctx.strokeStyle = "rgba(59,130,246,0.45)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(340, 40); ctx.lineTo(340, H - 40); ctx.stroke(); // blue line
    ctx.strokeStyle = "rgba(239,68,68,0.55)";
    ctx.beginPath(); ctx.moveTo(W / 2, 40); ctx.lineTo(W / 2, H - 40); ctx.stroke(); // center
    ctx.strokeStyle = "rgba(239,68,68,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(NET_X + 2, NET_TOP); ctx.lineTo(NET_X + 2, NET_BOT); ctx.stroke(); // goal line

    // center-ice faceoff circle
    ctx.strokeStyle = "rgba(239,68,68,0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 58, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "rgba(239,68,68,0.3)";
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 4, 0, Math.PI * 2); ctx.fill();

    // crease — half-circle in front of net
    ctx.fillStyle = "rgba(56,189,248,0.18)";
    ctx.beginPath();
    ctx.arc(NET_X, (NET_TOP + NET_BOT) / 2, 60, Math.PI / 2, -Math.PI / 2, true);
    ctx.lineTo(NET_X, NET_TOP + 20);
    ctx.closePath();
    ctx.fill();

    // boards (top & bottom)
    ctx.fillStyle = "rgba(15,20,36,0.08)";
    ctx.fillRect(0, 0, W, 18);
    ctx.fillRect(0, H - 18, W, 18);

    drawNet();
    drawGoalie();
    drawShooter();
    drawAimLine();
    drawPuck();
    drawParticles();
    drawFlash();
    drawToast();
    drawHUDArrow();
  }

  function drawNet() {
    // back of net shadow fill
    ctx.fillStyle = "rgba(148,163,184,0.25)";
    ctx.fillRect(NET_X, NET_TOP, NET_BACK - NET_X, NET_BOT - NET_TOP);

    // mesh
    ctx.strokeStyle = "rgba(15,20,36,0.55)";
    ctx.lineWidth = 1;
    for (let x = NET_X; x <= NET_BACK; x += 6) {
      ctx.beginPath(); ctx.moveTo(x, NET_TOP); ctx.lineTo(x, NET_BOT); ctx.stroke();
    }
    for (let y = NET_TOP; y <= NET_BOT; y += 6) {
      ctx.beginPath(); ctx.moveTo(NET_X, y); ctx.lineTo(NET_BACK, y); ctx.stroke();
    }

    // frame — pipes (red)
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(NET_X, NET_TOP); ctx.lineTo(NET_BACK, NET_TOP);   // top bar
    ctx.moveTo(NET_X, NET_BOT); ctx.lineTo(NET_BACK, NET_BOT);   // bottom bar
    ctx.moveTo(NET_BACK, NET_TOP); ctx.lineTo(NET_BACK, NET_BOT);// back
    ctx.stroke();

    // posts (brighter, front)
    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(NET_X, NET_TOP - 2); ctx.lineTo(NET_X, NET_BOT + 2);
    ctx.stroke();
  }

  function drawGoalie() {
    const x = NET_X - GOALIE_W + 8;
    const y = state.goalieY;

    // pads
    ctx.fillStyle = "#0f172a";
    roundRect(ctx, x, y, GOALIE_W, GOALIE_H, 4); ctx.fill();

    // chest stripe
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(x + 2, y + GOALIE_H * 0.38, GOALIE_W - 4, 6);

    // helmet
    ctx.fillStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.arc(x + GOALIE_W / 2, y - 4, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1;
    ctx.stroke();

    // glove
    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.arc(x - 4, y + GOALIE_H * 0.45, 6, 0, Math.PI * 2);
    ctx.fill();

    // stick
    ctx.strokeStyle = "#422006";
    ctx.lineWidth = 3;
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(x + GOALIE_W, y + GOALIE_H * 0.6);
    ctx.lineTo(x - 22, y + GOALIE_H + 6);
    ctx.stroke();

    // small shadow
    ctx.fillStyle = "rgba(15,20,36,0.08)";
    ctx.beginPath();
    ctx.ellipse(x + GOALIE_W / 2, y + GOALIE_H + 4, GOALIE_W * 0.6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawShooter() {
    const { x, y } = SHOOTER;
    // shadow
    ctx.fillStyle = "rgba(15,20,36,0.1)";
    ctx.beginPath();
    ctx.ellipse(x, y + 36, 22, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // skates
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(x - 12, y + 30, 10, 4);
    ctx.fillRect(x + 2,  y + 30, 10, 4);

    // legs (navy/white)
    ctx.fillStyle = "#1e3a8a";
    ctx.fillRect(x - 12, y + 8, 10, 22);
    ctx.fillRect(x + 2,  y + 8, 10, 22);

    // jersey — Norway red & navy
    ctx.fillStyle = "#dc2626";
    roundRect(ctx, x - 16, y - 22, 32, 34, 4); ctx.fill();

    // name bar
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(x - 14, y - 22, 28, 6);
    ctx.fillStyle = "#0f172a";
    ctx.font = "600 6px 'Space Grotesk', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("RENDEN", x, y - 17);

    // number
    ctx.fillStyle = "#f8fafc";
    ctx.font = "700 14px 'Space Grotesk', sans-serif";
    ctx.fillText("18", x, y - 2);

    // head
    ctx.fillStyle = "#fbcfe8";
    ctx.beginPath(); ctx.arc(x, y - 30, 8, 0, Math.PI * 2); ctx.fill();
    // helmet rim
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - 30, 8, Math.PI, 0);
    ctx.stroke();

    // stick — points toward mouse
    const dx = state.mouse.x - (x + 12);
    const dy = state.mouse.y - (y + 4);
    const ang = Math.atan2(dy, dx);
    const tipX = x + 12 + Math.cos(ang) * 34;
    const tipY = y + 4  + Math.sin(ang) * 34;
    ctx.strokeStyle = "#78350f";
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x + 12, y + 4);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    // blade
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 5;
    const bladeAng = ang + Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(tipX - Math.cos(bladeAng) * 6, tipY - Math.sin(bladeAng) * 6);
    ctx.lineTo(tipX + Math.cos(bladeAng) * 6, tipY + Math.sin(bladeAng) * 6);
    ctx.stroke();
  }

  function drawAimLine() {
    if (state.puck && state.puck.active) return;
    if (state.over || !state.running) return;
    const sx = PUCK_START.x, sy = PUCK_START.y;
    const tx = state.mouse.x, ty = state.mouse.y;
    ctx.save();
    ctx.strokeStyle = "rgba(56,189,248,0.5)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.restore();

    // crosshair
    ctx.strokeStyle = "rgba(56,189,248,0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(tx, ty, 10, 0, Math.PI * 2);
    ctx.moveTo(tx - 14, ty); ctx.lineTo(tx - 4, ty);
    ctx.moveTo(tx + 4, ty);  ctx.lineTo(tx + 14, ty);
    ctx.moveTo(tx, ty - 14); ctx.lineTo(tx, ty - 4);
    ctx.moveTo(tx, ty + 4);  ctx.lineTo(tx, ty + 14);
    ctx.stroke();
  }

  function drawPuck() {
    const p = state.puck;
    if (!p) {
      // resting puck at start
      drawPuckAt(PUCK_START.x, PUCK_START.y, 0, 1);
      return;
    }

    // trail
    for (let i = 0; i < p.trail.length; i++) {
      const t = p.trail[i];
      const alpha = (i / p.trail.length) * 0.35;
      ctx.fillStyle = `rgba(15, 23, 42, ${alpha})`;
      ctx.beginPath();
      ctx.arc(t.x, t.y, PUCK_R * (0.4 + (i / p.trail.length) * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
    drawPuckAt(p.x, p.y, p.spin, p.active ? 1 : 0.8);
  }

  function drawPuckAt(x, y, spin, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    // shadow
    ctx.fillStyle = "rgba(15,23,42,0.2)";
    ctx.beginPath(); ctx.ellipse(2, 8, PUCK_R, 3, 0, 0, Math.PI * 2); ctx.fill();
    // puck body
    const pg = ctx.createRadialGradient(-2, -2, 1, 0, 0, PUCK_R);
    pg.addColorStop(0, "#334155");
    pg.addColorStop(0.5, "#0f172a");
    pg.addColorStop(1, "#000");
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(0, 0, PUCK_R, 0, Math.PI * 2); ctx.fill();
    // spin mark
    ctx.rotate(spin);
    ctx.strokeStyle = "rgba(226,232,240,0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-PUCK_R + 2, 0); ctx.lineTo(PUCK_R - 2, 0);
    ctx.stroke();
    ctx.restore();
  }

  function drawParticles() {
    for (const p of state.particles) {
      const a = Math.max(0, p.life);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFlash() {
    if (!state.flash) return;
    const elapsed = (performance.now() - state.flash.t0) / 1000;
    const dur = 0.45;
    if (elapsed > dur) { state.flash = null; return; }
    const a = (1 - elapsed / dur) * 0.35;
    ctx.fillStyle = state.flash.color;
    ctx.globalAlpha = a;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  function drawToast() {
    if (!state.toast) return;
    const elapsed = (performance.now() - state.toast.t0) / 1000;
    const dur = 1.1;
    if (elapsed > dur) { state.toast = null; return; }
    const e = elapsed / dur;
    const scale = 0.8 + (1 - (1 - e) * (1 - e)) * 0.4;
    const alpha = e < 0.85 ? 1 : 1 - (e - 0.85) / 0.15;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2, 110);
    ctx.scale(scale, scale);
    ctx.font = "700 64px 'Space Grotesk', sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(15,23,42,0.25)";
    ctx.strokeText(state.toast.text, 0, 0);
    ctx.fillStyle = state.toast.color;
    ctx.fillText(state.toast.text, 0, 0);
    ctx.restore();
  }

  function drawHUDArrow() {
    if (!state.running || state.over) return;
    // small arrow pointing from puck toward mouse (subtle aim helper)
    if (state.puck && state.puck.active) return;
    const dx = state.mouse.x - PUCK_START.x;
    const dy = state.mouse.y - PUCK_START.y;
    const ang = Math.atan2(dy, dx);
    const ax = PUCK_START.x + Math.cos(ang) * 34;
    const ay = PUCK_START.y + Math.sin(ang) * 34;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(ang);
    ctx.fillStyle = "rgba(56,189,248,0.8)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-8, -4);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-8, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  }

  /* ---------- loop ---------- */
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

})();
