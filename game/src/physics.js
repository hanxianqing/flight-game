// Skyline Courier — arcade flight model.
// One job: turn throttle / stick / rudder into position, speed and attitude.
// Pure numbers in, pure numbers out; rendering never leaks in here.

import { WORLD } from './config.js';
import { heightAt, onRunway } from './terrain.js';

export function createPlane(mission) {
  return {
    // position in metres, y up; heading 0 = north (-z), radians
    x: 0, y: 2, z: 220,
    heading: mission.startHeading,
    pitch: 0, roll: 0,
    speed: 0, throttle: 0,
    fuel: mission.fuel,
    damage: 0,
    flaps: false, gearDown: true,
    verticalSpeed: 0,
    onGround: true,
    airborne: false,
    stalled: false,
    crashed: false,
    crashReason: '',
    landed: false,
    hardLanded: false,
    fieldLanded: false,
    touchdownVs: 0,
    touchdownOffset: 0,
    distanceFlown: 0,
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

// dt in seconds. input is the frame's control state. Returns events for the game.
export function stepFlight(plane, input, dt) {
  const events = [];
  if (plane.crashed || plane.landed) return events;

  // --- throttle: Shift spools up, Ctrl spools down, 0.35/s ---
  if (input.throttleUp) plane.throttle = clamp(plane.throttle + 0.35 * dt, 0, 1);
  if (input.throttleDown) plane.throttle = clamp(plane.throttle - 0.35 * dt, 0, 1);

  // --- stick: pitch and roll ease toward the commanded bank/attitude ---
  const pitchRate = 0.55, rollRate = 1.5;
  let targetPitch = 0, targetRoll = 0;
  if (input.pitchUp) targetPitch = 0.30;
  if (input.pitchDown) targetPitch = -0.22;
  if (input.rollLeft) targetRoll = 0.85;
  if (input.rollRight) targetRoll = -0.85;
  plane.pitch = lerp(plane.pitch, targetPitch, Math.min(1, pitchRate * dt * 3));
  plane.roll = lerp(plane.roll, targetRoll, Math.min(1, rollRate * dt * 3));

  // --- rudder: gentle heading nudge, stronger on the ground ---
  const yawAuthority = plane.onGround ? 0.9 : 0.22;
  if (input.yawLeft) plane.heading += yawAuthority * dt;
  if (input.yawRight) plane.heading -= yawAuthority * dt;

  // --- speed: thrust pulls toward the throttle's target speed; flaps add drag ---
  const flapDrag = plane.flaps ? 0.10 : 0;
  const targetSpeed = WORLD.maxSpeed * plane.throttle * (1 - flapDrag * 0.35);
  const accel = plane.speed < targetSpeed ? 0.55 : 0.35; // spool up faster than it slows
  plane.speed = clamp(plane.speed + (targetSpeed - plane.speed) * accel * dt, 0, WORLD.maxSpeed * 1.05);

  // --- lift and stall ---
  const stallSpeed = plane.flaps ? WORLD.stallSpeed - 5 : WORLD.stallSpeed;
  plane.stalled = plane.speed < stallSpeed && !plane.onGround;
  const liftFactor = clamp(plane.speed / (stallSpeed * 1.6), 0, 1);

  // --- turning: a banked wing turns the nose (left bank = left turn) ---
  const turnRate = Math.sin(plane.roll) * clamp(plane.speed / 55, 0.2, 1.4) * 0.55;
  plane.heading += turnRate * dt;

  // --- vertical motion: pitch converts speed to climb; a stalled wing sinks ---
  let climb = Math.sin(plane.pitch) * plane.speed * liftFactor;
  if (plane.stalled) climb -= (stallSpeed - plane.speed) * 0.55;
  if (plane.onGround) climb = Math.max(0, climb);
  plane.verticalSpeed = climb;
  plane.y += climb * dt;

  // --- horizontal motion along the nose ---
  const forwardX = -Math.sin(plane.heading) * Math.cos(plane.pitch);
  const forwardZ = -Math.cos(plane.heading) * Math.cos(plane.pitch);
  const groundSpeed = plane.onGround ? plane.speed : plane.speed * Math.cos(plane.pitch);
  plane.x += forwardX * groundSpeed * dt;
  plane.z += forwardZ * groundSpeed * dt;
  plane.distanceFlown += groundSpeed * dt;

  // --- fuel: thirst grows with throttle; empty tank = glider ---
  // A full tank lasts a whole sortie at cruise, less at full throttle:
  // throttle discipline is a real decision, not a countdown to a ditch.
  const burn = (0.04 + plane.throttle * 0.22) * dt;
  plane.fuel = Math.max(0, plane.fuel - burn);
  if (plane.fuel <= 0 && plane.throttle > 0) {
    plane.throttle = 0;
    events.push({ type: 'fuel-empty' });
  }

  // --- ground contact, with hysteresis so rolling over a bump or a dip
  // never reads as a takeoff followed by a crash landing ---
  const ground = heightAt(plane.x, plane.z);
  const runway = onRunway(plane.x, plane.z);
  const clearance = plane.y - ground;
  if (plane.onGround) {
    if (plane.verticalSpeed <= 0 && clearance <= 2.5) {
      // rolling: wheels stay on the surface, bumps and dips included
      plane.y = ground + 1.2;
      plane.onGround = true;
    } else if (clearance > 2.5) {
      // the wing has actually lifted the plane off the ground
      plane.onGround = false;
      plane.airborne = true;
    }
    // climbing with clearance in (1.2, 2.5]: keep rising, no snap
  } else if (clearance <= 1.2) {
    // touchdown: judge it — but only if the plane has actually flown;
    // a plane that never left the ground just settles back down.
    plane.y = ground + 1.2;
    if (!plane.airborne) {
      plane.onGround = true;
    } else if (runway && plane.gearDown && plane.verticalSpeed > -6.5 && plane.speed < 62 && Math.abs(plane.roll) < 0.35) {
      plane.touchdownVs = -plane.verticalSpeed;
      plane.touchdownOffset = Math.abs(runway.offsetX);
      plane.landed = true;
      plane.onGround = true;
      events.push({ type: 'landed', runway });
    } else if (runway && plane.gearDown && plane.verticalSpeed > -9 && plane.speed < 70) {
      // hard but survivable landing
      plane.touchdownVs = -plane.verticalSpeed;
      plane.touchdownOffset = Math.abs(runway.offsetX);
      plane.hardLanded = true;
      plane.damage += 18 + Math.max(0, -plane.verticalSpeed - 6.5) * 6;
      plane.onGround = true;
      plane.speed *= 0.55;
      events.push({ type: 'hard-landing', runway });
      if (plane.damage >= WORLD.maxDamage) {
        plane.crashed = true; plane.crashReason = 'The airframe gave up after the hard landing.';
        events.push({ type: 'crashed' });
      }
    } else if (!runway && plane.gearDown && plane.verticalSpeed > -6.5 && plane.speed < 62) {
      // rough field landing: a bush plane can put down on grass, but it hurts
      plane.touchdownVs = -plane.verticalSpeed;
      plane.touchdownOffset = 999;
      plane.fieldLanded = true;
      plane.damage += 25;
      plane.onGround = true;
      plane.speed *= 0.5;
      events.push({ type: 'field-landing' });
      if (plane.damage >= WORLD.maxDamage) {
        plane.crashed = true; plane.crashReason = 'The airframe gave up after the hard landing.';
        events.push({ type: 'crashed' });
      }
    } else {
      plane.touchdownVs = -plane.verticalSpeed;
      plane.touchdownOffset = runway ? Math.abs(runway.offsetX) : 999;
      plane.crashed = true;
      const inLake = Math.hypot(plane.x - 900, plane.z + 700) < 560;
      plane.crashReason = runway
        ? (plane.gearDown ? 'You hit the runway far too hard.' : 'You landed gear-up on the runway.')
        : (inLake ? 'You ditched in the lake.' : 'You flew into the terrain.');
      events.push({ type: 'crashed' });
    }
  } else {
    if (clearance > 8) plane.airborne = true;
  }

  // --- rolling on the ground: brakes and drag slow the plane ---
  // (below rotation speed the nose stays level; on the takeoff roll the
  // pilot may rotate freely)
  if (plane.onGround) {
    const decel = input.brakes ? 14 : 3.5;
    plane.speed = Math.max(0, plane.speed - decel * dt);
    if (plane.speed < 15) {
      plane.pitch = lerp(plane.pitch, 0, Math.min(1, 4 * dt));
      plane.roll = lerp(plane.roll, 0, Math.min(1, 4 * dt));
    }
    if (plane.speed < 2 && plane.throttle < 0.05 && plane.airborne) {
      events.push({ type: 'stopped' });
    }
  }

  // --- world bounds: turn the pilot back gently ---
  const bound = WORLD.size / 2 - 60;
  if (Math.abs(plane.x) > bound || Math.abs(plane.z) > bound) {
    plane.x = clamp(plane.x, -bound, bound);
    plane.z = clamp(plane.z, -bound, bound);
    plane.heading += Math.PI * dt * 0.2;
    events.push({ type: 'edge' });
  }

  return events;
}
