// Skyline Courier — missions, objectives and scoring.
// One job: know what "done" means for each mission and keep the score.

import { MISSIONS, SCORE, RING_COURSE, RUNWAY_ISLAND } from './config.js';

export function createMission(missionId) {
  const def = MISSIONS.find((m) => m.id === missionId) ?? MISSIONS[0];
  return {
    def,
    score: 0,
    timeLeft: def.timeLimit,
    ringsPassed: 0,
    nextRing: 0,
    ringTimes: [],
    objective: '',
    status: 'flying', // flying | won | lost
    endReason: '',
    landingQuality: null, // { vs, offset, rating }
    delivered: false,
    // distance bookkeeping for the delivery mission
    startDistance: 0,
  };
}

function ringDistanceSq(plane, i) {
  const [x, y, z] = RING_COURSE[i];
  const dx = plane.x - x, dy = plane.y - y, dz = plane.z - z;
  return dx * dx + dy * dy + dz * dz;
}

function landingRating(vs, offset) {
  if (vs <= 2.5 && offset <= 6) return 'Butter smooth';
  if (vs <= 4.5 && offset <= 12) return 'Nice and steady';
  if (vs <= 6.5 && offset <= 20) return 'A bit firm';
  return 'Rough, but down';
}

// dt in seconds. plane is the flight state. worldRings are the torus meshes
// (so the next gate glows green). Returns events for the game.
export function stepMission(mission, plane, dt, worldRings) {
  const events = [];
  if (mission.status !== 'flying') return events;

  mission.timeLeft -= dt;
  if (mission.timeLeft <= 0) {
    mission.status = 'lost';
    mission.endReason = 'Out of time.';
    events.push({ type: 'mission-end' });
    return events;
  }

  if (plane.fieldLanded) {
    mission.status = 'lost';
    mission.endReason = mission.def.id === 'landing'
      ? 'You put it down in a field — the runway was right there.'
      : mission.def.id === 'delivery'
        ? 'You put it down in a field — the parcel belongs on the island strip.'
        : 'You put it down in a field, rings unfinished.';
    events.push({ type: 'mission-end' });
    return events;
  }

  if (mission.def.id === 'rings') {
    const i = mission.nextRing;
    const [x, y, z, radius] = RING_COURSE[i];
    const dist = Math.sqrt(ringDistanceSq(plane, i));
    // A gate counts when the plane flies through its disc: close to the centre
    // in 3D (the rings are wide, the course is long, so this only fires on a
    // real pass, not a fly-by).
    if (dist < radius * 0.72 && plane.airborne) {
      // crossed the gate plane close to its centre
      const smooth = Math.abs(plane.roll) < 0.4 && Math.abs(plane.pitch) < 0.2;
      const gained = SCORE.ring + (smooth ? SCORE.ringSmoothBonus : 0);
      mission.score += gained;
      mission.ringsPassed++;
      mission.ringTimes.push(mission.def.timeLimit - mission.timeLeft);
      mission.nextRing++;
      events.push({ type: 'ring', index: i, gained, smooth, total: mission.ringsPassed });
      if (mission.nextRing >= RING_COURSE.length) {
        mission.status = 'won';
        mission.endReason = `All ${RING_COURSE.length} rings threaded.`;
        const timeBonus = Math.round(mission.timeLeft) * 2;
        mission.score += timeBonus;
        events.push({ type: 'mission-end', timeBonus });
      }
    }
    // highlight the next gate green, the rest amber
    worldRings.forEach((ring, ri) => {
      const mat = ring.children[0].material;
      mat.color.setHex(ri === mission.nextRing ? 0x2fd47a : 0xffb020);
    });
    mission.objective = `Ring ${Math.min(mission.nextRing + 1, RING_COURSE.length)} of ${RING_COURSE.length} — ${Math.round(dist)} m ahead`;
  }

  if (mission.def.id === 'landing') {
    if (plane.airborne && !mission._tookOff) {
      mission._tookOff = true;
      events.push({ type: 'takeoff' });
    }
    if (plane.landed || plane.hardLanded) {
      const vs = plane.touchdownVs, offset = plane.touchdownOffset;
      mission.landingQuality = { vs, offset, rating: landingRating(vs, offset) };
      const softBonus = Math.max(0, Math.round(SCORE.landingSoftBonus * (1 - vs / 6.5)));
      const centreBonus = Math.max(0, Math.round(100 * (1 - offset / 21)));
      mission.score += SCORE.landingBase + softBonus + centreBonus;
      mission.status = 'won';
      mission.endReason = `${mission.landingQuality.rating} — touchdown ${vs.toFixed(1)} m/s, ${offset.toFixed(0)} m off centreline.`;
      events.push({ type: 'mission-end' });
    } else if (plane.crashed) {
      mission.status = 'lost';
      mission.endReason = plane.crashReason;
      events.push({ type: 'mission-end' });
    } else {
      mission.objective = mission._tookOff
        ? 'Circuit complete — line up on runway 36 and land'
        : 'Full throttle, lift off, then come back and land';
    }
  }

  if (mission.def.id === 'delivery') {
    const target = RUNWAY_ISLAND;
    const dist = Math.hypot(plane.x - target.x, plane.z - target.z);
    if (mission.startDistance === 0) mission.startDistance = dist;
    if (plane.landed || plane.hardLanded) {
      const landedHere = Math.hypot(plane.x - target.x, plane.z - target.z) < 400;
      if (landedHere) {
        mission.delivered = true;
        const timeBonus = Math.round(mission.timeLeft) * SCORE.timeBonusPerSecond;
        mission.score += SCORE.deliveryBase + timeBonus;
        mission.status = 'won';
        mission.endReason = `Parcel delivered with ${Math.round(mission.timeLeft)} s to spare.`;
        events.push({ type: 'mission-end', timeBonus });
      } else {
        mission.status = 'lost';
        mission.endReason = 'Wrong airfield — the parcel belongs on Gull Island.';
        events.push({ type: 'mission-end' });
      }
    } else if (plane.crashed) {
      mission.status = 'lost';
      mission.endReason = plane.crashReason;
      events.push({ type: 'mission-end' });
    } else {
      mission.objective = `Gull Island strip — ${Math.round(dist)} m away, ${Math.round(mission.timeLeft)} s left`;
    }
  }

  if (mission.def.id === 'rings' && plane.crashed) {
    mission.status = 'lost';
    mission.endReason = plane.crashReason;
    events.push({ type: 'mission-end' });
  }

  if (plane.fuel <= 0 && !plane.airborne && plane.speed < 2 && mission.status === 'flying') {
    mission.status = 'lost';
    mission.endReason = 'Out of fuel, stranded on the ground.';
    events.push({ type: 'mission-end' });
  }

  return events;
}
