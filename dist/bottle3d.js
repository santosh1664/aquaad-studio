// AquaAd bottle: real-time WebGL render. Units are millimetres.
// Label area is 73 x 170 mm: y = 7 to 177 on the bottle body.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const SIDES = ['front', 'right', 'back', 'left'];
const SIDE_ROT = { front: 0, right: Math.PI / 2, back: Math.PI, left: -Math.PI / 2 };
const COLS = 28;
const TOTAL_H = 236;

// One side of a rounded-square section, from corner middle to corner middle.
function sidePoint(hw, r, t) {
  const flat = (hw - r) * 2, arc = r * Math.PI / 4, L = flat + arc * 2, s = t * L;
  if (s < arc) { const a = -Math.PI / 4 + s / r; return { x: -(hw - r) + r * Math.sin(a), z: hw - r + r * Math.cos(a), nx: Math.sin(a), nz: Math.cos(a) }; }
  if (s <= arc + flat) return { x: -(hw - r) + (s - arc), z: hw, nx: 0, nz: 1 };
  const a = (s - arc - flat) / r; return { x: hw - r + r * Math.sin(a), z: hw - r + r * Math.cos(a), nx: Math.sin(a), nz: Math.cos(a) };
}
function rotY(p, a) { const c = Math.cos(a), s = Math.sin(a); return { x: p.x * c + p.z * s, z: -p.x * s + p.z * c, nx: p.nx * c + p.nz * s, nz: -p.nx * s + p.nz * c }; }

function smooth(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

function profile(inset, top) {
  const st = [];
  for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; st.push([6 - 6 * Math.cos(a), 30 + 6.5 * Math.sin(a), 13 - 3 * Math.sin(a)]); }
  st.push([178, 36.5, 10]);
  for (let i = 1; i <= 26; i++) { const t = i / 26; st.push([178 + 36 * t, 14.2 + 22.3 * (1 - smooth(t)), 10 + 4.2 * t]); }
  st.push([216, 14.2, 14.2], [217, 17.2, 17.2], [218.5, 17.2, 17.2], [219.5, 14.2, 14.2], [228, 14.2, 14.2]);
  return st.filter((s) => s[0] <= top).map((s) => { const hw = Math.max(1, s[1] - inset), r = Math.min(hw, Math.max(.5, s[2] - inset * .6)); return [s[0], hw, r]; });
}

function loft(stations, closeTop) {
  const n = 4 * COLS, pos = [], idx = [];
  stations.forEach(([y, hw, r]) => {
    SIDES.forEach((side) => {
      for (let i = 0; i < COLS; i++) { const p = rotY(sidePoint(hw, r, i / COLS), SIDE_ROT[side]); pos.push(p.x, y, p.z); }
    });
  });
  const rows = stations.length;
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < n; i++) {
    const a = j * n + i, b = j * n + (i + 1) % n, c = (j + 1) * n + i, d = (j + 1) * n + (i + 1) % n;
    idx.push(a, b, d, a, d, c);
  }
  const bottom = pos.length / 3; pos.push(0, stations[0][0], 0);
  for (let i = 0; i < n; i++) idx.push(bottom, (i + 1) % n, i);
  if (closeTop) {
    const c = pos.length / 3; pos.push(0, stations[rows - 1][0], 0);
    for (let i = 0; i < n; i++) idx.push(c, (rows - 1) * n + i, (rows - 1) * n + (i + 1) % n);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function sleeve(side) {
  const hw = 36.62, r = 10.05, y0 = 7, y1 = 177, cols = 40, rows = 2, pos = [], nor = [], uv = [], idx = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const t = i / cols, p = rotY(sidePoint(hw, r, t), SIDE_ROT[side]);
    pos.push(p.x, y0 + (y1 - y0) * j / rows, p.z); nor.push(p.nx, 0, p.nz); uv.push(t, j / rows);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1; idx.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function capGeometry() {
  const pts = [[0, 0], [15.7, 0], [15.9, .6], [15.9, 12.4], [15.2, 13.6], [13.4, 14.2], [0, 14.2]].map((p) => new THREE.Vector2(p[0], p[1]));
  const g = new THREE.LatheGeometry(pts, 144), a = g.attributes.position;
  for (let i = 0; i < a.count; i++) {
    const x = a.getX(i), y = a.getY(i), z = a.getZ(i), rr = Math.hypot(x, z);
    if (rr > 15.5 && y > 1 && y < 12) { const k = 1 + .012 * Math.sin(Math.atan2(z, x) * 72); a.setX(i, x * k); a.setZ(i, z * k); }
  }
  g.computeVertexNormals();
  return g;
}

// A dark studio with softboxes. It only exists to be reflected.
function studioEnv(renderer) {
  const s = new THREE.Scene(); s.background = new THREE.Color(0x030b10);
  const box = (w, h, x, y, z, v, col) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col || 0xffffff).multiplyScalar(v), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
  };
  box(2.2, 16, -9, 1, 5, 5.5);
  box(.8, 16, 9, 1, 3, 5);
  box(10, 3, 0, 9, 3, 1.6);
  box(14, 8, 0, -8, 2, .35, 0x7fd4e6);
  box(16, 10, 0, 0, -10, .7, 0x2a7f96);
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(s, .025);
  pm.dispose();
  return rt.texture;
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'), g = x.createRadialGradient(128, 128, 8, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,.85)'); g.addColorStop(.55, 'rgba(0,0,0,.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

export function createBottle(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping; // artwork colours must stay true

  const scene = new THREE.Scene();
  scene.environment = studioEnv(renderer);
  const key = new THREE.DirectionalLight(0xffffff, .55); key.position.set(-300, 500, 700); scene.add(key);

  const camera = new THREE.PerspectiveCamera(22, 1, 10, 5000);
  const tiltG = new THREE.Group(), spinG = new THREE.Group(), model = new THREE.Group();
  model.position.y = -TOTAL_H / 2; spinG.add(model); tiltG.add(spinG); scene.add(tiltG);

  // Sleeves: each side has its own canvas, so artwork can be redrawn on demand.
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const faces = {};
  SIDES.forEach((side) => {
    const c = document.createElement('canvas'); c.width = 768; c.height = 1788;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = maxAniso; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    const mat = new THREE.MeshPhysicalMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: .62, roughness: .5, metalness: 0, clearcoat: .55, clearcoatRoughness: .14, envMapIntensity: .62 });
    model.add(new THREE.Mesh(sleeve(side), mat));
    faces[side] = { canvas: c, ctx: c.getContext('2d'), tex };
  });

  const shellGeo = loft(profile(0, 999), false);
  const water = new THREE.Mesh(loft(profile(1.4, 199), true), new THREE.MeshPhysicalMaterial({ color: 0x4fc3dc, roughness: .08, metalness: 0, transparent: true, opacity: .3, envMapIntensity: 1.1, depthWrite: false }));
  water.renderOrder = 1; model.add(water);
  const shell = new THREE.Mesh(shellGeo, new THREE.MeshPhysicalMaterial({ color: 0xeaf8fc, roughness: .05, metalness: 0, transparent: true, opacity: .13, clearcoat: 1, clearcoatRoughness: .03, envMapIntensity: 2.4, side: THREE.DoubleSide, depthWrite: false }));
  shell.renderOrder = 2; model.add(shell);
  // Bright edges, the thing that makes clear plastic read as clear plastic.
  const rim = new THREE.Mesh(shellGeo, new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    vertexShader: 'varying vec3 n;varying vec3 v;void main(){vec4 m=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-m.xyz);gl_Position=projectionMatrix*m;}',
    fragmentShader: 'varying vec3 n;varying vec3 v;void main(){float f=pow(1.-abs(dot(normalize(n),normalize(v))),2.6);gl_FragColor=vec4(vec3(.72,.92,1.)*f*.8,f);}'
  }));
  rim.renderOrder = 3; model.add(rim);

  const cap = new THREE.Mesh(capGeometry(), new THREE.MeshPhysicalMaterial({ color: opts.capColor || 0x2bd4f0, emissive: opts.capColor || 0x2bd4f0, emissiveIntensity: .42, roughness: .34, metalness: 0, clearcoat: .6, clearcoatRoughness: .25, envMapIntensity: .8 }));
  cap.position.y = 221; model.add(cap);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(210, 210), new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, toneMapped: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -1; model.add(shadow);
  const shadowSize = opts.shadow || 1; shadow.scale.setScalar(shadowSize);

  let tA = 0, tT = 0, cA = 0, cT = 0, visible = true, raf = 0, disposed = false, lastSize = '';
  const fill = opts.fill || .88, snap = !!opts.reduced;

  function frameCamera(w, h) {
    const aspect = w / h, tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const byH = (TOTAL_H / fill / 2) / tan, byW = (86 / Math.min(.9, fill) / 2) / (tan * aspect);
    camera.aspect = aspect; camera.position.set(opts.offsetX || 0, 0, Math.max(byH, byW)); camera.lookAt(opts.offsetX || 0, 0, 0); camera.updateProjectionMatrix();
  }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const key2 = w + 'x' + h; if (key2 === lastSize) return; lastSize = key2;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false); frameCamera(w, h);
  }
  function apply(a, t) { spinG.rotation.y = THREE.MathUtils.degToRad(a); tiltG.rotation.x = THREE.MathUtils.degToRad(-t * .55); }
  function tick() {
    raf = requestAnimationFrame(tick);
    if (!visible || document.hidden) return;
    resize();
    if (snap) { cA = tA; cT = tT; } else { cA += (tA - cA) * .1; cT += (tT - cT) * .1; }
    apply(cA, cT);
    renderer.render(scene, camera);
  }
  const io = new IntersectionObserver((e) => { visible = e[0].isIntersecting; }, { rootMargin: '120px' }); io.observe(canvas);
  tick();

  if (opts.onDrag) {
    let down = false, px = 0, py = 0;
    canvas.style.touchAction = 'pan-y'; canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', (e) => { down = true; px = e.clientX; py = e.clientY; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
    canvas.addEventListener('pointermove', (e) => { if (!down) return; opts.onDrag(e.clientX - px, e.clientY - py); px = e.clientX; py = e.clientY; });
    const up = () => { down = false; canvas.style.cursor = 'grab'; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  }

  return {
    setRotation(a, t) { tA = a; tT = t; },
    jump(a, t) { tA = cA = a; tT = cT = t; },
    updateLabels(draw) {
      SIDES.forEach((side) => { const f = faces[side]; f.ctx.save(); draw(side, f.ctx, f.canvas.width, f.canvas.height); f.ctx.restore(); f.tex.needsUpdate = true; });
    },
    // Draws one straight-on view of the bottle into a 2D canvas (used for the mockup).
    snapshot(ctx, x, y, w, h, deg) {
      const pr = renderer.getPixelRatio();
      renderer.setPixelRatio(1); renderer.setSize(w * 2, h * 2, false);
      const fov = camera.fov; frameCamera(w, h);
      apply(deg, 0); shadow.scale.setScalar(.46);
      renderer.render(scene, camera);
      ctx.drawImage(canvas, x, y, w, h);
      shadow.scale.setScalar(shadowSize);
      camera.fov = fov; lastSize = ''; renderer.setPixelRatio(pr); resize();
    },
    dispose() { disposed = true; cancelAnimationFrame(raf); io.disconnect(); renderer.dispose(); }
  };
}
