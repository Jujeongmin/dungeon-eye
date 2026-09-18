import { useState } from "react";
import { FP_DEFAULTS, fpTuning, resetFpTuning, type FirstPersonTuning } from "../game/render/firstPersonTuning";

interface Slider {
  label: string;
  min: number;
  max: number;
  step: number;
  get: (t: FirstPersonTuning) => number;
  set: (t: FirstPersonTuning, v: number) => void;
}

const PI = Math.PI;

function axis(label: string, key: "gun" | "head" | "twistLeft" | "twistRight" | "elbowLeft" | "elbowRight", min: number, max: number, step: number): Slider[] {
  return (["x", "y", "z"] as const).map((a) => ({
    label: `${label} ${a}`,
    min,
    max,
    step,
    get: (t) => t[key][a],
    set: (t, v) => {
      t[key][a] = v;
    },
  }));
}

const GROUPS: { title: string; sliders: Slider[] }[] = [
  { title: "총 위치 (x 오른쪽 · y 위 · z 앞은 −)", sliders: axis("총", "gun", -0.6, 0.6, 0.005) },
  {
    title: "손이 잡는 곳",
    sliders: [
      { label: "오른손 (개머리에서)", min: 0, max: 1, step: 0.01, get: (t) => t.hold.trigger, set: (t, v) => { t.hold.trigger = v; } },
      { label: "왼손 (개머리에서)", min: 0, max: 1, step: 0.01, get: (t) => t.hold.barrel, set: (t, v) => { t.hold.barrel = v; } },
      { label: "총 아래로", min: -0.15, max: 0.15, step: 0.005, get: (t) => t.hold.below, set: (t, v) => { t.hold.below = v; } },
    ],
  },
  { title: "몸(어깨) 위치", sliders: axis("머리", "head", -0.6, 0.6, 0.005) },
  { title: "왼손 회전", sliders: axis("왼손", "twistLeft", -PI, PI, 0.02) },
  { title: "오른손 회전", sliders: axis("오른손", "twistRight", -PI, PI, 0.02) },
  { title: "왼쪽 팔꿈치 방향", sliders: axis("왼팔꿈치", "elbowLeft", -1.5, 1.5, 0.01) },
  { title: "오른쪽 팔꿈치 방향", sliders: axis("오른팔꿈치", "elbowRight", -1.5, 1.5, 0.01) },
  {
    title: "팔 밝기",
    sliders: [{ label: "밝기", min: 0.05, max: 1, step: 0.01, get: (t) => t.shade, set: (t, v) => { t.shade = v; } }],
  },
];

function rounded(value: unknown): unknown {
  if (typeof value === "number") return Math.round(value * 1000) / 1000;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rounded(v)]));
  }
  return value;
}

// Dev-only sliders for the first-person rifle and arms; opened with the backquote key in a match.
export function TuningPanel({ onClose }: { onClose: () => void }) {
  const [, redraw] = useState(0);
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(rounded(fpTuning));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="tuning-panel" onMouseDown={(e) => e.stopPropagation()}>
      <header>
        <strong>1인칭 손·총 튜닝</strong>
        <button type="button" onClick={onClose}>닫기 (`)</button>
      </header>
      {GROUPS.map((group) => (
        <section key={group.title}>
          <h4>{group.title}</h4>
          {group.sliders.map((s) => {
            const value = s.get(fpTuning);
            const changed = Math.abs(value - s.get(FP_DEFAULTS)) > 1e-9;
            return (
              <label key={s.label} className={changed ? "changed" : undefined}>
                <span>{s.label}</span>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={value}
                  onChange={(e) => {
                    s.set(fpTuning, Number(e.target.value));
                    setCopied(false);
                    redraw((n) => n + 1);
                  }}
                />
                <output>{value.toFixed(3)}</output>
              </label>
            );
          })}
        </section>
      ))}
      <footer>
        <button type="button" onClick={() => void copy()}>{copied ? "복사됨 ✓" : "값 복사"}</button>
        <button type="button" onClick={() => { resetFpTuning(); redraw((n) => n + 1); }}>기본값</button>
      </footer>
      <textarea readOnly value={json} onFocus={(e) => e.currentTarget.select()} />
      <p>맞춘 뒤 "값 복사"를 눌러 채팅에 붙여 주세요. 복사가 안 되면 아래 칸의 글자를 직접 복사하세요.</p>
    </div>
  );
}
