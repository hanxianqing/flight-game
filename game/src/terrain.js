// Skyline Courier — the valley: terrain, lake, runways, trees, clouds, rings.
// One job: build the world the plane flies over, and answer heightAt(x, z)
// so the flight model and the renderer always agree about the ground.

import * as THREE from 'three';
import { WORLD, RUNWAY_MAIN, RUNWAY_ISLAND, RING_COURSE, PALETTE } from './config.js';

// --- deterministic noise (mulberry32 + value noise), no Math.random anywhere ---
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261126);
function hash2(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1;
}
function smooth(t) { return t * t * (3 - 2 * t); }
function valueNoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  const u = smooth(fx), v = smooth(fz);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function fbm(x, z) {
  return valueNoise(x, z) * 0.55 + valueNoise(x * 2.1, z * 2.1) * 0.3 + valueNoise(x * 4.3, z * 4.3) * 0.15;
}

// A runway's local frame: the strip's length axis in world (x, z).
// The mesh is a PlaneGeometry rotated x=-90 then z=heading, which maps its
// length direction to (-sin h, -cos h); these helpers use that same axis.
function stripAxes(r) {
  const s = Math.sin(r.heading), c = Math.cos(r.heading);
  return { axis: [-s, -c], perp: [c, -s] };
}
// World point -> runway-local (across, along) in metres.
function stripLocal(r, x, z) {
  const { axis, perp } = stripAxes(r);
  const dx = x - r.x, dz = z - r.z;
  return { across: dx * perp[0] + dz * perp[1], along: dx * axis[0] + dz * axis[1] };
}
// Runway-local (across, along) -> world point.
function stripPoint(r, across, along) {
  const { axis, perp } = stripAxes(r);
  return [r.x + perp[0] * across + axis[0] * along, r.z + perp[1] * across + axis[1] * along];
}

function flatAmount(across, along, rx, rz) {
  const dx = across / rx, dz = along / rz;
  const d = dx * dx + dz * dz;
  return d >= 1 ? 0 : 1 - smooth(Math.min(1, d));
}

export function heightAt(x, z) {
  const half = WORLD.size / 2;
  // bowl: mountains rise toward the map edges
  const edge = Math.max(Math.abs(x), Math.abs(z)) / half;
  const ridge = Math.pow(Math.max(0, edge - 0.55) / 0.45, 2) * 160;
  let h = 14 + fbm(x * 0.0016, z * 0.0016) * 26 + fbm(x * 0.006, z * 0.006) * 7 + ridge;
  // lake basin north-east
  const lakeD = Math.hypot(x - 900, z + 700) / 560;
  if (lakeD < 1) h = h * smooth(lakeD) + (-6) * (1 - smooth(lakeD));
  // flatten both runway strips to ground level, plus the cleared approach
  // corridor south of the main runway so a final approach never meets a hill
  const m1 = stripLocal(RUNWAY_MAIN, x, z);
  const f1 = flatAmount(m1.across, m1.along, 130, 400);
  const m2 = stripLocal(RUNWAY_ISLAND, x, z);
  const f2 = flatAmount(m2.across, m2.along, 230, 400);
  const approach = flatAmount(x, z - 530, 220, 280);
  // cleared approach to the island strip, along its axis from the south-east
  const islandApproach = flatAmount(x - 1587, z + 874, 170, 300);
  const f = Math.max(f1, f2, approach, islandApproach);
  return h * (1 - f);
}

// Is (x, z) on a runway strip? Returns { runway, offsetX } (metres off centreline) or null.
export function onRunway(x, z) {
  for (const r of [RUNWAY_MAIN, RUNWAY_ISLAND]) {
    const { across, along } = stripLocal(r, x, z);
    if (Math.abs(along) <= r.length / 2 && Math.abs(across) <= r.width / 2) {
      return { runway: r, offsetX: across, along };
    }
  }
  return null;
}

export function buildWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // --- terrain mesh, vertex-coloured by height ---
  const SEG = 180;
  const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cGrassLow = new THREE.Color(PALETTE.grassLow);
  const cGrassHigh = new THREE.Color(PALETTE.grassHigh);
  const cRock = new THREE.Color(PALETTE.rock);
  const cSnow = new THREE.Color(PALETTE.snow);
  const cSand = new THREE.Color(PALETTE.sand);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    if (h < 2) tmp.copy(cSand);
    else if (h < 45) tmp.copy(cGrassLow).lerp(cGrassHigh, h / 45);
    else if (h < 110) tmp.copy(cGrassHigh).lerp(cRock, (h - 45) / 65);
    else if (h < 150) tmp.copy(cRock).lerp(cSnow, (h - 110) / 40);
    else tmp.copy(cSnow);
    // subtle patch variation so the ground reads as fields, not plastic
    const patch = fbm(x * 0.008 + 7, z * 0.008 - 3) * 0.05;
    colors[i * 3] = tmp.r + patch; colors[i * 3 + 1] = tmp.g + patch; colors[i * 3 + 2] = tmp.b + patch;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  terrain.receiveShadow = true;
  group.add(terrain);

  // --- lake water ---
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(560, 48),
    new THREE.MeshPhongMaterial({ color: PALETTE.water, shininess: 120, specular: 0x99bbdd, transparent: true, opacity: 0.92 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(900, WORLD.waterLevel, -700);
  group.add(water);

  // --- runways: dark strip, white centreline dashes, threshold bars ---
  for (const r of [RUNWAY_MAIN, RUNWAY_ISLAND]) {
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(r.width, r.length),
      new THREE.MeshLambertMaterial({ color: PALETTE.runway }),
    );
    strip.rotation.x = -Math.PI / 2;
    strip.rotation.z = r.heading;
    strip.position.set(r.x, 0.4, r.z);
    strip.receiveShadow = true;
    group.add(strip);
    const lineMat = new THREE.MeshBasicMaterial({ color: PALETTE.runwayLine });
    const dashes = Math.floor(r.length / 40);
    for (let i = 0; i < dashes; i++) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 18), lineMat);
      dash.rotation.x = -Math.PI / 2;
      dash.rotation.z = r.heading;
      const along = -r.length / 2 + 20 + i * 40;
      const [wx, wz] = stripPoint(r, 0, along);
      dash.position.set(wx, 0.5, wz);
      group.add(dash);
    }
    // threshold bars at both ends
    for (const end of [-1, 1]) {
      for (let k = -2; k <= 2; k++) {
        const bar = new THREE.Mesh(new THREE.PlaneGeometry(3, 14), lineMat);
        bar.rotation.x = -Math.PI / 2;
        bar.rotation.z = r.heading;
        const [wx, wz] = stripPoint(r, k * 6, end * (r.length / 2 - 12));
        bar.position.set(wx, 0.5, wz);
        group.add(bar);
      }
    }
  }

  // --- trees: instanced cones + trunks, scattered where the ground is low ---
  const treeCount = 420;
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 4, 5);
  const crownGeo = new THREE.ConeGeometry(3.2, 11, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a4128 });
  const crownMat = new THREE.MeshLambertMaterial({ color: 0x2f6b2a });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, treeCount);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  let placed = 0, guard = 0;
  while (placed < treeCount && guard++ < 20000) {
    const x = (rand() * 2 - 1) * (WORLD.size / 2 - 80);
    const z = (rand() * 2 - 1) * (WORLD.size / 2 - 80);
    const h = heightAt(x, z);
    if (h < 4 || h > 55) continue;
    if (onRunway(x, z)) continue;
    if (Math.hypot(x - 900, z + 700) < 580) continue;
    const sc = 0.8 + rand() * 0.9;
    m.compose(new THREE.Vector3(x, h + 2, z), q, new THREE.Vector3(sc, sc, sc));
    trunks.setMatrixAt(placed, m);
    m.compose(new THREE.Vector3(x, h + 8 * sc, z), q, new THREE.Vector3(sc, sc, sc));
    crowns.setMatrixAt(placed, m);
    placed++;
  }
  trunks.count = placed; crowns.count = placed;
  trunks.castShadow = true; crowns.castShadow = true;
  group.add(trunks, crowns);

  // --- clouds: soft white billboard puffs drifting slowly ---
  const clouds = [];
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 26; i++) {
    const puff = new THREE.Group();
    const n = 3 + Math.floor(rand() * 3);
    for (let j = 0; j < n; j++) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(14 + rand() * 16, 10, 8), cloudMat);
      ball.position.set((rand() - 0.5) * 46, (rand() - 0.5) * 8, (rand() - 0.5) * 20);
      ball.scale.y = 0.55;
      puff.add(ball);
    }
    puff.position.set((rand() * 2 - 1) * 1800, 190 + rand() * 130, (rand() * 2 - 1) * 1800);
    puff.userData.speed = 1.5 + rand() * 2;
    clouds.push(puff);
    group.add(puff);
  }

  // --- ring course: glowing torus gates ---
  const rings = [];
  RING_COURSE.forEach(([x, y, z, radius], i) => {
    const ring = new THREE.Group();
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 1.6, 10, 40),
      new THREE.MeshBasicMaterial({ color: PALETTE.ring }),
    );
    ring.add(torus);
    const inner = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.5, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }),
    );
    ring.add(inner);
    ring.position.set(x, y, z);
    // face the direction the course runs
    const next = RING_COURSE[(i + 1) % RING_COURSE.length];
    ring.lookAt(next[0], next[1], next[2]);
    ring.userData.index = i;
    ring.userData.baseY = y;
    rings.push(ring);
    group.add(ring);
  });

  // --- windsock near the main runway, and a little hangar ---
  const sock = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 14, 6), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
  pole.position.y = 7;
  sock.add(pole);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1.6, 7, 8, 1, true), new THREE.MeshLambertMaterial({ color: 0xff7722, side: THREE.DoubleSide }));
  cone.rotation.z = Math.PI / 2;
  cone.position.set(3.5, 13, 0);
  sock.add(cone);
  sock.position.set(34, 0, 120);
  sock.userData.cone = cone;
  group.add(sock);

  const hangar = new THREE.Mesh(
    new THREE.BoxGeometry(36, 14, 26),
    new THREE.MeshLambertMaterial({ color: 0x8a94a0 }),
  );
  hangar.position.set(-70, 7, 60);
  hangar.castShadow = true;
  group.add(hangar);
  const roof = new THREE.Mesh(
    new THREE.CylinderGeometry(13, 13, 36, 12, 1, false, 0, Math.PI),
    new THREE.MeshLambertMaterial({ color: 0x6a7480 }),
  );
  roof.rotation.z = Math.PI / 2;
  roof.rotation.y = Math.PI / 2;
  roof.position.set(-70, 14, 60);
  group.add(roof);

  return { group, rings, clouds, windsock: sock };
}

// Animate ambient world motion: clouds drift, rings bob and pulse.
export function animateWorld(world, time) {
  for (const c of world.clouds) {
    c.position.x += c.userData.speed * 0.016;
    if (c.position.x > 2000) c.position.x = -2000;
  }
  world.rings.forEach((ring, i) => {
    ring.position.y = ring.userData.baseY + Math.sin(time * 0.9 + i * 1.3) * 2.5;
  });
  if (world.windsock) {
    world.windsock.userData.cone.rotation.y = Math.sin(time * 0.4) * 0.4;
  }
}
