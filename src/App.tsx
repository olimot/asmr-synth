import { useEffect, useState } from "react";
import noiseModuleURL from "./audio/noise-module.ts?worker&url";
import { createOrbitalControl } from "./audio/orbit-module";
import { parallel, series } from "./audio/util";
import vectorComputeModuleURL from "./audio/vector-compute-module.ts?worker&url";
import pinkTromboneModuleURL from "./pink-trombone/module.ts?worker&url";
import { Constriction, PinkTromboneNode, preset } from "./pink-trombone/node";
import { PinkTromboneProps, TractPoint } from "./pink-trombone/shared";

interface AudioGraph {
  context: AudioContext;
  pinkTrombone: PinkTromboneNode;
  lipConstriction: Constriction;
  tongueConstriction: Constriction;
  master: GainNode;
  orbitControl: ReturnType<typeof createOrbitalControl>;
  updateTrombone: (
    pressedTimeMap: Map<string, number>,
    settings: Partial<PinkTromboneProps>,
    time: number,
  ) => void;
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
        frequency: 40,
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
  time = 0,
) => {
  let lastPressedAt = -Infinity;
  const point = { index: 24, diameter: 2.5, time };
  for (const [key, value] of Object.entries(constrictionKeyMap)) {
    const pressedTime = pressedTimeMap.get(key);
    if (pressedTime === undefined || pressedTime <= lastPressedAt) continue;
    lastPressedAt = pressedTime;
    point.diameter = value.diameter;
    point.index = value.index;
  }
  return point;
};

export async function buildAudioGraph() {
  const context = new AudioContext({ latencyHint: "playback" });

  await Promise.all([
    context.audioWorklet.addModule(noiseModuleURL),
    context.audioWorklet.addModule(vectorComputeModuleURL),
    context.audioWorklet.addModule(pinkTromboneModuleURL),
  ]);

  const pinkTrombone = new PinkTromboneNode(context, {
    tractLengthCm: 16.9,
    isActive: false,
    peakStart: true,
    autoWobble: false,
    voiceness: 0,
    frequency: 140,
    velumDiameter: 0.01,
    vibratoAmount: 0.009,
    vibratoFrequency: 6,
  });
  const lipConstriction = pinkTrombone.createConstriction();
  const tongueConstriction = pinkTrombone.createConstriction();

  const master = new GainNode(context, { gain: 0 });

  const orbitControl = createOrbitalControl(context);

  series(
    pinkTrombone,
    new GainNode(context, { gain: 2 }),
    orbitControl,
    master,
    context.destination,
  );

  const nasalKeySet = new Set(["KeyQ", "KeyA", "KeyZ"]);

  const updateTrombone = (
    keyTimeMap: Map<string, number>,
    settings: Partial<PinkTromboneProps>,
    time = 0,
  ) => {
    lipConstriction.set(getNarrowest(keyTimeMap, lipKeyMap, time));
    tongueConstriction.set(getNarrowest(keyTimeMap, constrictionKeyMap, time));
    pinkTrombone.setTongue(getNarrowest(keyTimeMap, tongueKeyMap, time));

    pinkTrombone.set({
      time,
      velumDiameter: nasalKeySet.intersection(keyTimeMap).size > 0 ? 0.4 : 0.01,
      voiceness: settings.voiceness,
      frequency: settings.frequency,
      isActive: true,
    });
  };

  return {
    context,
    orbitControl,
    pinkTrombone,
    lipConstriction,
    tongueConstriction,
    updateTrombone,
    master,
  };
}

export default function App() {
  const [graph, setGraph] = useState<AudioGraph | null>(null);
  const [isPlaying, setPlaying] = useState(false);
  const [settings, setSettings] = useState({
    voiceness: 0,
    speed: 0.1,
    range: 25,
    frequency: 140,
  });
  useEffect(() => {
    if (!graph) return;
    const { master, orbitControl, pinkTrombone, updateTrombone, context } =
      graph;
    if (isPlaying) {
      master.gain.setValueAtTime(1, context.currentTime);
    } else {
      master.gain.linearRampToValueAtTime(0, context.currentTime + 0.1);
    }

    orbitControl.angle.cancelScheduledValues(context.currentTime);
    orbitControl.radius.cancelScheduledValues(context.currentTime);
    pinkTrombone.set({
      time: context.currentTime,
      flag: "cancel",
      voiceness: settings.voiceness,
      frequency: settings.frequency,
      isActive: true,
    });

    const pressedTimeMap = new Map<string, number>();
    const keys = Object.keys({
      ...tongueKeyMap,
      ...constrictionKeyMap,
      ...lipKeyMap,
    });
    const tongueKeys = Object.keys(tongueKeyMap);

    let interval = (0.05 + settings.speed) / 2;
    let schTime = context.currentTime;
    let timer = setTimeout(function queueRandomMove() {
      if (Math.random() < 0.5) {
        interval += 0.025 * (2 * Math.random() - 1);
        interval = Math.min(Math.max(0.05, interval), settings.speed);
      }
      schTime += interval + Math.random() * 0.05;
      const startSchTime = schTime;
      const targetSchTime = startSchTime + 2;
      let angle = orbitControl.angle.value;
      let radius = orbitControl.radius.value;
      while (schTime <= targetSchTime) {
        angle += Math.PI * (2 * Math.random() - 1) * 0.16;
        orbitControl.angle.linearRampToValueAtTime(angle, schTime);

        radius += (2 * Math.random() - 1) * settings.range;
        radius = Math.min(Math.max(0, radius), 96);
        orbitControl.radius.linearRampToValueAtTime(radius, schTime);

        if (Math.random() < 0.5) {
          interval += 0.025 * (2 * Math.random() - 1);
          interval = Math.min(Math.max(0.05, interval), settings.speed);
        }
        const duration = interval + Math.random() * 0.05;

        const sel = keys[(Math.random() * keys.length) | 0];
        const isTongueChanged = tongueKeys.includes(sel);
        pressedTimeMap.set(sel, Date.now());
        if (isTongueChanged) {
          for (const tongueKey of tongueKeys) {
            if (tongueKey === sel) continue;
            pressedTimeMap.delete(tongueKey);
          }
          updateTrombone(pressedTimeMap, settings, schTime);
        } else {
          updateTrombone(pressedTimeMap, settings, schTime);
          const d =
            constrictionKeyMap[sel]?.diameter ?? lipKeyMap[sel].diameter;
          const keyUpAfter = d ? 0.12 : duration;
          pressedTimeMap.delete(sel);
          updateTrombone(pressedTimeMap, settings, schTime + keyUpAfter);
        }
        schTime += duration;
      }

      const ms = (schTime - startSchTime) * 1000;
      timer = setTimeout(queueRandomMove, ms - 120);
    }, 500);
    return () => clearTimeout(timer);
  }, [isPlaying, settings, graph]);

  return (
    <>
      <h1>ASMR Synth</h1>
      <div style={{ display: "flex" }}>
        <div className="switch-button">
          <div className="label">Play</div>
          <div className={isPlaying ? "indicator on" : "indicator"} />
          <button
            type="button"
            onClick={async () => {
              if (!isPlaying && !graph) setGraph(await buildAudioGraph());
              setPlaying(!isPlaying);
            }}
          />
        </div>
        <div className="switch-button">
          <div className="label">Whisper</div>
          <div className={settings.voiceness ? "indicator" : "indicator on"} />
          <button
            type="button"
            onClick={() => {
              setSettings({
                ...settings,
                voiceness: settings.voiceness ? 0 : 0.4,
              });
            }}
          />
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr 20px",
          gap: 32,
          marginTop: 32,
          alignItems: "center",
        }}
      >
        <div className="label">Voice Freq</div>
        <input
          type="range"
          min={80}
          max={260}
          value={settings.frequency}
          step={1}
          onChange={(e) => {
            console.log(Number(e.target.value));
            setSettings({ ...settings, frequency: Number(e.target.value) });
          }}
        />{" "}
        <div>{settings.frequency}</div>
        <div className="label">Speed</div>
        <input
          type="range"
          min={0.05}
          max={0.5}
          value={settings.speed}
          step={0.01}
          onChange={(e) => {
            console.log(Number(e.target.value));
            setSettings({ ...settings, speed: Number(e.target.value) });
          }}
        />
        <div>{settings.speed}</div>
        <div className="label">Range</div>
        <input
          type="range"
          min={12}
          max={50}
          value={settings.range}
          step={1}
          onChange={(e) => {
            console.log(Number(e.target.value));
            setSettings({ ...settings, range: Number(e.target.value) });
          }}
        />{" "}
        <div>{settings.range}</div>
      </div>
    </>
  );
}
