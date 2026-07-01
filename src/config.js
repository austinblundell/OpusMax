// ---------------------------------------------------------------------------
// Global configuration — real NBA dimensions (meters) and tuned game feel.
// One foot = 0.3048 m. The court runs along X, width along Z, up is +Y.
// Center court is the origin. The playable hoop is at +X.
// ---------------------------------------------------------------------------

const FT = 0.3048;
const IN = 0.0254;

export const COURT = {
  LENGTH: 94 * FT,          // 28.65 m
  WIDTH: 50 * FT,           // 15.24 m
  HALF_LENGTH: 47 * FT,
  HALF_WIDTH: 25 * FT,
  LINE_W: 0.05,             // painted line width
  // Three-point geometry
  THREE_RADIUS: 23.75 * FT, // arc radius from basket (top of key)
  THREE_CORNER: 22 * FT,    // corner distance
  THREE_SIDE_Z: 22 * FT,    // z of the straight corner segments
  // Key / paint
  KEY_WIDTH: 16 * FT,
  FT_LINE_FROM_BASE: 19 * FT, // free-throw line ~19 ft from baseline
  FT_CIRCLE_R: 6 * FT,
  RESTRICTED_R: 4 * FT,
  CENTER_R: 6 * FT,
};

export const HOOP = {
  RIM_HEIGHT: 10 * FT,       // 3.048 m
  RIM_RADIUS: 9 * IN,        // 0.2286 m (18" diameter)
  RIM_TUBE: 0.018,
  BACKBOARD_W: 6 * FT,       // 1.8288 m
  BACKBOARD_H: 3.5 * FT,     // 1.0668 m
  BACKBOARD_BOTTOM: 9 * FT,  // board bottom ~ few inches below rim; rim centered on lower half
  BACKBOARD_FROM_BASE: 4 * FT,
  RIM_FROM_BACKBOARD: 15 * IN,
  NET_LENGTH: 0.4,
  NET_SEGMENTS: 12,
};

// Basket X position (center of rim) measured from origin, on +X side.
HOOP.RIM_X = COURT.HALF_LENGTH - HOOP.BACKBOARD_FROM_BASE - HOOP.RIM_FROM_BACKBOARD;
HOOP.BACKBOARD_X = COURT.HALF_LENGTH - HOOP.BACKBOARD_FROM_BASE;
HOOP.POSITION = { x: HOOP.RIM_X, y: HOOP.RIM_HEIGHT, z: 0 };

export const BALL = {
  RADIUS: 4.7 * IN,          // 0.119 m (regulation ~9.5" diameter)
  MASS: 0.62,                // kg
  RESTITUTION: 0.72,         // bounciness off floor
  RIM_RESTITUTION: 0.55,
  BACKBOARD_RESTITUTION: 0.62,
  ROLL_FRICTION: 0.55,
  AIR_DRAG: 0.0025,
};

export const PHYSICS = {
  GRAVITY: -9.81,
  FIXED_DT: 1 / 120,         // physics substep
  MAX_SUBSTEPS: 6,
};

export const PLAYER = {
  HEIGHT: 2.0,               // ~6'7"
  RADIUS: 0.32,
  WALK_SPEED: 4.2,
  RUN_SPEED: 7.4,
  ACCEL: 34,
  FRICTION: 12,
  TURN_RATE: 12,
  DRIBBLE_HEIGHT: 0.95,
  HAND_HEIGHT: 1.55,
};

export const SHOT = {
  MIN_CHARGE: 0.28,          // seconds to reach usable power
  MAX_CHARGE: 1.05,          // full meter
  PERFECT_LO: 0.86,          // fraction of meter that is the "green" release window
  PERFECT_HI: 0.98,
  RELEASE_HEIGHT: 2.35,      // where the ball leaves the hand
  BASE_ARC: 52 * Math.PI / 180,
  // accuracy falloff with distance (meters)
  MAX_RANGE: 9.0,
};

export const CAMERA = {
  MODES: ['broadcast', 'follow', 'action'],
  FOV: 52,
  NEAR: 0.1,
  FAR: 400,
};

export const COLORS = {
  floor: 0xb07a3e,
  floorDark: 0x8a5a28,
  paint: 0xc2452e,
  lineWhite: 0xf4efe6,
  ballOrange: 0xd7622a,
  ballLine: 0x1c1108,
  rim: 0xe8622a,
  skin: 0x8d5a3b,
  jerseyHome: 0x1666c4,
  jerseyAway: 0xd23a3a,
  crowd: [0x2a3550, 0x394463, 0x1f2942, 0x4a3a55, 0x2f4a44],
};

export const MODES = {
  freestyle: { clock: null, shotClock: false, defender: false, target: null, label: 'FREESTYLE' },
  arcade:    { clock: 60,   shotClock: false, defender: false, target: null, label: '60-SECOND CHALLENGE' },
  '1v1':     { clock: null, shotClock: true,  defender: true,  target: 11,   label: '1-ON-1' },
};
