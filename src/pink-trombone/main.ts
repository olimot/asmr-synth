import drawTract from "./draw-tract";
import { PinkTromboneNode, preset } from "./node";
import { TractPoint } from "./shared";

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
  KeyF: { index: preset.t, diameter: 0.45 },
  KeyG: { index: preset.t, diameter: 0.7 },
  KeyZ: { index: preset.k, diameter: 0 },
  KeyX: { index: preset.k, diameter: 0 },
  KeyC: { index: preset.k, diameter: 0.305 },
  KeyV: { index: preset.k, diameter: 0.45 },
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

const tongueKeys = Object.keys(tongueKeyMap);

function log(...args: unknown[]) {
  const textContent = args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      if (typeof arg === "undefined") return "undefined";
      if (typeof arg === "object" && arg) {
        const name = arg.constructor.name;
        const data = JSON.stringify(arg);
        return `${name} ${data}`;
      }
      return JSON.stringify(arg);
    })
    .join(" ");
  const root = document.getElementById("root");
  const line = Object.assign(document.createElement("div"), { textContent });
  root?.appendChild(line);
}

const setupAudioProgram = () =>
  Promise.resolve().then(async () => {
    const context = new AudioContext();
    await context.audioWorklet.addModule("./pink-trombone/module.js");
    const master = new GainNode(context, { gain: 1 });
    master.connect(context.destination);

    const pinkTrombone = new PinkTromboneNode(context, { tractLengthCm: 16.9 });
    pinkTrombone.set({ frequency: 140 });
    pinkTrombone.connect(master);
    const lip = pinkTrombone.createConstriction();
    const constriction = pinkTrombone.createConstriction();

    // const osc = new OscillatorNode(context, {
    //   frequency: 140,
    //   type: "sawtooth",
    // });
    // osc.start();
    // osc.connect(pinkTrombone);

    log(`Audio Program is set up.`);
    return { context, master, pinkTrombone, lip, constriction };
  });

let audioProgramP: ReturnType<typeof setupAudioProgram>;
async function useAudioProgram() {
  audioProgramP ??= setupAudioProgram();
  return audioProgramP;
}

export async function main() {
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  const canvas = document.createElement("canvas");
  const context2d = canvas.getContext("2d") as CanvasRenderingContext2D;
  canvas.className = "main-canvas";
  document.getElementById("root")?.appendChild(canvas);
  const resize: { width: number; height: number }[] = [];
  new ResizeObserver(([entry]) => {
    const boxSize = entry.devicePixelContentBoxSize[0];
    resize[0] = { width: boxSize.inlineSize, height: boxSize.blockSize };
  }).observe(canvas, { box: "content-box" });

  let drawingDiameter: Float32Array | undefined;
  if (typeof SharedArrayBuffer === "undefined") {
    requestAnimationFrame(async function callback() {
      if (audioProgramP) {
        const { pinkTrombone } = await audioProgramP;
        drawingDiameter = await pinkTrombone.getDiameter();
      }
      requestAnimationFrame(callback);
    });
  }
  requestAnimationFrame(function callback() {
    requestAnimationFrame(callback);
    Object.assign(canvas, resize.shift());
    if (drawingDiameter) drawTract(context2d, drawingDiameter);
  });

  // Handle Keyboard Input
  const pressed = new Map<string, number>();

  const getNarrowest = (
    type: string,
    constrictionKeyMap: Record<string, TractPoint>,
  ) => {
    const flag = type === "keydown" ? ("cancel" as const) : undefined;
    const time = pressed.size > 0 ? 0 : 0.3;
    let lastPressedAt = -Infinity;
    const point = { index: 24, diameter: 2.5, flag, time };
    for (const [key, value] of Object.entries(constrictionKeyMap)) {
      const pressedAt = pressed.get(key);
      if (pressedAt === undefined || pressedAt <= lastPressedAt) continue;
      lastPressedAt = pressedAt;
      point.diameter = value.diameter;
      point.index = value.index;
    }
    return point;
  };

  async function updatePinkTrombone(e: KeyboardEvent) {
    const { pinkTrombone, lip, constriction } = await useAudioProgram();
    drawingDiameter ??= await pinkTrombone.getDiameter();
    lip.set(getNarrowest(e.type, lipKeyMap));
    constriction.set(getNarrowest(e.type, constrictionKeyMap));
    pinkTrombone.setTongue(getNarrowest(e.type, tongueKeyMap));

    const isNasal = ["KeyQ", "KeyA", "KeyZ"].some((code) => pressed.has(code));
    const velumDiameter = isNasal ? 0.4 : 0.01;
    const isActive =
      pressed.has("Space") || tongueKeys.some((key) => pressed.has(key));
    const voiceness = e.shiftKey ? 0 : 0.6;
    pinkTrombone.set({ velumDiameter, voiceness, isActive });
  }

  async function onkeydown(e: KeyboardEvent) {
    if (pressed.has(e.code)) return;
    pressed.set(e.code, Date.now());
    updatePinkTrombone(e);
  }

  async function onkeyup(e: KeyboardEvent) {
    if (!pressed.has(e.code)) return;
    pressed.delete(e.code);
    updatePinkTrombone(e);
  }

  window.addEventListener("keydown", onkeydown);
  window.addEventListener("keyup", onkeyup);
  window.addEventListener("click", async () => {
    const { pinkTrombone } = await useAudioProgram();
    drawingDiameter ??= await pinkTrombone.getDiameter();
  });

  log("Click or press any key to start.");
}

main();
