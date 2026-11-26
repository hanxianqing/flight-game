// Skyline Courier — the aircraft model.
// One job: build the courier plane from primitives and animate its moving parts
// (propeller, control surfaces, gear) from the flight state.

import * as THREE from 'three';
import { PALETTE } from './config.js';

export function buildAircraft() {
  const plane = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: PALETTE.planeBody });
  const accent = new THREE.MeshLambertMaterial({ color: PALETTE.planeAccent });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a2e33 });
  const glass = new THREE.MeshPhongMaterial({ color: 0x9fd4e8, shininess: 90, specular: 0xffffff });

  // fuselage: tapered nose cone + main body + tail cone
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.85, 5.2, 12), body);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.z = 0.4;
  plane.add(fuselage);
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.15, 1.6, 12), accent);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = -3.7;
  plane.add(nose);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.85, 2.6, 10), body);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = 4.1;
  plane.add(tail);

  // canopy: glass bubble over the cockpit
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.95, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.scale.set(1, 0.75, 1.7);
  canopy.position.set(0, 0.75, -0.9);
  plane.add(canopy);

  // main wing (high wing, courier style) with red tips
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.28, 2.1), accent);
  wing.position.set(0, 1.05, -0.4);
  plane.add(wing);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 2.1), body);
    tip.position.set(side * 5.3, 1.05, -0.4);
    plane.add(tip);
    // wing struts
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 6), dark);
    strut.position.set(side * 2.6, 0.1, -0.4);
    strut.rotation.z = side * 0.7;
    plane.add(strut);
  }

  // tail: horizontal stabiliser + fin, both with accent tips
  const stab = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.18, 1.2), accent);
  stab.position.set(0, 0.35, 5.1);
  plane.add(stab);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.9, 1.5), body);
  fin.position.set(0, 1.0, 5.1);
  plane.add(fin);
  const finTip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 1.5), accent);
  finTip.position.set(0, 1.95, 5.1);
  plane.add(finTip);

  // propeller: spinner + two blades, spins with throttle
  const prop = new THREE.Group();
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.0, 12), accent);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -0.5;
  prop.add(spinner);
  for (const a of [0, Math.PI]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.6, 0.12), dark);
    blade.position.y = 0;
    const holder = new THREE.Group();
    holder.rotation.z = a;
    blade.position.y = 1.35;
    holder.add(blade);
    prop.add(holder);
  }
  prop.position.z = -4.5;
  plane.add(prop);

  // landing gear: two fixed wheels + tail wheel
  const gear = new THREE.Group();
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6, 6), dark);
    leg.position.set(side * 1.1, -1.0, -0.6);
    leg.rotation.z = side * 0.25;
    gear.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.35, 12), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.35, -1.75, -0.6);
    gear.add(wheel);
  }
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10), dark);
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -0.9, 4.6);
  gear.add(tailWheel);
  plane.add(gear);

  // navigation lights: red left, green right, white tail
  const lightMat = (c) => new THREE.MeshBasicMaterial({ color: c });
  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), lightMat(0xff2222));
  navL.position.set(-5.75, 1.05, -0.4);
  plane.add(navL);
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), lightMat(0x22ff44));
  navR.position.set(5.75, 1.05, -0.4);
  plane.add(navR);
  const navT = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), lightMat(0xffffff));
  navT.position.set(0, 0.4, 5.45);
  plane.add(navT);

  plane.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: plane, prop, gear, stab, fin };
}

// Pose the model from the flight state and spin the prop. time in seconds.
export function poseAircraft(model, state, time) {
  model.group.position.set(state.x, state.y, state.z);
  // three.js: heading 0 = -z. rotation.y = heading turns the nose correctly,
  // pitch about the local x, roll about the local z (nose axis).
  model.group.rotation.set(0, state.heading, 0);
  model.group.rotateX(state.pitch);
  model.group.rotateZ(state.roll);
  // propeller speed follows throttle; a parked plane's blades creep in the wind
  const spin = (2 + state.throttle * 42) * (state.onGround && state.throttle < 0.05 ? 0.15 : 1);
  model.prop.rotation.z += spin * 0.016;
  // gear hides when retracted (only while airborne and undamaged)
  model.gear.visible = state.gearDown || !state.airborne;
  // flaps droop the stabiliser a touch
  model.stab.rotation.x = state.flaps ? 0.12 : 0;
}
