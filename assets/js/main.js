/* ============================================================
   main.js — homepage interactions
   Custom cursor · scroll progress · aurora canvas ·
   reveal on scroll · mobile nav · konami-code puck rain
   ============================================================ */

(() => {
  "use strict";

  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------
     1. Current year in footer
     ------------------------------------------------------------ */
  const yr = $("#year");
  if (yr) yr.textContent = new Date().getFullYear();

  /* ------------------------------------------------------------
     2. Scroll-progress bar
     ------------------------------------------------------------ */
  const progress = $("#scrollProgress");
  if (progress) {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      const pct = max > 0 ? (h.scrollTop / max) * 100 : 0;
      progress.style.width = pct + "%";
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ------------------------------------------------------------
     3. Custom cursor (desktop / mouse pointer only)
     ------------------------------------------------------------ */
  const dot  = $("#cursorDot");
  const ring = $("#cursorRing");
  if (dot && ring && matchMedia("(pointer: fine)").matches) {
    let mx = -100, my = -100;
    let rx = -100, ry = -100;
    let raf;

    const tick = () => {
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      dot.style.transform  = `translate(${mx - 3}px, ${my - 3}px)`;
      ring.style.transform = `translate(${rx - 16}px, ${ry - 16}px)`;
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", (e) => {
      mx = e.clientX; my = e.clientY;
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });

    // Grow the ring over interactive elements
    const hoverables = "a, button, input, textarea, .chip, .skill-card, .timeline-item, .contact-row";
    document.addEventListener("mouseover", (e) => {
      if (e.target.closest(hoverables)) ring.classList.add("is-hover");
    });
    document.addEventListener("mouseout", (e) => {
      if (e.target.closest(hoverables)) ring.classList.remove("is-hover");
    });
  } else if (dot && ring) {
    dot.remove(); ring.remove();
  }

  /* ------------------------------------------------------------
     4. Aurora canvas — soft animated gradient blobs
     ------------------------------------------------------------ */
  const auroraCanvas = $("#aurora");
  if (auroraCanvas && !prefersReducedMotion) {
    const ctx = auroraCanvas.getContext("2d");
    let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);

    const blobs = [
      { x: 0.15, y: 0.2, r: 0.55, c: [56, 189, 248],  a: 0.22, ph: 0,   sp: 0.00012 },
      { x: 0.85, y: 0.1, r: 0.5,  c: [167, 139, 250], a: 0.18, ph: 1.6, sp: 0.00014 },
      { x: 0.5,  y: 0.95, r: 0.6, c: [74, 222, 128],  a: 0.12, ph: 3.2, sp: 0.00010 },
      { x: 0.7,  y: 0.6, r: 0.45, c: [56, 189, 248],  a: 0.14, ph: 4.4, sp: 0.00011 },
    ];

    const resize = () => {
      w = auroraCanvas.clientWidth;
      h = auroraCanvas.clientHeight;
      auroraCanvas.width  = w * dpr;
      auroraCanvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let running = true;
    document.addEventListener("visibilitychange", () => { running = !document.hidden; if (running) requestAnimationFrame(frame); });

    const frame = (t) => {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      for (const b of blobs) {
        const px = (b.x + Math.sin(t * b.sp + b.ph) * 0.08) * w;
        const py = (b.y + Math.cos(t * b.sp * 1.3 + b.ph) * 0.06) * h;
        const rr = b.r * Math.min(w, h) * (0.9 + Math.sin(t * b.sp * 2 + b.ph) * 0.08);

        const g = ctx.createRadialGradient(px, py, 0, px, py, rr);
        g.addColorStop(0,   `rgba(${b.c[0]},${b.c[1]},${b.c[2]},${b.a})`);
        g.addColorStop(0.5, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},${b.a * 0.25})`);
        g.addColorStop(1,   `rgba(${b.c[0]},${b.c[1]},${b.c[2]},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }

      ctx.globalCompositeOperation = "source-over";
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  } else if (auroraCanvas) {
    auroraCanvas.remove();
  }

  /* ------------------------------------------------------------
     5. Reveal-on-scroll via IntersectionObserver
     ------------------------------------------------------------ */
  const reveals = $$(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    reveals.forEach((el, i) => {
      el.style.transitionDelay = Math.min(i * 40, 200) + "ms";
      io.observe(el);
    });
  } else {
    reveals.forEach((el) => el.classList.add("is-in"));
  }

  /* ------------------------------------------------------------
     6. Mobile nav toggle
     ------------------------------------------------------------ */
  const navToggle = $("#navToggle");
  const navLinks  = $(".nav-links");
  if (navToggle && navLinks) {
    navToggle.addEventListener("click", () => {
      const open = navLinks.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(open));
    });
    navLinks.addEventListener("click", (e) => {
      if (e.target.tagName === "A") {
        navLinks.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ------------------------------------------------------------
     7. Active-section highlighting in nav
     ------------------------------------------------------------ */
  const sections = ["about", "experience", "skills", "contact"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  const navAnchors = new Map(
    $$(".nav-links a[href^='#']").map((a) => [a.getAttribute("href").slice(1), a])
  );
  if (sections.length && navAnchors.size && "IntersectionObserver" in window) {
    const sio = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          navAnchors.forEach((a) => a.classList.remove("nav-active"));
          const match = navAnchors.get(e.target.id);
          if (match) match.classList.add("nav-active");
        }
      }
    }, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });
    sections.forEach((s) => sio.observe(s));
  }

  /* ------------------------------------------------------------
     8. Konami code easter egg — puck rain
          ↑ ↑ ↓ ↓ ← → ← → b a
     ------------------------------------------------------------ */
  const konami = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown",
                  "ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"];
  let idx = 0;
  window.addEventListener("keydown", (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    idx = (k === konami[idx]) ? idx + 1 : (k === konami[0] ? 1 : 0);
    if (idx === konami.length) {
      idx = 0;
      releaseThePucks();
    }
  });

  function releaseThePucks() {
    const host = $("#puckRain");
    if (!host) return;
    host.innerHTML = "";
    const count = 80;
    for (let i = 0; i < count; i++) {
      const p = document.createElement("div");
      p.className = "puck";
      const left = Math.random() * 100;
      const dur = 2 + Math.random() * 2.5;
      const delay = Math.random() * 1.5;
      const rot = (Math.random() * 60 - 30).toFixed(1);
      p.style.left = left + "vw";
      p.style.top = "-40px";
      p.style.transform = `rotate(${rot}deg)`;
      p.style.animationDuration = dur + "s";
      p.style.animationDelay = delay + "s";
      host.appendChild(p);
    }
    // announce
    const msg = document.createElement("div");
    Object.assign(msg.style, {
      position: "fixed", top: "88px", left: "50%",
      transform: "translateX(-50%)",
      padding: "10px 18px", borderRadius: "999px",
      background: "rgba(10,14,26,0.9)",
      border: "1px solid rgba(167,139,250,0.4)",
      color: "#eef2ff", font: "500 13px/1 Inter, sans-serif",
      zIndex: 300, letterSpacing: "0.04em",
      boxShadow: "0 20px 40px -10px rgba(167,139,250,0.4)",
      animation: "pulse 2s ease-in-out"
    });
    msg.textContent = "🏒 pucks released — goooooal!";
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 3500);
    setTimeout(() => (host.innerHTML = ""), 5500);
  }

})();
