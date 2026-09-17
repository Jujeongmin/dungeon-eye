import { useEffect, useState } from "react";
import type { MatchDebugHandle } from "../game/render/MatchView";
import { GRIP, type HandTurn } from "../game/render/RemotePlayerActor";

// Development panel for fitting the held rifle to the hands. Open the game with ?tune in the address.
const STORAGE_KEY = "traitor-hunt:grip";
const DEFAULTS = JSON.stringify(GRIP);

type Grip = typeof GRIP;

interface DevWindow {
  __game?: MatchDebugHandle;
  __practice?: { botsPaused: boolean };
}

function devWindow(): DevWindow {
  return window as unknown as DevWindow;
}

function apply(next: Grip): void {
  Object.assign(GRIP.stock, next.stock);
  Object.assign(GRIP.rightHand, next.rightHand);
  Object.assign(GRIP.leftHand, next.leftHand);
  Object.assign(GRIP.rightShift, next.rightShift);
  Object.assign(GRIP.leftShift, next.leftShift);
  GRIP.trigger = next.trigger;
  GRIP.barrel = next.barrel;
  GRIP.neckKeep = next.neckKeep;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(GRIP));
  } catch {
    // Storage can be off; the values still apply for this page.
  }
}

function loadSaved(): void {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const base = JSON.parse(DEFAULTS) as Grip;
    const stored = JSON.parse(saved) as Partial<Grip>;
    apply({
      ...base,
      ...stored,
      stock: { ...base.stock, ...stored.stock },
      rightShift: { ...base.rightShift, ...stored.rightShift },
      leftShift: { ...base.leftShift, ...stored.leftShift },
      rightHand: { ...base.rightHand, ...stored.rightHand },
      leftHand: { ...base.leftHand, ...stored.leftHand },
    });
  } catch {
    // A broken saved value just means the defaults stay.
  }
}

const VIEWS = [
  { label: "앞", ahead: 1.5, side: 0 },
  { label: "오른쪽", ahead: 0.3, side: 1.5 },
  { label: "왼쪽", ahead: 0.3, side: -1.5 },
  { label: "뒤", ahead: -1.5, side: 0 },
];

// Puts the camera beside the first bot, looking at it. side > 0 is the bot's right.
function lookAtBot(ahead: number, side: number): void {
  const game = devWindow().__game;
  const bot = game?.state().poses["test-bot-1"];
  if (!game || !bot) return;
  const facing = bot.yaw + Math.PI;
  const fx = Math.sin(facing);
  const fz = Math.cos(facing);
  // The model's right is -x in its own space: (-fz, fx) in the world.
  const x = bot.x + fx * ahead - fz * side;
  const z = bot.z + fz * ahead + fx * side;
  game.setPose({ x, z, yaw: Math.atan2(-(bot.x - x), -(bot.z - z)), pitch: -0.15 });
}

function Slider({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <label className="tuner-row">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <output>{value.toFixed(step < 1 ? 2 : 0)}</output>
    </label>
  );
}

export function GripTuner() {
  const [grip, setGrip] = useState<Grip>(() => {
    loadSaved();
    return JSON.parse(JSON.stringify(GRIP)) as Grip;
  });
  const [paused, setPaused] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apply(grip);
  }, [grip]);

  useEffect(() => {
    const practice = devWindow().__practice;
    if (practice) practice.botsPaused = paused;
  }, [paused]);

  const set = (patch: Partial<Grip>) => setGrip((g) => ({ ...g, ...patch }));
  const hand = (key: "rightHand" | "leftHand", patch: Partial<HandTurn>) => setGrip((g) => ({ ...g, [key]: { ...g[key], ...patch } }));
  const text = JSON.stringify(grip);

  const handControls = (key: "rightHand" | "leftHand", title: string) => (
    <fieldset>
      <legend>
        <label>
          <input type="checkbox" checked={grip[key].on} onChange={(e) => hand(key, { on: e.target.checked })} /> {title} 방향 바꾸기
        </label>
      </legend>
      {(["x", "y", "z"] as const).map((axis) => (
        <Slider key={axis} label={axis} value={grip[key][axis]} min={-180} max={180} step={5} onChange={(v) => hand(key, { [axis]: v })} />
      ))}
    </fieldset>
  );

  return (
    <div className="tuner" onMouseDown={(e) => e.stopPropagation()}>
      <strong>총 잡기 조정</strong>
      <p className="tuner-note">마우스가 잠겨 있으면 Esc를 누른 뒤 조정하세요.</p>
      <label>
        <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} /> 봇 멈추기
      </label>
      <div className="tuner-views">
        봇 1 보기:
        {VIEWS.map((v) => (
          <button key={v.label} type="button" onClick={() => lookAtBot(v.ahead, v.side)}>{v.label}</button>
        ))}
      </div>
      <fieldset>
        <legend>총 개머리 위치 (가슴 기준, m)</legend>
        <Slider label="좌우" value={grip.stock.x} min={-0.4} max={0.4} step={0.01} onChange={(x) => set({ stock: { ...grip.stock, x } })} />
        <Slider label="높이" value={grip.stock.y} min={-0.4} max={0.4} step={0.01} onChange={(y) => set({ stock: { ...grip.stock, y } })} />
        <Slider label="앞뒤" value={grip.stock.z} min={-0.4} max={0.4} step={0.01} onChange={(z) => set({ stock: { ...grip.stock, z } })} />
      </fieldset>
      <fieldset>
        <legend>손이 잡는 곳 (m)</legend>
        <Slider label="오른손 앞뒤" value={grip.trigger} min={0} max={1} step={0.01} onChange={(trigger) => set({ trigger })} />
        <Slider label="오른손 좌우" value={grip.rightShift.side} min={-0.3} max={0.3} step={0.01} onChange={(side) => set({ rightShift: { ...grip.rightShift, side } })} />
        <Slider label="오른손 높이" value={grip.rightShift.up} min={-0.3} max={0.3} step={0.01} onChange={(up) => set({ rightShift: { ...grip.rightShift, up } })} />
        <Slider label="왼손 앞뒤" value={grip.barrel} min={0} max={1} step={0.01} onChange={(barrel) => set({ barrel })} />
        <Slider label="왼손 좌우" value={grip.leftShift.side} min={-0.3} max={0.3} step={0.01} onChange={(side) => set({ leftShift: { ...grip.leftShift, side } })} />
        <Slider label="왼손 높이" value={grip.leftShift.up} min={-0.3} max={0.3} step={0.01} onChange={(up) => set({ leftShift: { ...grip.leftShift, up } })} />
        <p className="tuner-note">앞뒤: 0 = 개머리 끝, 1 = 총구 끝. 좌우: + 는 캐릭터의 왼쪽.</p>
      </fieldset>
      {handControls("rightHand", "오른손")}
      {handControls("leftHand", "왼손")}
      <Slider label="목 기울기 유지" value={grip.neckKeep} min={0} max={1} step={0.05} onChange={(neckKeep) => set({ neckKeep })} />
      <div className="tuner-actions">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(() => setCopied(true), () => setCopied(false));
          }}
        >
          값 복사
        </button>
        <button type="button" onClick={() => setGrip(JSON.parse(DEFAULTS) as Grip)}>기본값</button>
      </div>
      {copied && <p className="tuner-note">복사했습니다. 채팅에 붙여 넣어 주세요.</p>}
      <textarea readOnly value={text} rows={3} />
    </div>
  );
}

export function tunerEnabled(): boolean {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).has("tune");
}
