// Skyline Courier — shared constants and mission definitions.
// One job: every number the rest of the game agrees on lives here.

export const WORLD = {
  size: 4200,          // terrain spans -2100..2100 on x and z
  waterLevel: 0,       // lake surface height
  maxSpeed: 95,        // m/s at full throttle
  cruiseSpeed: 55,
  stallSpeed: 24,      // below this the wing stops flying
  maxFuel: 100,
  maxDamage: 100,
};

export const RUNWAY_MAIN = {
  x: 0, z: 0, heading: 0,      // heading 0 = pointing -z (north)
  length: 620, width: 42,
};

export const RUNWAY_ISLAND = {
  x: 1450, z: -1250, heading: 0.35,
  length: 480, width: 36,
};

// Rings for the Ring Run mission: [x, y, z, radius]
export const RING_COURSE = [
  [0, 90, -450, 26],
  [-260, 110, -800, 26],
  [-520, 130, -1150, 26],
  [-300, 150, -1500, 24],
  [120, 120, -1650, 24],
  [520, 100, -1350, 26],
  [700, 130, -900, 26],
  [420, 110, -450, 24],
];

export const MISSIONS = [
  {
    id: 'rings',
    name: 'Ring Run',
    tag: 'Precision flying',
    brief: 'Thread all 8 rings in order. Smooth throttle and gentle banks score best. Watch your fuel.',
    fuel: 100, timeLimit: 300, startHeading: 0,
  },
  {
    id: 'landing',
    name: 'Valley Landing',
    tag: 'Come home gentle',
    brief: 'Take off from Meadow Field, fly the circuit and land back on runway 36. Gear down, flaps out, touch down soft and on the centreline.',
    fuel: 100, timeLimit: 420, startHeading: 0,
  },
  {
    id: 'delivery',
    name: 'Island Delivery',
    tag: 'Against the clock',
    brief: 'A parcel is due on Gull Island, 1.9 km north-east across the lake. Land on the island strip before the clock runs out.',
    fuel: 100, timeLimit: 360, startHeading: 0,
  },
];

export const SCORE = {
  ring: 100, ringSmoothBonus: 25,
  landingBase: 300, landingSoftBonus: 200,
  deliveryBase: 400, timeBonusPerSecond: 5,
  crashPenalty: 0,
};

// Colours of the one coherent style: late-afternoon alpine valley.
export const PALETTE = {
  skyTop: 0x3f6fb5,
  skyBottom: 0xf2c98a,
  fog: 0xd9c49a,
  grassLow: 0x5d8a3c,
  grassHigh: 0x7fae56,
  rock: 0x8a7a68,
  snow: 0xf4f6f8,
  water: 0x3f7fb5,
  sand: 0xcbb98a,
  runway: 0x3a3f45,
  runwayLine: 0xf5f2e8,
  planeBody: 0xd84a2f,   // courier red-orange
  planeAccent: 0xf5f2e8,
  ring: 0xffb020,
  ringNext: 0x2fd47a,
};
