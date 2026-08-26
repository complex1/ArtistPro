const W = 900;
const H = 600;

const canvas = document.querySelector("#displayCanvas");
const ctx = canvas.getContext("2d");

const colorInput = document.querySelector("#color");
const sizeInput = document.querySelector("#size");
const motionInput = document.querySelector("#motion");
const speedInput = document.querySelector("#speed");

const sizeOut = document.querySelector("#sizeOut");
const motionOut = document.querySelector("#motionOut");
const speedOut = document.querySelector("#speedOut");

const brushTool = document.querySelector("#brushTool");
const eraserTool = document.querySelector("#eraserTool");
const presetSearch = document.querySelector("#presetSearch");
const presetGroups = document.querySelector("#presetGroups");
const layerList = document.querySelector("#layerList");
const statsEl = document.querySelector("#stats");

const PRESETS = [
  // Core shapes / textures
  { id:"round", name:"Round", group:"Basic", renderer:"line", anim:"none" },
  { id:"square", name:"Square", group:"Basic", renderer:"stamp", stamp:"square", spacing:4, anim:"none" },
  { id:"marker", name:"Flat Marker", group:"Basic", renderer:"ribbon", anim:"none", opacity:.75 },
  { id:"calligraphy", name:"Calligraphy", group:"Basic", renderer:"ribbon", anim:"sway", stretch:.35 },
  { id:"pencil", name:"Pencil", group:"Basic", renderer:"line", anim:"jitter", opacity:.65, widthScale:.42 },
  { id:"chalk", name:"Chalk", group:"Basic", renderer:"particle", particle:"dust", density:2.2, anim:"jitter", opacity:.45 },
  { id:"spray", name:"Spray", group:"Basic", renderer:"particle", particle:"spray", density:3.2, anim:"none", opacity:.42 },
  { id:"dotted", name:"Dotted", group:"Basic", renderer:"stamp", stamp:"dot", spacing:18, anim:"none" },
  { id:"star", name:"Star", group:"Basic", renderer:"stamp", stamp:"star", spacing:24, anim:"none" },
  { id:"heart", name:"Heart", group:"Basic", renderer:"stamp", stamp:"heart", spacing:28, anim:"none" },
  { id:"leaf", name:"Leaf", group:"Basic", renderer:"stamp", stamp:"leaf", spacing:24, anim:"sway" },
  { id:"spark", name:"Spark", group:"Basic", renderer:"stamp", stamp:"spark", spacing:24, anim:"pulse" },
  { id:"ribbon", name:"Ribbon", group:"Basic", renderer:"ribbon", anim:"wave" },
  { id:"chain", name:"Chain", group:"Basic", renderer:"stamp", stamp:"ring", spacing:20, anim:"flow" },
  { id:"fur", name:"Fur", group:"Basic", renderer:"particle", particle:"fur", density:1.5, anim:"sway" },
  { id:"cloud", name:"Cloud", group:"Basic", renderer:"stamp", stamp:"cloud", spacing:18, anim:"breathing" },
  { id:"water", name:"Water", group:"Basic", renderer:"line", anim:"ripple", glow:6, opacity:.8 },

  // Core animation behaviors
  { id:"wiggle", name:"Wiggle", group:"Motion", renderer:"line", anim:"wiggle" },
  { id:"wave", name:"Wave", group:"Motion", renderer:"line", anim:"wave" },
  { id:"pulse", name:"Pulse", group:"Motion", renderer:"line", anim:"pulse" },
  { id:"flow", name:"Flow", group:"Motion", renderer:"line", anim:"flow" },
  { id:"crawl", name:"Crawl", group:"Motion", renderer:"stamp", stamp:"dot", spacing:16, anim:"crawl" },
  { id:"jitter", name:"Jitter", group:"Motion", renderer:"line", anim:"jitter" },
  { id:"bounce", name:"Bounce", group:"Motion", renderer:"line", anim:"bounce" },
  { id:"sway", name:"Sway", group:"Motion", renderer:"line", anim:"sway" },
  { id:"breathing", name:"Breathing", group:"Motion", renderer:"line", anim:"breathing" },
  { id:"twist", name:"Twist", group:"Motion", renderer:"ribbon", anim:"twist" },
  { id:"stretch", name:"Stretch", group:"Motion", renderer:"line", anim:"stretch" },
  { id:"squash", name:"Squash", group:"Motion", renderer:"line", anim:"squash" },
  { id:"noise", name:"Noise", group:"Motion", renderer:"line", anim:"noise" },
  { id:"ripple", name:"Ripple", group:"Motion", renderer:"line", anim:"ripple" },
  { id:"elastic", name:"Elastic", group:"Motion", renderer:"line", anim:"elastic" },

  // Moving pattern brushes
  { id:"movingDots", name:"Moving Dots", group:"Patterns", renderer:"stamp", stamp:"dot", spacing:18, anim:"flow" },
  { id:"movingDashes", name:"Moving Dashes", group:"Patterns", renderer:"line", anim:"flow" },
  { id:"marchingAnts", name:"Marching Ants", group:"Patterns", renderer:"line", anim:"flow", dash:[4,5] },
  { id:"movingStars", name:"Moving Stars", group:"Patterns", renderer:"stamp", stamp:"star", spacing:26, anim:"flow" },
  { id:"movingHearts", name:"Moving Hearts", group:"Patterns", renderer:"stamp", stamp:"heart", spacing:30, anim:"flow" },
  { id:"movingBubbles", name:"Moving Bubbles", group:"Patterns", renderer:"stamp", stamp:"bubble", spacing:26, anim:"flow" },
  { id:"movingLeaves", name:"Moving Leaves", group:"Patterns", renderer:"stamp", stamp:"leaf", spacing:26, anim:"flow" },
  { id:"movingArrows", name:"Moving Arrows", group:"Patterns", renderer:"stamp", stamp:"arrow", spacing:30, anim:"flow" },
  { id:"movingParticles", name:"Moving Particles", group:"Patterns", renderer:"particle", particle:"spark", density:1.2, anim:"flow" },
  { id:"movingSparkles", name:"Moving Sparkles", group:"Patterns", renderer:"stamp", stamp:"spark", spacing:22, anim:"flow" },

  // Particle effects
  { id:"sparkles", name:"Sparkles", group:"Particles", renderer:"particle", particle:"spark", density:1.7, anim:"float" },
  { id:"snow", name:"Snow", group:"Particles", renderer:"particle", particle:"snow", density:1.8, anim:"fall" },
  { id:"rain", name:"Rain", group:"Particles", renderer:"particle", particle:"rain", density:2.0, anim:"fall" },
  { id:"dust", name:"Dust", group:"Particles", renderer:"particle", particle:"dust", density:2.4, anim:"float" },
  { id:"confetti", name:"Confetti", group:"Particles", renderer:"particle", particle:"confetti", density:1.6, anim:"fall" },
  { id:"fireSparks", name:"Fire Sparks", group:"Particles", renderer:"particle", particle:"fire", density:1.8, anim:"rise", glow:8 },
  { id:"bubbles", name:"Bubbles", group:"Particles", renderer:"particle", particle:"bubble", density:1.4, anim:"rise" },
  { id:"smoke", name:"Smoke", group:"Particles", renderer:"particle", particle:"smoke", density:1.2, anim:"rise", opacity:.22 },
  { id:"magic", name:"Magic", group:"Particles", renderer:"particle", particle:"spark", density:2.0, anim:"orbit", glow:10 },
  { id:"glowDots", name:"Glowing Dots", group:"Particles", renderer:"particle", particle:"dot", density:1.5, anim:"pulse", glow:12 },

  // Nature
  { id:"grass", name:"Grass Sway", group:"Nature", renderer:"nature", nature:"grass", anim:"sway" },
  { id:"leaves", name:"Leaves Flutter", group:"Nature", renderer:"nature", nature:"leaves", anim:"flutter" },
  { id:"flowers", name:"Flowers Sway", group:"Nature", renderer:"nature", nature:"flowers", anim:"sway" },
  { id:"vine", name:"Vine Grow", group:"Nature", renderer:"nature", nature:"vine", anim:"grow" },
  { id:"cloudDrift", name:"Cloud Drift", group:"Nature", renderer:"stamp", stamp:"cloud", spacing:28, anim:"drift" },
  { id:"rainNature", name:"Rainfall", group:"Nature", renderer:"particle", particle:"rain", density:2.4, anim:"fall" },
  { id:"snowNature", name:"Snowfall", group:"Nature", renderer:"particle", particle:"snow", density:2.0, anim:"fall" },
  { id:"fire", name:"Fire", group:"Nature", renderer:"particle", particle:"fire", density:2.0, anim:"rise", glow:12 },
  { id:"smokeNature", name:"Smoke Flow", group:"Nature", renderer:"particle", particle:"smoke", density:1.5, anim:"rise", opacity:.22 },
  { id:"waterRipple", name:"Water Ripple", group:"Nature", renderer:"line", anim:"ripple" },
  { id:"lightning", name:"Lightning", group:"Nature", renderer:"line", anim:"flicker", glow:14 },

  // Character / anime
  { id:"hair", name:"Hair Strands", group:"Anime", renderer:"line", anim:"sway", widthScale:.45 },
  { id:"cloth", name:"Clothing Flutter", group:"Anime", renderer:"ribbon", anim:"flutter" },
  { id:"sweat", name:"Sweat Drops", group:"Anime", renderer:"stamp", stamp:"drop", spacing:32, anim:"fall" },
  { id:"speedLines", name:"Speed Lines", group:"Anime", renderer:"particle", particle:"speed", density:1.3, anim:"flow" },
  { id:"aura", name:"Anime Aura", group:"Anime", renderer:"aura", anim:"rise", glow:14 },
  { id:"blush", name:"Blush Pulse", group:"Anime", renderer:"stamp", stamp:"dot", spacing:10, anim:"pulse", opacity:.22 },
  { id:"eyeSparkle", name:"Eye Sparkle", group:"Anime", renderer:"stamp", stamp:"spark", spacing:24, anim:"twinkle", glow:10 },
  { id:"tears", name:"Tears", group:"Anime", renderer:"stamp", stamp:"drop", spacing:24, anim:"fall" },
  { id:"floatingHearts", name:"Floating Hearts", group:"Anime", renderer:"particle", particle:"heart", density:1.4, anim:"rise" },
  { id:"anger", name:"Anger Symbols", group:"Anime", renderer:"stamp", stamp:"anger", spacing:34, anim:"pulse" },
  { id:"shock", name:"Shock Lines", group:"Anime", renderer:"stamp", stamp:"shock", spacing:28, anim:"pulse" },

  // Light / FX
  { id:"glow", name:"Glow", group:"FX", renderer:"line", anim:"breathing", glow:16 },
  { id:"neon", name:"Neon", group:"FX", renderer:"line", anim:"pulse", glow:18 },
  { id:"electric", name:"Electric", group:"FX", renderer:"line", anim:"noise", glow:14 },
  { id:"lightningFx", name:"Lightning FX", group:"FX", renderer:"line", anim:"flicker", glow:18 },
  { id:"fireFx", name:"Fire FX", group:"FX", renderer:"particle", particle:"fire", density:2.2, anim:"rise", glow:14 },
  { id:"energy", name:"Energy", group:"FX", renderer:"aura", anim:"pulse", glow:18 },
  { id:"hologram", name:"Hologram", group:"FX", renderer:"line", anim:"flicker", dash:[3,4], opacity:.65 },
  { id:"rainbow", name:"Rainbow", group:"FX", renderer:"line", anim:"rainbow", glow:8 },
  { id:"shimmer", name:"Shimmer", group:"FX", renderer:"stamp", stamp:"spark", spacing:18, anim:"twinkle", glow:8 },
  { id:"sparkleFx", name:"Sparkle FX", group:"FX", renderer:"particle", particle:"spark", density:2.2, anim:"twinkle", glow:10 },
  { id:"flicker", name:"Flicker", group:"FX", renderer:"line", anim:"flicker" },

  // Reveals
  { id:"drawOn", name:"Draw On", group:"Reveal", renderer:"line", anim:"drawOn" },
  { id:"eraseOut", name:"Erase Out", group:"Reveal", renderer:"line", anim:"eraseOut" },
  { id:"trimStart", name:"Trim Start", group:"Reveal", renderer:"line", anim:"trimStart" },
  { id:"trimEnd", name:"Trim End", group:"Reveal", renderer:"line", anim:"trimEnd" },
  { id:"centerReveal", name:"Reveal From Center", group:"Reveal", renderer:"line", anim:"centerReveal" },
  { id:"bothEnds", name:"Reveal From Ends", group:"Reveal", renderer:"line", anim:"bothEnds" },
  { id:"fadePath", name:"Fade Along Path", group:"Reveal", renderer:"stamp", stamp:"dot", spacing:12, anim:"fadePath" },
  { id:"sequentialParticles", name:"Sequential Particles", group:"Reveal", renderer:"particle", particle:"spark", density:1.2, anim:"sequence" }
];

let currentPresetId = "wiggle";
let tool = "brush";
let drawing = false;
let currentStroke = null;
let lastPoint = null;

let layers = [];
let activeLayerId = null;
let undoStack = [];
let redoStack = [];

function makeCanvas() {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  return c;
}

function preset() {
  return PRESETS.find(p => p.id === currentPresetId) || PRESETS[0];
}

function createLayer(name = `Layer ${layers.length + 1}`) {
  const c = makeCanvas();
  const layer = {
    id: crypto.randomUUID(),
    name,
    visible: true,
    canvas: c,
    ctx: c.getContext("2d"),
    strokes: []
  };
  layers.push(layer);
  activeLayerId = layer.id;
  renderLayerPanel();
}

function activeLayer() {
  return layers.find(l => l.id === activeLayerId);
}

function pointFromEvent(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (canvas.width / r.width),
    y: (e.clientY - r.top) * (canvas.height / r.height),
    pressure: e.pressure && e.pressure > 0 ? e.pressure : 0.5
  };
}

function setTool(next) {
  tool = next;
  brushTool.classList.toggle("active", next === "brush");
  eraserTool.classList.toggle("active", next === "eraser");
}

function renderPresetList(filter = "") {
  presetGroups.innerHTML = "";
  const term = filter.trim().toLowerCase();
  const groups = [...new Set(PRESETS.map(p => p.group))];

  for (const group of groups) {
    const items = PRESETS.filter(p =>
      p.group === group &&
      (!term || p.name.toLowerCase().includes(term) || p.group.toLowerCase().includes(term))
    );
    if (!items.length) continue;

    const title = document.createElement("div");
    title.className = "section-title";
    title.textContent = group;
    presetGroups.appendChild(title);

    const list = document.createElement("div");
    list.className = "preset-list";

    for (const p of items) {
      const b = document.createElement("button");
      b.className = "preset" + (p.id === currentPresetId ? " active" : "");
      b.innerHTML = `<span class="dot"></span><span>${p.name}</span>`;
      b.addEventListener("click", () => {
        currentPresetId = p.id;
        setTool("brush");
        renderPresetList(presetSearch.value);
      });
      list.appendChild(b);
    }
    presetGroups.appendChild(list);
  }
}

function renderLayerPanel() {
  layerList.innerHTML = "";
  for (const layer of layers) {
    const row = document.createElement("div");
    row.className = "layer" + (layer.id === activeLayerId ? " active" : "");

    const vis = document.createElement("button");
    vis.className = "mini";
    vis.textContent = layer.visible ? "👁" : "○";
    vis.onclick = (e) => {
      e.stopPropagation();
      layer.visible = !layer.visible;
      renderLayerPanel();
    };

    const name = document.createElement("div");
    name.className = "layer-name";
    name.textContent = `${layer.name} · ${layer.strokes.length} anim`;

    const del = document.createElement("button");
    del.className = "mini";
    del.textContent = "×";
    del.onclick = (e) => {
      e.stopPropagation();
      if (layers.length === 1) return clearLayer();
      saveHistory();
      layers = layers.filter(l => l.id !== layer.id);
      if (activeLayerId === layer.id) activeLayerId = layers[layers.length - 1].id;
      renderLayerPanel();
    };

    row.onclick = () => {
      activeLayerId = layer.id;
      renderLayerPanel();
    };

    row.append(vis, name, del);
    layerList.appendChild(row);
  }
  const total = layers.reduce((n, l) => n + l.strokes.length, 0);
  statsEl.innerHTML = `Animated strokes: <strong>${total}</strong><br>Preset: <span class="badge">${preset().name}</span>`;
}

function saveHistory() {
  undoStack.push(serializeDocument());
  if (undoStack.length > 30) undoStack.shift();
  redoStack = [];
}

function serializeDocument() {
  return {
    activeLayerId,
    layers: layers.map(l => ({
      id: l.id,
      name: l.name,
      visible: l.visible,
      image: l.canvas.toDataURL(),
      strokes: JSON.parse(JSON.stringify(l.strokes))
    }))
  };
}

async function restoreDocument(snapshot) {
  layers = [];
  for (const s of snapshot.layers) {
    const c = makeCanvas();
    const cctx = c.getContext("2d");
    if (s.image) {
      const img = new Image();
      await new Promise(resolve => {
        img.onload = resolve;
        img.src = s.image;
      });
      cctx.drawImage(img, 0, 0);
    }
    layers.push({
      id: s.id,
      name: s.name,
      visible: s.visible,
      canvas: c,
      ctx: cctx,
      strokes: s.strokes || []
    });
  }
  activeLayerId = snapshot.activeLayerId;
  renderLayerPanel();
}

async function undo() {
  if (!undoStack.length) return;
  redoStack.push(serializeDocument());
  await restoreDocument(undoStack.pop());
}

async function redo() {
  if (!redoStack.length) return;
  undoStack.push(serializeDocument());
  await restoreDocument(redoStack.pop());
}

function clearLayer() {
  const l = activeLayer();
  if (!l) return;
  saveHistory();
  l.ctx.clearRect(0, 0, W, H);
  l.strokes = [];
  renderLayerPanel();
}

function beginStroke(e) {
  const l = activeLayer();
  if (!l || !l.visible) return;

  saveHistory();
  drawing = true;
  lastPoint = pointFromEvent(e);

  if (tool === "eraser") {
    drawRasterSegment(lastPoint, lastPoint, true);
  } else {
    const p = preset();
    currentStroke = {
      id: crypto.randomUUID(),
      presetId: p.id,
      renderer: p.renderer,
      anim: p.anim,
      stamp: p.stamp,
      particle: p.particle,
      nature: p.nature,
      color: colorInput.value,
      size: Number(sizeInput.value),
      motion: Number(motionInput.value),
      speed: Number(speedInput.value),
      opacity: p.opacity ?? 1,
      glow: p.glow ?? 0,
      spacing: p.spacing ?? 14,
      density: p.density ?? 1,
      widthScale: p.widthScale ?? 1,
      dash: p.dash || null,
      points: [lastPoint],
      seed: Math.random() * 10000
    };
    l.strokes.push(currentStroke);
    renderLayerPanel();
  }

  canvas.setPointerCapture(e.pointerId);
}

function moveStroke(e) {
  if (!drawing) return;
  const p = pointFromEvent(e);

  if (tool === "eraser") {
    drawRasterSegment(lastPoint, p, true);
  } else if (currentStroke) {
    const prev = currentStroke.points[currentStroke.points.length - 1];
    const dx = p.x - prev.x, dy = p.y - prev.y;
    if (dx * dx + dy * dy > 4) currentStroke.points.push(p);
  }

  lastPoint = p;
}

function endStroke(e) {
  if (!drawing) return;
  drawing = false;
  currentStroke = null;
  lastPoint = null;
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
}

function drawRasterSegment(a, b, erase = false) {
  const l = activeLayer();
  if (!l) return;
  const c = l.ctx;
  c.save();
  c.lineCap = "round";
  c.lineJoin = "round";
  c.lineWidth = Number(sizeInput.value);
  c.globalCompositeOperation = erase ? "destination-out" : "source-over";
  c.strokeStyle = erase ? "#000" : colorInput.value;
  c.beginPath();
  c.moveTo(a.x, a.y);
  c.lineTo(b.x, b.y);
  c.stroke();
  c.restore();
}

function hashNoise(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function animatedPoint(stroke, p, i, t) {
  const speed = stroke.speed * 0.45;
  const a = stroke.motion;
  let x = p.x, y = p.y;
  const phase = t * speed + i * 0.33 + stroke.seed;

  switch (stroke.anim) {
    case "wiggle":
      x += Math.sin(phase * 2.1) * a;
      y += Math.cos(phase * 1.7) * a;
      break;
    case "wave":
      y += Math.sin(phase * 2.2) * a;
      break;
    case "jitter":
    case "noise": {
      const n1 = hashNoise(Math.floor(t * stroke.speed * 15) + i * 13 + stroke.seed);
      const n2 = hashNoise(Math.floor(t * stroke.speed * 15) + i * 29 + stroke.seed);
      x += (n1 - .5) * a * 2;
      y += (n2 - .5) * a * 2;
      break;
    }
    case "bounce":
      y -= Math.abs(Math.sin(phase * 1.8)) * a;
      break;
    case "sway":
    case "flutter":
      x += Math.sin(phase * 1.2) * a;
      break;
    case "ripple":
      y += Math.sin(phase * 2.8) * a * Math.sin(i * .18);
      break;
    case "elastic":
      y += Math.sin(phase * 2.4) * a * Math.exp(-i / Math.max(12, stroke.points.length));
      break;
    case "stretch": {
      const c = stroke.points[Math.floor(stroke.points.length / 2)] || p;
      const s = 1 + Math.sin(t * speed * 2) * a / 100;
      x = c.x + (x - c.x) * s;
      y = c.y + (y - c.y) * s;
      break;
    }
    case "squash": {
      const c = stroke.points[Math.floor(stroke.points.length / 2)] || p;
      const sx = 1 + Math.sin(t * speed * 2) * a / 120;
      const sy = 1 / sx;
      x = c.x + (x - c.x) * sx;
      y = c.y + (y - c.y) * sy;
      break;
    }
    case "drift":
      x += (t * stroke.speed * 8 + i * 2) % 40 - 20;
      break;
  }
  return { x, y, pressure: p.pressure };
}

function visibleRange(stroke, t) {
  const speed = Math.max(.25, stroke.speed * .18);
  const q = (t * speed) % 1;

  switch (stroke.anim) {
    case "drawOn": return [0, q];
    case "eraseOut": return [q, 1];
    case "trimStart": return [q, 1];
    case "trimEnd": return [0, 1 - q];
    case "centerReveal": {
      const half = q * .5;
      return [.5 - half, .5 + half];
    }
    case "bothEnds":
      return q < .5 ? [0, q] : [1 - q, 1];
    default:
      return [0, 1];
  }
}

function setupStrokeContext(c, stroke, t) {
  c.globalAlpha = stroke.opacity ?? 1;
  c.strokeStyle = stroke.color;
  c.fillStyle = stroke.color;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.lineWidth = stroke.size * (stroke.widthScale || 1);

  if (stroke.anim === "pulse" || stroke.anim === "breathing") {
    c.lineWidth *= 1 + Math.sin(t * stroke.speed * 1.5) * (stroke.motion / 60);
  }
  if (stroke.anim === "flicker") {
    c.globalAlpha *= .45 + Math.random() * .55;
  }
  if (stroke.anim === "rainbow") {
    c.strokeStyle = `hsl(${(t * stroke.speed * 55 + stroke.seed) % 360} 85% 55%)`;
  }
  if (stroke.glow) {
    c.shadowBlur = stroke.glow + Math.sin(t * 3) * stroke.glow * .25;
    c.shadowColor = c.strokeStyle;
  }
  if (stroke.anim === "flow") {
    c.setLineDash(stroke.dash || [stroke.size * 2, stroke.size * 1.4]);
    c.lineDashOffset = -(t * stroke.speed * 25);
  } else if (stroke.dash) {
    c.setLineDash(stroke.dash);
  }
}

function renderLineRange(c, stroke, t, start, end) {
  const n = stroke.points.length;
  const from = Math.max(0, Math.floor(start * (n - 1)));
  const to = Math.min(n - 1, Math.ceil(end * (n - 1)));
  if (to < from) return;

  c.beginPath();
  for (let i = from; i <= to; i++) {
    const q = animatedPoint(stroke, stroke.points[i], i, t);
    if (i === from) c.moveTo(q.x, q.y);
    else c.lineTo(q.x, q.y);
  }
  c.stroke();
}

function renderLine(c, stroke, t) {
  if (stroke.points.length < 1) return;

  c.save();
  setupStrokeContext(c, stroke, t);

  if (stroke.anim === "bothEnds") {
    const q = (t * Math.max(.25, stroke.speed * .18)) % 1;
    const amount = q * .5;
    renderLineRange(c, stroke, t, 0, amount);
    renderLineRange(c, stroke, t, 1 - amount, 1);
  } else {
    const [start, end] = visibleRange(stroke, t);
    renderLineRange(c, stroke, t, start, end);
  }

  c.restore();
}

function stampShape(c, type, x, y, r, angle, stroke, t, index) {
  c.save();
  c.translate(x, y);
  c.rotate(angle);

  if (stroke.anim === "twinkle" || stroke.anim === "pulse") {
    const s = .7 + .3 * (1 + Math.sin(t * stroke.speed * 2 + index));
    c.scale(s, s);
  }

  switch (type) {
    case "square":
      c.fillRect(-r, -r, r * 2, r * 2);
      break;
    case "star":
    case "spark":
    case "shock": {
      const spikes = type === "shock" ? 8 : 5;
      c.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const rr = i % 2 ? r * .35 : r;
        const a = -Math.PI / 2 + i * Math.PI / spikes;
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        i ? c.lineTo(px, py) : c.moveTo(px, py);
      }
      c.closePath();
      c.fill();
      break;
    }
    case "heart": {
      c.beginPath();
      c.moveTo(0, r);
      c.bezierCurveTo(-r * 1.4, 0, -r, -r, 0, -r * .25);
      c.bezierCurveTo(r, -r, r * 1.4, 0, 0, r);
      c.fill();
      break;
    }
    case "leaf": {
      c.beginPath();
      c.ellipse(0, 0, r * .45, r, 0, 0, Math.PI * 2);
      c.fill();
      break;
    }
    case "ring":
    case "bubble": {
      c.strokeStyle = c.fillStyle;
      c.lineWidth = Math.max(1, r * .22);
      c.beginPath();
      c.arc(0, 0, r * .72, 0, Math.PI * 2);
      c.stroke();
      break;
    }
    case "cloud": {
      c.globalAlpha *= .75;
      for (const [dx,dy,rr] of [[-r*.5,0,r*.55],[0,-r*.15,r*.7],[r*.55,0,r*.5]]) {
        c.beginPath(); c.arc(dx,dy,rr,0,Math.PI*2); c.fill();
      }
      break;
    }
    case "arrow": {
      c.beginPath();
      c.moveTo(-r, -r*.35);
      c.lineTo(r*.2, -r*.35);
      c.lineTo(r*.2, -r);
      c.lineTo(r, 0);
      c.lineTo(r*.2, r);
      c.lineTo(r*.2, r*.35);
      c.lineTo(-r, r*.35);
      c.closePath(); c.fill();
      break;
    }
    case "drop": {
      c.beginPath();
      c.moveTo(0,-r);
      c.bezierCurveTo(r*.8,0,r*.8,r,0,r);
      c.bezierCurveTo(-r*.8,r,-r*.8,0,0,-r);
      c.fill();
      break;
    }
    case "anger": {
      c.strokeStyle = c.fillStyle;
      c.lineWidth = Math.max(2, r*.22);
      c.beginPath();
      c.moveTo(-r,0); c.lineTo(-r*.3,-r*.35); c.lineTo(0,0);
      c.moveTo(0,0); c.lineTo(r*.3,r*.35); c.lineTo(r,0);
      c.moveTo(0,0); c.lineTo(r*.3,-r*.35); c.lineTo(r,0);
      c.moveTo(-r,0); c.lineTo(-r*.3,r*.35); c.lineTo(0,0);
      c.stroke();
      break;
    }
    default:
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.fill();
  }
  c.restore();
}

function sampledPath(stroke, spacing) {
  const pts = [];
  if (stroke.points.length < 2) return stroke.points.map((p,i)=>({...p, angle:0, index:i}));
  let carry = 0;
  for (let i = 1; i < stroke.points.length; i++) {
    const a = stroke.points[i - 1], b = stroke.points[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (!len) continue;
    const angle = Math.atan2(dy, dx);
    let d = spacing - carry;
    while (d <= len) {
      const u = d / len;
      pts.push({
        x: a.x + dx * u,
        y: a.y + dy * u,
        angle,
        index: pts.length
      });
      d += spacing;
    }
    carry = Math.max(0, len - (d - spacing));
  }
  return pts;
}

function renderStamp(c, stroke, t) {
  const pts = sampledPath(stroke, stroke.spacing || 18);
  if (!pts.length) return;
  c.save();
  setupStrokeContext(c, stroke, t);

  const flow = stroke.anim === "flow" || stroke.anim === "crawl";
  const offset = flow ? (t * stroke.speed * 30) : 0;

  for (let i = 0; i < pts.length; i++) {
    const src = pts[i];
    const shifted = animatedPoint(stroke, src, i, t);
    let x = shifted.x, y = shifted.y;
    if (flow) {
      x += Math.cos(src.angle) * (offset % stroke.spacing);
      y += Math.sin(src.angle) * (offset % stroke.spacing);
    }
    let alpha = 1;
    if (stroke.anim === "fadePath") {
      const phase = ((i / Math.max(1, pts.length - 1)) - (t * stroke.speed * .15)) % 1;
      const wrapped = phase < 0 ? phase + 1 : phase;
      alpha = .15 + .85 * (1 - wrapped);
    }
    c.globalAlpha = (stroke.opacity ?? 1) * alpha;
    stampShape(c, stroke.stamp || "dot", x, y, stroke.size * .65, src.angle, stroke, t, i);
  }
  c.restore();
}

function renderRibbon(c, stroke, t) {
  const pts = stroke.points;
  if (pts.length < 2) return;
  c.save();
  setupStrokeContext(c, stroke, t);
  c.fillStyle = c.strokeStyle;

  const half = stroke.size * .55;
  const left = [], right = [];

  for (let i = 0; i < pts.length; i++) {
    const p = animatedPoint(stroke, pts[i], i, t);
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const angle = Math.atan2(next.y - prev.y, next.x - prev.x);
    let width = half;
    if (stroke.anim === "twist") width *= Math.cos(t * stroke.speed * 2 + i * .35);
    left.push({ x: p.x + Math.cos(angle + Math.PI/2) * width, y: p.y + Math.sin(angle + Math.PI/2) * width });
    right.push({ x: p.x + Math.cos(angle - Math.PI/2) * width, y: p.y + Math.sin(angle - Math.PI/2) * width });
  }

  c.beginPath();
  c.moveTo(left[0].x, left[0].y);
  for (const p of left) c.lineTo(p.x, p.y);
  for (let i = right.length - 1; i >= 0; i--) c.lineTo(right[i].x, right[i].y);
  c.closePath();
  c.fill();
  c.restore();
}

function renderParticle(c, stroke, t) {
  const pts = sampledPath(stroke, Math.max(6, stroke.size * 1.1 / Math.max(.5, stroke.density || 1)));
  c.save();
  setupStrokeContext(c, stroke, t);

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const n1 = hashNoise(i * 31 + stroke.seed);
    const n2 = hashNoise(i * 47 + stroke.seed);
    const n3 = hashNoise(i * 71 + stroke.seed);
    let x = p.x + (n1 - .5) * stroke.size * 3;
    let y = p.y + (n2 - .5) * stroke.size * 3;

    const age = (t * stroke.speed * .4 + n3) % 1;
    switch (stroke.anim) {
      case "rise":
      case "float":
      case "orbit":
        y -= age * stroke.motion * 4;
        x += Math.sin(age * Math.PI * 2 + i) * stroke.motion;
        break;
      case "fall":
        y += age * stroke.motion * 5;
        x += Math.sin(age * 5 + i) * stroke.motion * .4;
        break;
      case "flow":
        x += Math.cos(p.angle) * age * stroke.motion * 3;
        y += Math.sin(p.angle) * age * stroke.motion * 3;
        break;
      case "sequence":
        if (age < .35) continue;
        break;
      case "pulse":
      case "twinkle":
        break;
    }

    let r = Math.max(1.2, stroke.size * (.18 + n1 * .28));
    c.globalAlpha = (stroke.opacity ?? 1) * (1 - age * .65);

    if (stroke.particle === "rain" || stroke.particle === "speed") {
      c.strokeStyle = c.fillStyle;
      c.lineWidth = Math.max(1, r * .45);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(p.angle) * r * 5, y + Math.sin(p.angle) * r * 5 + (stroke.particle === "rain" ? r * 4 : 0));
      c.stroke();
    } else if (stroke.particle === "smoke") {
      c.beginPath();
      c.arc(x, y, r * (1 + age * 2.2), 0, Math.PI * 2);
      c.fill();
    } else if (stroke.particle === "heart") {
      stampShape(c, "heart", x, y, r * 1.7, 0, stroke, t, i);
    } else if (stroke.particle === "spark" || stroke.particle === "fire") {
      stampShape(c, "spark", x, y, r * 1.5, 0, stroke, t, i);
    } else if (stroke.particle === "confetti") {
      c.fillRect(x-r, y-r*.5, r*2, r);
    } else if (stroke.particle === "fur") {
      c.strokeStyle = c.fillStyle;
      c.lineWidth = Math.max(1, r*.4);
      c.beginPath(); c.moveTo(x,y); c.lineTo(x + (n1-.5)*stroke.size*2, y - r*3); c.stroke();
    } else {
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
  }
  c.restore();
}

function renderNature(c, stroke, t) {
  const pts = sampledPath(stroke, Math.max(12, stroke.size * 1.8));
  c.save();
  setupStrokeContext(c, stroke, t);
  c.strokeStyle = c.fillStyle;

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const phase = t * stroke.speed + i * .7 + stroke.seed;
    if (stroke.nature === "grass") {
      const h = stroke.size * (1.8 + hashNoise(i + stroke.seed) * 1.6);
      const bend = Math.sin(phase) * stroke.motion;
      c.lineWidth = Math.max(1, stroke.size * .18);
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.quadraticCurveTo(p.x + bend*.35, p.y - h*.55, p.x + bend, p.y - h);
      c.stroke();
    } else if (stroke.nature === "leaves") {
      stampShape(c, "leaf", p.x, p.y + Math.sin(phase)*stroke.motion*.35, stroke.size*.8, p.angle + Math.sin(phase)*.6, stroke, t, i);
    } else if (stroke.nature === "flowers") {
      for (let k = 0; k < 5; k++) {
        const a = k * Math.PI * 2 / 5;
        c.beginPath();
        c.arc(p.x + Math.cos(a)*stroke.size*.55, p.y + Math.sin(a)*stroke.size*.55, stroke.size*.32, 0, Math.PI*2);
        c.fill();
      }
    } else if (stroke.nature === "vine") {
      if (i > ((t * stroke.speed * 8) % (pts.length + 8))) continue;
      stampShape(c, "leaf", p.x, p.y, stroke.size*.65, p.angle + (i%2?1.2:-1.2), stroke, t, i);
    }
  }
  c.restore();
}

function renderAura(c, stroke, t) {
  renderLine(c, stroke, t);
  c.save();
  setupStrokeContext(c, stroke, t);
  const pts = sampledPath(stroke, Math.max(12, stroke.size * 1.5));
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const phase = t * stroke.speed * 1.6 + i;
    const h = stroke.size * (1.5 + .7 * Math.sin(phase));
    c.globalAlpha = .18 + .22 * Math.abs(Math.sin(phase));
    c.beginPath();
    c.ellipse(
      p.x + Math.sin(phase)*stroke.motion*.25,
      p.y - h*.8,
      stroke.size*.7,
      h,
      0, 0, Math.PI*2
    );
    c.fill();
  }
  c.restore();
}

function renderStroke(c, stroke, timeMs) {
  const t = timeMs * 0.001;
  switch (stroke.renderer) {
    case "stamp": return renderStamp(c, stroke, t);
    case "particle": return renderParticle(c, stroke, t);
    case "ribbon": return renderRibbon(c, stroke, t);
    case "nature": return renderNature(c, stroke, t);
    case "aura": return renderAura(c, stroke, t);
    default: return renderLine(c, stroke, t);
  }
}

function renderFrame(time) {
  ctx.clearRect(0, 0, W, H);
  for (const layer of layers) {
    if (!layer.visible) continue;
    ctx.drawImage(layer.canvas, 0, 0);
    for (const stroke of layer.strokes) renderStroke(ctx, stroke, time);
  }
  requestAnimationFrame(renderFrame);
}

function exportPNG() {
  const out = makeCanvas();
  const octx = out.getContext("2d");
  octx.fillStyle = "#fff";
  octx.fillRect(0, 0, W, H);
  const now = performance.now();
  for (const layer of layers) {
    if (!layer.visible) continue;
    octx.drawImage(layer.canvas, 0, 0);
    for (const stroke of layer.strokes) renderStroke(octx, stroke, now);
  }
  const a = document.createElement("a");
  a.download = "animated-brush-frame.png";
  a.href = out.toDataURL("image/png");
  a.click();
}

brushTool.onclick = () => setTool("brush");
eraserTool.onclick = () => setTool("eraser");
document.querySelector("#undo").onclick = undo;
document.querySelector("#redo").onclick = redo;
document.querySelector("#clear").onclick = clearLayer;
document.querySelector("#export").onclick = exportPNG;
document.querySelector("#addLayer").onclick = () => {
  saveHistory();
  createLayer();
};

presetSearch.addEventListener("input", () => renderPresetList(presetSearch.value));

sizeInput.oninput = () => sizeOut.textContent = sizeInput.value;
motionInput.oninput = () => motionOut.textContent = motionInput.value;
speedInput.oninput = () => speedOut.textContent = speedInput.value;

canvas.addEventListener("pointerdown", beginStroke);
canvas.addEventListener("pointermove", moveStroke);
canvas.addEventListener("pointerup", endStroke);
canvas.addEventListener("pointercancel", endStroke);

createLayer("Layer 1");
renderPresetList();
requestAnimationFrame(renderFrame);
