import { useEffect, useState } from "react";
import noiseModuleURL from "./audio/noise-module.ts?url";
import { createOrbitalControl } from "./audio/orbit-module";
import { parallel, series } from "./audio/util";
import vectorComputeModuleURL from "./audio/vector-compute-module.ts?url";
import pinkTromboneModuleURL from "./pink-trombone/module.ts?url";
import { Constriction, PinkTromboneNode, preset } from "./pink-trombone/node";
import { TractPoint } from "./pink-trombone/shared";

interface AudioGraph {
  context: AudioContext;
  pinkTrombone: PinkTromboneNode;
  lipConstriction: Constriction;
  tongueConstriction: Constriction;
  master: GainNode;
  orbitControl: ReturnType<typeof createOrbitalControl>;
}

const lipKeyMap: Record<string, TractPoint> = {
  KeyU: { index: preset.p, diameter: 1.2 },
  KeyI: { index: preset.p, diameter: 0.8 },
};

const constrictionKeyMap: Record<string, TractPoint> = {
  KeyQ: { index: preset.p, diameter: 0 },
  KeyW: { index: preset.p, diameter: 0 },
  KeyE: { index: preset.p, diameter: 0.32 },
  KeyR: { index: preset.p, diameter: 0.45 },
  KeyT: { index: preset.p, diameter: 0.7 },
  KeyA: { index: preset.t, diameter: 0 },
  KeyS: { index: preset.t, diameter: 0 },
  KeyD: { index: preset.t, diameter: 0.32 },
  KeyG: { index: preset.t, diameter: 0.7 },
  KeyZ: { index: preset.k, diameter: 0 },
  KeyX: { index: preset.k, diameter: 0 },
  KeyB: { index: preset.k, diameter: 0.7 },
};

const tongueKeyMap: Record<string, TractPoint> = {
  KeyU: preset.ah,
  KeyI: preset.e,
  KeyG: preset.eo,
  KeyO: preset.eo,
  KeyP: preset.eu,
  KeyJ: preset.ee,
  KeyK: preset.eh,
  KeyL: preset.uh,
  Semicolon: preset.ah,
};

export function asmrNoise(context: AudioContext) {
  return parallel(
    series(
      new AudioWorkletNode(context, "noise-generator"),
      new BiquadFilterNode(context, {
        channelCount: 2,
        type: "bandpass",
        frequency: 20,
        Q: 0.5,
      }),
    ),
    series(
      new AudioWorkletNode(context, "noise-generator"),
      new BiquadFilterNode(context, {
        channelCount: 2,
        type: "bandpass",
        frequency: 20000,
        Q: 5,
      }),
    ),
  );
}

const getNarrowest = (
  pressedTimeMap: Map<string, number>,
  constrictionKeyMap: Record<string, TractPoint>,
) => {
  const time = pressedTimeMap.size > 0 ? 0 : 0.3;
  let lastPressedAt = -Infinity;
  const point = { index: 24, diameter: 2.5, flag: "cancel" as const, time };
  for (const [key, value] of Object.entries(constrictionKeyMap)) {
    const pressedTime = pressedTimeMap.get(key);
    if (pressedTime === undefined || pressedTime <= lastPressedAt) continue;
    lastPressedAt = pressedTime;
    point.diameter = value.diameter;
    point.index = value.index;
  }
  return point;
};

export default function App() {
  const [graph, setGraph] = useState<AudioGraph | null>(null);
  const [isPlaying, setPlaying] = useState(false);
  const [isWhisper, setWhisper] = useState(true);

  useEffect(() => {
    if (isPlaying && !graph) {
      const context = new AudioContext();
      Promise.all([
        context.audioWorklet.addModule(noiseModuleURL),
        context.audioWorklet.addModule(vectorComputeModuleURL),
        context.audioWorklet.addModule(pinkTromboneModuleURL),
      ]).then(async () => {
        const pinkTrombone = new PinkTromboneNode(context, {
          tractLengthCm: 16.9,
        });
        const lipConstriction = pinkTrombone.createConstriction();
        const tongueConstriction = pinkTrombone.createConstriction();

        const master = new GainNode(context, { gain: 0 });
        const orbitControl = createOrbitalControl(context);
        series(
          pinkTrombone,
          new GainNode(context, { gain: 4 }),
          orbitControl,
          master,
          context.destination,
        );

        setGraph({
          context,
          orbitControl,
          pinkTrombone,
          lipConstriction,
          tongueConstriction,
          master,
        });
      });
      return;
    }

    if (graph) {
      const {
        master,
        orbitControl,
        pinkTrombone,
        lipConstriction,
        tongueConstriction,
        context,
      } = graph;
      master.gain.cancelScheduledValues(0);
      if (isPlaying) {
        master.gain.setValueAtTime(1, context.currentTime);
      } else {
        master.gain.linearRampToValueAtTime(0, context.currentTime + 0.1);
      }

      const pressedTimeMap = new Map<string, number>();

      const pressRandomKey = (keyMap: Record<string, unknown>, end: number) => {
        const keys = Object.keys(keyMap);
        const sel = keys[(Math.random() * keys.length) | 0];
        pressedTimeMap.set(sel, Date.now());
        setTimeout(() => pressedTimeMap.delete(sel), end * 1000);
      };

      let interval = 0.0475;
      let timer = setTimeout(function queueRandomMove() {
        const t = context.currentTime;
        if (Math.random() < 0.5) {
          interval += 0.025 * (2 * Math.random() - 1);
          interval = Math.min(Math.max(0.05, interval), 0.1);
        }
        const end = interval + Math.random() * 0.05;
        orbitControl.angle.linearRampToValueAtTime(
          orbitControl.angle.value + Math.PI * (2 * Math.random() - 1) * 0.16,
          t + end,
        );
        orbitControl.radius.linearRampToValueAtTime(
          Math.random() * 100,
          t + end,
        );
        pressRandomKey(
          { ...tongueKeyMap, ...constrictionKeyMap, ...lipKeyMap },
          end,
        );

        lipConstriction.set(getNarrowest(pressedTimeMap, lipKeyMap));
        tongueConstriction.set(
          getNarrowest(pressedTimeMap, constrictionKeyMap),
        );
        pinkTrombone.setTongue(getNarrowest(pressedTimeMap, tongueKeyMap));

        const isNasal = ["KeyQ", "KeyA", "KeyZ"].some((code) =>
          pressedTimeMap.has(code),
        );
        pinkTrombone.set({
          velumDiameter: isNasal ? 0.4 : 0.01,
          voiceness: isWhisper ? 0 : 0.4,
          isActive: true,
        });

        timer = setTimeout(queueRandomMove, end * 1000);
      });
      return () => clearTimeout(timer);
    }
  }, [isPlaying, isWhisper, graph]);

  return (
    <>
      <h1>ASMR Synth</h1>
      <div style={{ display: "flex" }}>
        <div className="switch-button">
          PLAY
          <div className={isPlaying ? "indicator on" : "indicator"} />
          <button type="button" onClick={() => setPlaying(!isPlaying)}>
            <span />
          </button>
        </div>
        <div className="switch-button">
          WHISPER
          <div className={isWhisper ? "indicator on" : "indicator"} />
          <button type="button" onClick={() => setWhisper(!isWhisper)}>
            <span />
          </button>
        </div>
      </div>
    </>
  );
}
