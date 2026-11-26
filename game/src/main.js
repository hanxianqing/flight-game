// Skyline Courier — the game loop, chase camera and state machine.
// One job: own the frame. Everything else (flight, world, HUD, missions)
// is a module this file calls; this file only wires them together.

import * as THREE from 'three';
import { WORLD, RUNWAY_MAIN, PALETTE } from './config.js';
import { createInput } from './input.js';
import { createPlane, stepFlight } from './physics.js';
import { buildWorld, animateWorld, heightAt } from './terrain.js';
import { buildAircraft, poseAircraft } from './aircraft.js';
import { buildHud } from './hud.js';
import { createMission, stepMission } from './missions.js';
import { createAudio } from './audio.js';
import { getShotPreset, applyShotPreset, shotAutopilot } from './shots.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(PALETTE.fog, 900, 3400);

// gradient sky dome (canvas texture, no files)
function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2e5da8');
  grad.addColorStop(0.45, '#7fa8d8');
  grad.addColorStop(0.72, '#f2c98a');
  grad.addColorStop(1, '#e8b478');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(4200, 24, 16),
  new THREE.MeshBasicMaterial({ map: makeSkyTexture(), side: THREE.BackSide, fog: false }),
);
scene.add(sky);

// late-afternoon sun + soft sky fill
const sun = new THREE.DirectionalLight(0xffe0b0, 2.4);
sun.position.set(1200, 900, 600);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
sun.shadow.camera.far = 4000;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0x9db8dd, 0x5d6b46, 1.05));

const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 9000);
scene.add(camera);

const world = buildWorld(scene);
const aircraft = buildAircraft();
scene.add(aircraft.group);

const input = createInput(canvas);
const hud = buildHud();
const audio = createAudio();

let phase = 'menu'; // menu | flying | paused | ended
let plane = createPlane({ startHeading: 0, fuel: 100 });
let mission = null;
let shotPreset = getShotPreset();
let shotAuto = false;
const camPos = new THREE.Vector3(0, 40, 260);
const camLook = new THREE.Vector3(0, 10, 0);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

function startMission(id) {
  mission = createMission(id);
  plane = createPlane(mission.def);
  // park at the runway threshold, nose into the wind
  plane.x = RUNWAY_MAIN.x;
  plane.z = RUNWAY_MAIN.z + RUNWAY_MAIN.length / 2 - 40;
  plane.y = heightAt(plane.x, plane.z) + 1.2;
  plane.heading = mission.def.startHeading;
  plane.gearDown = true;
  phase = 'flying';
  hud.hideScreen();
  audio.ensure();
  hud.toast(`${mission.def.name} — ${mission.def.tag}`);
  if (shotPreset && shotPreset.mission === id) {
    shotAuto = applyShotPreset(shotPreset, plane);
  }
}

window.addEventListener('start-mission', (e) => startMission(e.detail));

function toMenu() {
  phase = 'menu';
  mission = null;
  plane = createPlane({ startHeading: 0, fuel: 100 });
  plane.x = 0; plane.z = 220; plane.y = heightAt(0, 220) + 1.2;
  hud.showMenu();
  audio.setFlying(0, 0, false);
}

function endMission() {
  phase = 'ended';
  hud.showEnd(mission, plane);
  audio.setFlying(0, 0, false);
}

function handleFlightEvents(events) {
  for (const ev of events) {
    if (ev.type === 'ring') {
      hud.toast(`Ring ${ev.total} — +${ev.gained}${ev.smooth ? ' (smooth!)' : ''}`);
      audio.blip(880, 0.12);
      setTimeout(() => audio.blip(1320, 0.14), 110);
    } else if (ev.type === 'takeoff') {
      hud.toast('Airborne — fly the circuit and land');
    } else if (ev.type === 'landed') {
      hud.toast('Touchdown!');
      audio.blip(660, 0.15);
    } else if (ev.type === 'hard-landing') {
      hud.toast('Hard landing — the airframe took damage');
      audio.blip(220, 0.25);
    } else if (ev.type === 'field-landing') {
      hud.toast('Rough field landing — the airframe took damage');
      audio.blip(220, 0.25);
    } else if (ev.type === 'crashed') {
      audio.blip(160, 0.4);
    } else if (ev.type === 'fuel-empty') {
      hud.toast('Fuel empty — glide it down');
    } else if (ev.type === 'mission-end') {
      endMission();
    }
  }
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const time = now / 1000;

  const pressed = input.consumePressed();

  if (phase === 'menu') {
    if (pressed.has('mission1')) startMission('rings');
    else if (pressed.has('mission2')) startMission('landing');
    else if (pressed.has('mission3')) startMission('delivery');
    // idle camera: slow orbit around the parked plane
    const a = time * 0.05;
    camPos.set(Math.sin(a) * 60, 26, 220 + Math.cos(a) * 60);
    camera.position.copy(camPos);
    camera.lookAt(0, 8, 220);
    poseAircraft(aircraft, plane, time);
    animateWorld(world, time);
    renderer.render(scene, camera);
    return;
  }

  if (phase === 'paused') {
    if (pressed.has('pause') || pressed.has('confirm')) {
      phase = 'flying';
      hud.hideScreen();
    } else if (pressed.has('restart')) {
      startMission(mission.def.id);
    } else if (pressed.has('menu')) {
      toMenu();
    }
    renderer.render(scene, camera);
    return;
  }

  if (phase === 'ended') {
    if (pressed.has('restart')) startMission(mission.def.id);
    else if (pressed.has('menu')) toMenu();
    else if (pressed.has('mission1')) startMission('rings');
    else if (pressed.has('mission2')) startMission('landing');
    else if (pressed.has('mission3')) startMission('delivery');
    // keep the world alive behind the end screen
    animateWorld(world, time);
    renderer.render(scene, camera);
    return;
  }

  // --- flying ---
  if (pressed.has('pause')) {
    phase = 'paused';
    hud.showPause(mission);
    renderer.render(scene, camera);
    return;
  }
  if (pressed.has('restart')) { startMission(mission.def.id); return; }
  if (pressed.has('menu')) { toMenu(); return; }
  if (pressed.has('flaps')) { plane.flaps = !plane.flaps; hud.toast(plane.flaps ? 'Flaps down' : 'Flaps up'); }
  if (pressed.has('gear')) {
    if (plane.airborne) { plane.gearDown = !plane.gearDown; hud.toast(plane.gearDown ? 'Gear down' : 'Gear up'); }
    else hud.toast('Gear is already down on the ground');
  }

  // autopilot runs after the flight step so its trim survives the frame
  const flightEvents = stepFlight(plane, input.state, dt);
  if (shotAuto && shotPreset) shotAutopilot(plane, shotPreset, dt);
  const missionEvents = stepMission(mission, plane, dt, world.rings);
  handleFlightEvents([...flightEvents, ...missionEvents]);

  poseAircraft(aircraft, plane, time);
  animateWorld(world, time);
  audio.setFlying(plane.throttle, plane.speed, true);

  // --- chase camera: behind and above, smoothed, never fighting the pilot ---
  const fwdX = -Math.sin(plane.heading), fwdZ = -Math.cos(plane.heading);
  const zoom = 1 + input.state.cameraZoom * 0.35;
  const dist = 20 * zoom;
  const height = 6 + input.state.cameraOrbitY * 14;
  const sideX = Math.cos(plane.heading), sideZ = -Math.sin(plane.heading);
  const orbit = input.state.cameraOrbitX;
  const targetPos = new THREE.Vector3(
    plane.x - fwdX * dist + sideX * orbit * 18,
    plane.y + height,
    plane.z - fwdZ * dist + sideZ * orbit * 18,
  );
  // keep the camera out of the terrain
  const groundBelow = heightAt(targetPos.x, targetPos.z);
  targetPos.y = Math.max(targetPos.y, groundBelow + 4);
  camPos.lerp(targetPos, Math.min(1, 5 * dt));
  const lookTarget = new THREE.Vector3(
    plane.x + fwdX * 30,
    plane.y + 2 + plane.pitch * 18,
    plane.z + fwdZ * 30,
  );
  camLook.lerp(lookTarget, Math.min(1, 8 * dt));
  camera.position.copy(camPos);
  camera.lookAt(camLook);

  // sun follows the plane so shadows stay local
  sun.position.set(plane.x + 1200, 900, plane.z + 600);
  sun.target.position.set(plane.x, 0, plane.z);
  sun.target.updateMatrixWorld();

  hud.update(plane, mission, phase);
  renderer.render(scene, camera);
}

// --- boot ---
if (shotPreset && shotPreset.name === 'menu') {
  toMenu();
} else if (shotPreset) {
  startMission(shotPreset.mission);
} else {
  toMenu();
}
requestAnimationFrame(frame);
