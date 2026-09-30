export const solidDefaults = {
  colorStructure: "relief",
  solidThickness: 2.4,
  solidFront: 0.16,
  solidRear: 0.16,
  solidFeature: 0.4,
  cyanLayers: 16,
  magentaLayers: 16,
  yellowLayers: 16,
  solidProfile: JSON.stringify({
    name: "Uncalibrated estimate",
    absorption: [
      [5, 0.18, 0.12],
      [0.16, 5, 0.2],
      [0.12, 0.16, 5],
      [0.35, 0.35, 0.35],
    ],
  }),
};
export const isSolid = (s) => ["solid", "dedicated"].includes(s.colorStructure);
export function solidSettings(s) {
  if (s.colorStructure !== "dedicated") return s;
  const budgets = [s.cyanLayers, s.magentaLayers, s.yellowLayers];
  if (budgets.some((n) => !Number.isSafeInteger(n) || n < 1))
    throw new Error(
      "Dedicated color layer counts must be positive whole numbers.",
    );
  return {
    ...s,
    solidThickness: Number(
      (
        budgets.reduce((a, b) => a + b, 0) * s.layer +
        s.solidFront +
        s.solidRear
      ).toFixed(8),
    ),
  };
}
export function dedicatedSchedule(s) {
  s = solidSettings(s);
  const c = solidConfig(s),
    rows = [];
  let z = 0;
  const add = (n, allowedMaterials) => {
    rows.push({
      layer: rows.length + 1,
      zBottom: Number((z * s.layer).toFixed(8)),
      zTop: Number(((z + n) * s.layer).toFixed(8)),
      allowedMaterials,
    });
    z += n;
  };
  add(Math.min(c.rear, 2), ["White"]);
  while (z < c.rear) add(1, ["White"]);
  for (let k = 0; k < 3; k++)
    for (let i = 0; i < c.budgets[k]; i++)
      add(1, [["Cyan", "Magenta", "Yellow"][k], "White"]);
  for (let i = 0; i < c.front; i++) add(1, ["White"]);
  return rows;
}
export function solidConfig(s) {
  s = solidSettings(s);
  if (!["flat", "box"].includes(s.shape))
    throw new Error(
      "Smooth solid color panels currently support flat panels and lightboxes.",
    );
  for (const [key, label] of [
    ["solidThickness", "Total panel thickness"],
    ["solidFront", "White viewing skin"],
    ["solidRear", "White rear skin"],
  ])
    if (!Number.isFinite(s[key]) || s[key] <= 0)
      throw new Error(label + " must be a positive number.");
  if (!Number.isFinite(s.layer) || s.layer <= 0)
    throw new Error("Layer height must be a positive number.");
  if (!Number.isFinite(s.solidFeature) || s.solidFeature <= 0)
    throw new Error("Minimum color feature must be a positive number.");
  const layers = Math.round(s.solidThickness / s.layer),
    front = Math.round(s.solidFront / s.layer),
    rear = Math.round(s.solidRear / s.layer);
  for (const [v, n] of [
    [s.solidThickness, layers],
    [s.solidFront, front],
    [s.solidRear, rear],
  ])
    if (Math.abs(v - n * s.layer) > 1e-6)
      throw new Error(
        "Panel and skin thicknesses must be exact multiples of the layer height.",
      );
  if (
    ![layers, front, rear].every(
      (n) => Number.isSafeInteger(n) && n <= 0xffffffff,
    )
  )
    throw new Error("Layer counts exceed the 32-bit material representation.");
  if (front < 1 || rear < 1 || layers - front - rear < 3)
    throw new Error(
      "Allow at least one layer per white skin and three internal layers within the total panel thickness.",
    );
  let profile;
  try {
    profile = JSON.parse(s.solidProfile);
  } catch {
    throw new Error("Transmission profile must be valid JSON.");
  }
  if (
    !profile ||
    typeof profile.name !== "string" ||
    profile.name.length > 100 ||
    !Array.isArray(profile.absorption) ||
    profile.absorption.length !== 4 ||
    profile.absorption.some(
      (a) =>
        !Array.isArray(a) ||
        a.length !== 3 ||
        a.some((v) => !Number.isFinite(v) || v < 0 || v > 30),
    )
  )
    throw new Error(
      "Profile needs a name and four RGB absorption triplets (C, M, Y, W), each 0–30 per mm.",
    );
  const cols = Math.max(1, Math.floor(s.width / s.solidFeature)),
    rows = Math.max(1, Math.floor(s.height / s.solidFeature));
  if (!Number.isSafeInteger(cols * rows))
    throw new Error(
      "Requested smooth color grid exceeds numeric precision. No detail was reduced.",
    );
  return {
    thickness: s.solidThickness,
    budgets:
      s.colorStructure === "dedicated"
        ? [s.cyanLayers, s.magentaLayers, s.yellowLayers]
        : null,
    layers,
    front,
    rear,
    inside: layers - front - rear,
    profile,
    cols,
    rows,
  };
}
