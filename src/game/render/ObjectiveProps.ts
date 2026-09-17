import * as THREE from "three";
import { MATCH_PLAYERS, PLATE_RADIUS, SEAL_DURATION_MS, SEAL_RADIUS } from "../match/constants";
import { isActive } from "../match/lifecycle";
import type { PublicMatch } from "../match/types";
import type { LevelLayout } from "../rules/levelLayout";

const GATE_HEIGHT = 3.95;
const SHARD_COLOR = 0x46d8ff;
const DEVICE_ON = 0x5dff8a;
const DEVICE_OFF = 0xff5a3a;
const PLATE_IDLE = 0x3a9fc6;
const PLATE_SKIP = 0xb8b0a0;
const PLATE_LEADING = 0xffb35a;
const PLATE_OFF = 0x2a2a2a;
const PLATE_DROP_HEIGHT = 7;
const PLATE_DROP_SECONDS = 0.45;
const PLATE_THICKNESS = 0.22;
const SKIP_LABEL = "건너뛰기";

interface PlateView { group: THREE.Group; rune: THREE.MeshStandardMaterial; label: THREE.Sprite; name: string }
interface DeviceView { lamp: THREE.MeshStandardMaterial; light: THREE.PointLight }

function setLabel(sprite: THREE.Sprite, text: string): void {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.font = "600 30px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 8, 256, 48);
    ctx.fillStyle = "#f0d9a8";
    ctx.fillText(text, 128, 32);
  }
  const material = sprite.material;
  material.map?.dispose();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  material.map = texture;
  material.needsUpdate = true;
  sprite.visible = text.length > 0;
}

export class ObjectiveProps {
  private readonly gates = new Map<number, THREE.Object3D>();
  private readonly shards: THREE.Object3D[] = [];
  private readonly devices: DeviceView[] = [];
  private readonly plates: PlateView[] = [];
  private readonly altarGlow = new THREE.MeshStandardMaterial({ color: 0x3a2a18, emissive: 0xffa040, emissiveIntensity: 0 });
  private readonly guardRing: THREE.Mesh;
  private time = 0;
  private roundKey: number | null = null;
  private landed = false;
  // Called once when a round's plates hit the ground.
  onLand: (() => void) | null = null;

  constructor(scene: THREE.Scene, layout: LevelLayout) {
    const stone = new THREE.MeshStandardMaterial({ color: 0x4f463b, roughness: 0.95 });
    const rune = new THREE.MeshStandardMaterial({ color: 0x10202a, emissive: SHARD_COLOR, emissiveIntensity: 0.7 });
    const t = layout.tileSize;

    for (const gate of layout.gates) {
      const door = new THREE.Group();
      const slab = new THREE.Mesh(new THREE.BoxGeometry(t, GATE_HEIGHT, t), stone);
      slab.position.y = GATE_HEIGHT / 2;
      door.add(slab);
      // One glowing rune band per gate number, on all four faces.
      for (let i = 0; i < gate.n; i++) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(t + 0.02, 0.12, 0.5), rune);
        band.position.set(0, 1.6 + i * 0.35, 0);
        const cross = band.clone();
        cross.rotation.y = Math.PI / 2;
        door.add(band, cross);
      }
      door.position.set(gate.x, 0, gate.z);
      scene.add(door);
      this.gates.set(gate.n, door);
    }

    for (const at of layout.shards) {
      const group = new THREE.Group();
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.28),
        new THREE.MeshStandardMaterial({ color: 0x0c2630, emissive: SHARD_COLOR, emissiveIntensity: 1.4 }),
      );
      crystal.position.y = 1.1;
      const light = new THREE.PointLight(SHARD_COLOR, 6, 6, 2);
      light.position.y = 1.2;
      group.add(crystal, light);
      group.position.set(at.x, 0, at.z);
      scene.add(group);
      this.shards.push(group);
    }

    for (const at of layout.devices) {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.2, 12), stone);
      base.position.set(at.x, 0.6, at.z);
      const lamp = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: DEVICE_OFF, emissiveIntensity: 1 });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), lamp);
      bulb.position.set(at.x, 1.4, at.z);
      const light = new THREE.PointLight(DEVICE_OFF, 5, 7, 2);
      light.position.set(at.x, 1.8, at.z);
      scene.add(base, bulb, light);
      this.devices.push({ lamp, light });
    }

    this.guardRing = new THREE.Mesh(
      new THREE.RingGeometry(SEAL_RADIUS - 0.08, SEAL_RADIUS, 64),
      new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    this.guardRing.rotation.x = -Math.PI / 2;
    this.guardRing.visible = false;
    const altar = layout.altar;
    if (altar) {
      const block = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, 0.9, 16), stone);
      block.position.set(altar.x, 0.45, altar.z);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.06, 16), this.altarGlow);
      top.position.set(altar.x, 0.93, altar.z);
      this.guardRing.position.set(altar.x, 0.03, altar.z);
      scene.add(block, top, this.guardRing);
    }

    // One pool of plates, reused by every vote round: a name plate per seat plus skip.
    for (let i = 0; i <= MATCH_PLAYERS; i++) {
      const group = new THREE.Group();
      const slab = new THREE.Mesh(new THREE.CylinderGeometry(PLATE_RADIUS, PLATE_RADIUS * 1.08, PLATE_THICKNESS, 32), stone);
      slab.position.y = PLATE_THICKNESS / 2;
      const rune = new THREE.MeshStandardMaterial({ color: 0x101010, emissive: PLATE_IDLE, emissiveIntensity: 1 });
      const ring = new THREE.Mesh(new THREE.RingGeometry(PLATE_RADIUS * 0.62, PLATE_RADIUS * 0.8, 32), rune);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = PLATE_THICKNESS + 0.01;
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
      label.position.y = 2.1;
      label.scale.set(2.4, 0.6, 1);
      label.visible = false;
      group.add(slab, ring, label);
      group.visible = false;
      scene.add(group);
      this.plates.push({ group, rune, label, name: "" });
    }
  }

  // names[i] is the display name for match.players[i].
  update(match: PublicMatch, now: number, dt: number, names: string[]): void {
    this.time += dt;
    const o = match.objectives;
    for (const [n, door] of this.gates) door.visible = !o.gates.includes(n);
    this.shards.forEach((shard, i) => {
      shard.visible = !o.shards[i];
      const crystal = shard.children[0];
      crystal.rotation.y = this.time * 1.5;
      crystal.position.y = 1.1 + Math.sin(this.time * 2 + i) * 0.08;
    });
    this.devices.forEach((device, i) => {
      const on = o.gates.includes(2) || (o.stage === "devices" && o.devices[i] > now);
      const color = on ? DEVICE_ON : DEVICE_OFF;
      device.lamp.emissive.setHex(color);
      device.light.color.setHex(color);
    });
    this.guardRing.visible = o.stage === "seal" && o.seal.lastAt !== null;
    this.altarGlow.emissiveIntensity = o.gates.includes(3) ? 2.3
      : o.stage === "seal" ? 0.3 + (o.seal.progressMs / SEAL_DURATION_MS) * 2 : 0.1;

    this.updatePlates(match, now, names);
  }

  private updatePlates(match: PublicMatch, now: number, names: string[]): void {
    const round = match.vote.round;
    if (!round) {
      this.roundKey = null;
      for (const plate of this.plates) plate.group.visible = false;
      return;
    }
    if (this.roundKey !== round.startedAt) {
      this.roundKey = round.startedAt;
      this.landed = false;
    }
    // Plates fall from above and land together; everyone sees the same moment from server time.
    const t = Math.min(1, Math.max(0, (now - round.startedAt) / 1000 / PLATE_DROP_SECONDS));
    const height = PLATE_DROP_HEIGHT * (1 - t * t);
    if (t >= 1 && !this.landed) {
      this.landed = true;
      // A late joiner should not hear an old landing.
      if (now - round.startedAt < 1500) this.onLand?.();
    }
    this.plates.forEach((plate, i) => {
      const at = round.plates[i];
      plate.group.visible = !!at;
      if (!at) return;
      plate.group.position.set(at.x, height, at.z);
      const skip = i === match.players.length;
      const accused = skip ? null : match.players[i];
      const name = skip ? SKIP_LABEL : (names[i] ?? "");
      if (name !== plate.name) {
        plate.name = name;
        setLabel(plate.label, name);
      }
      const leading = round.leading === i;
      const color = accused && !isActive(match, accused) ? PLATE_OFF
        : leading ? PLATE_LEADING : skip ? PLATE_SKIP : PLATE_IDLE;
      plate.rune.emissive.setHex(color);
      plate.rune.emissiveIntensity = leading ? 1.6 + Math.sin(this.time * 10) * 0.5 : 1;
    });
  }
}
