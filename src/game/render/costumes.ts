// The explorer model ships every body part and outfit piece as its own mesh.
// A costume is the set of pieces that stay visible; everything else is hidden.
export interface Costume {
  id: string;
  name: string;
  parts: readonly string[];
}

const HEAD = ["Man_Head_Mesh", "Man_Eyes_Mesh", "Man_Jaw_Mesh"];
const LEGS = ["Man_Pants_Mesh", "Man_Shoes_Mesh"];

// Part lists follow the pack's own Man_03 and Man_04 prefabs.
export const COSTUMES: readonly Costume[] = [
  {
    id: "explorer",
    name: "탐험가",
    parts: [...HEAD, "Man_Arms_Mesh", "Man_Pullover_Mesh", "Man_Bag_Mesh", ...LEGS],
  },
  {
    id: "scout",
    name: "수색대",
    parts: [...HEAD, "Man_Arms_Mesh", "Man_Jacket_Mesh", "Man_Pullover_For_Jacket_Mesh", "Man_Cloth_Face_Mesh", "Man_Bag_Mesh", ...LEGS],
  },
  {
    id: "raider",
    name: "복면 대원",
    parts: ["Man_Balaclava_Mesh", "Man_Eyes_Mesh", "Man_Arms_Mesh", "Man_Jacket_Mesh", "Man_Pullover_For_Jacket_Mesh", "Man_Bag_Mesh", ...LEGS],
  },
];

// three.js turns spaces in glTF node names into underscores.
function sameName(meshName: string, part: string): boolean {
  return meshName === part.replace(/\s/g, "_");
}

export function isCostumePart(costume: Costume, meshName: string): boolean {
  return costume.parts.some((part) => sameName(meshName, part));
}

// Seats get different costumes so players can tell each other apart.
export function costumeForSeat(seat: number): Costume {
  const n = COSTUMES.length;
  return COSTUMES[((seat % n) + n) % n];
}
