export const priorityShapes = [
  "flat",
  "curved",
  "cylinder",
  "lamp",
  "nightlight",
  "box",
];
export const lightingDefaults = {
  lightingSetup: "none",
  lightKind: "strip",
  boardCount: 2,
  boardWidth: 96,
  boardHeight: 144,
  boardThickness: 1.6,
  lightProjection: 7.15,
  lightGap: 18,
  wireWidth: 6,
  wireHeight: 4,
  ventCount: 4,
  ventWidth: 3,
  retainerLip: 3,
  diffuser: false,
  diffuserThickness: 1,
  diffuserGap: 5,
  topCap: true,
  enclosureStand: true,
  footExtension: 8,
  lightDiameter: 59,
  lightHeight: 8,
  stripWidth: 8,
  socketDiameter: 28,
  lightMount: "adhesive",
  mountHole: 3.2,
  mountSpacingX: 60,
  mountSpacingY: 80,
};
export function validateLighting(s) {
  if (
    !["none", "fixed", "modular", "strip", "custom"].includes(s.lightingSetup)
  )
    throw new Error("Unknown lighting setup.");
  if (
    !["board", "strip", "puck", "socket"].includes(s.lightKind) ||
    !["adhesive", "screws"].includes(s.lightMount)
  )
    throw new Error("Unknown light attachment.");
  for (const [key, min, max] of [
    ["footExtension", 3, 40],
    ["boardWidth", 10, 500],
    ["boardHeight", 10, 500],
    ["boardThickness", 0.5, 10],
    ["lightProjection", 1, 30],
    ["lightGap", 8, 100],
    ["wireWidth", 2, 20],
    ["wireHeight", 2, 15],
    ["ventWidth", 1, 8],
    ["retainerLip", 1, 10],
    ["diffuserThickness", 0.4, 3],
    ["diffuserGap", 2, 30],
    ["lightDiameter", 10, 180],
    ["lightHeight", 2, 40],
    ["stripWidth", 3, 20],
    ["socketDiameter", 5, 100],
    ["mountHole", 2, 6],
    ["mountSpacingX", 10, 450],
    ["mountSpacingY", 10, 450],
  ])
    if (!Number.isFinite(s[key]) || s[key] < min || s[key] > max)
      throw new Error(key + " is out of range.");
  if (
    !Number.isInteger(s.boardCount) ||
    s.boardCount < 2 ||
    s.boardCount > 4 ||
    !Number.isInteger(s.ventCount) ||
    s.ventCount < 0 ||
    s.ventCount > 10
  )
    throw new Error("Invalid board or vent count.");
  if (s.lightingSetup === "none") return;
  if (!priorityShapes.includes(s.shape))
    throw new Error(
      "Lighting enclosures currently support the six priority shapes.",
    );
  if (s.lightKind === "board" && !["flat", "box"].includes(s.shape))
    throw new Error(
      "Rigid LED boards use flat frames. Select LED strip, puck or socket for this shape.",
    );
  if (
    s.diffuser &&
    !["cylinder", "lamp"].includes(s.shape) &&
    s.diffuserGap + s.diffuserThickness >= s.lightGap
  )
    throw new Error("Diffuser spacing must fit inside the light gap.");
}
export function applyLightPreset(s, mode) {
  s.lightingSetup = mode;
  if (mode === "none") return;
  if (mode === "modular") {
    s.lightKind = "board";
    s.boardWidth = 48 * s.boardCount;
    s.boardHeight = 144;
    s.boardThickness = 1.6;
    s.lightProjection = 7.15;
  }
  if (mode === "fixed") {
    s.lightKind = "board";
    s.boardWidth = 156;
    s.boardHeight = 120;
    s.boardThickness = 1.6;
    s.lightProjection = 7.15;
  }
  if (mode === "strip") s.lightKind = "strip";
}
