// Skyline Courier — screenshot scene presets (?shot=...).
// One job: put the game into a photogenic, real gameplay state for the
// screenshots the maker takes. Nothing here is staged art: the game runs
// live from the preset state (autopilot trims the plane straight and level),
// so every shot is a real render of the game's own code.

import { RING_COURSE, RUNWAY_MAIN } from './config.js';

const PRESETS = {
  // cover: chasing the first ring with the runway behind, HUD lit
  cover: { mission: 'rings', x: 60, y: 95, z: -120, heading: 0.12, speed: 58, throttle: 0.72, autopilot: true },
  // rings: low over the valley, next gate dead ahead (approaching ring 1
  // from the south-west, slightly below it so the green gate clears the tail)
  rings: { mission: 'rings', x: -260, y: 92, z: -120, heading: -0.60, speed: 62, throttle: 0.78, autopilot: true },
  // landing: on final, gear down, flaps out, runway filling the view
  landing: { mission: 'landing', x: 26, y: 42, z: 640, heading: 0, speed: 40, throttle: 0.42, pitch: -0.055, flaps: true, gearDown: true, autopilot: true },
  // menu: the title screen over a parked plane
  menu: { mission: null },
};

export function getShotPreset() {
  const q = new URLSearchParams(window.location.search);
  const name = q.get('shot');
  if (!name || !PRESETS[name]) return null;
  return { name, ...PRESETS[name] };
}

// Place the plane for a shot and return whether autopilot should hold it.
export function applyShotPreset(preset, plane) {
  if (!preset || preset.x === undefined) return false;
  plane.x = preset.x;
  plane.y = preset.y;
  plane.z = preset.z;
  plane.heading = preset.heading;
  plane.speed = preset.speed;
  plane.throttle = preset.throttle;
  plane.pitch = 0;
  plane.roll = 0;
  plane.onGround = false;
  plane.airborne = true;
  if (preset.flaps) plane.flaps = true;
  if (preset.gearDown !== undefined) plane.gearDown = preset.gearDown;
  return !!preset.autopilot;
}

// Autopilot for shots only: hold heading, level flight, steady speed.
export function shotAutopilot(plane, preset, dt) {
  const targetPitch = preset.pitch ?? 0.02;
  plane.pitch += (targetPitch - plane.pitch) * Math.min(1, 2 * dt);
  plane.roll += (0 - plane.roll) * Math.min(1, 2 * dt);
  plane.heading += (preset.heading - plane.heading) * Math.min(1, 1.5 * dt);
  plane.throttle += (preset.throttle - plane.throttle) * Math.min(1, dt);
}
