import PinkTrombone from "./pink-trombone";
import {
  ConstrictionProps,
  Schedules,
  TractPoint,
  createServer,
} from "./shared";

type ScheduleContainer = { time: number; entry: [string, unknown] }[];

const assignSchedulers = new WeakMap<object, ScheduleContainer>();

function createSchedule(target: object, ...values: Schedules<object>) {
  const schedules = assignSchedulers.get(target) ?? [];
  for (const update of values) {
    const { time = 0, ...updatingFields } = update;
    for (const entry of Object.entries(updatingFields)) {
      schedules.push({ entry, time });
    }
  }
  schedules.sort((a, b) => a.time - b.time);
  assignSchedulers.set(target, schedules);
}

function runSchedule(
  target: object,
  time: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assign?: (key: string, value: any) => void,
) {
  const schedules = assignSchedulers.get(target);
  if (!schedules) return false;
  let isModified = false;
  let isFlushing = false;
  while (schedules.length && (isFlushing || schedules[0].time < time)) {
    const message = schedules.shift();
    if (!message?.entry) break;
    const [key, value] = message.entry;
    if (key === "flag") {
      if (value === "cancel") schedules.length = 0;
      else if (value === "flush") isFlushing = true;
    } else {
      if (assign) assign(key, value);
      else Object.assign(target, { [key]: value });
      isModified = true;
    }
  }
  return isModified;
}

let idInc = 0;

export default class PinkTromboneProcessor extends AudioWorkletProcessor {
  readonly pinkTrombone: PinkTrombone;

  readonly constrictionMap: Record<string, ConstrictionProps> = {};
  readonly constrictions: (typeof this.constrictionMap)[string][] = [];

  tongue: TractPoint = { index: 17.9, diameter: 2.5 };

  constructor(options?: AudioWorkletNodeOptions) {
    super();
    const tractLengthCm = options?.processorOptions?.tractLengthCm ?? 16.9;
    this.pinkTrombone = new PinkTrombone(
      sampleRate,
      sampleRate * 2,
      tractLengthCm,
      {
        isActive: false,
        peakStart: true,
        autoWobble: true,
        voiceness: 0,
        frequency: 140,
        velumDiameter: 0.01,
        vibratoAmount: 0.005,
        vibratoFrequency: 6,
        ...options?.processorOptions,
      },
    );
    createServer(this.port, {
      getDiameter: () => this.pinkTrombone.diameter,
      set: createSchedule.bind(null, this.pinkTrombone),
      setTongue: createSchedule.bind(null, this.tongue),
      createConstriction: (value: ConstrictionProps) => {
        const id = (idInc++).toString(36);
        this.constrictions.push(value);
        this.constrictionMap[id] = value;
        return id;
      },
      updateConstriction: (id: string, ...ss: Schedules<ConstrictionProps>) => {
        createSchedule(this.constrictionMap[id], ...ss);
      },
      removeConstriction: (id: string) => {
        if (!(id in this.constrictionMap)) return;
        const constriction = this.constrictionMap[id];
        delete this.constrictionMap[id];
        const index = this.constrictions.indexOf(constriction);
        if (index !== -1) this.constrictions.splice(index, 1);
      },
    });
  }

  process([[input]]: Float32Array[][], [[output]]: Float32Array[][]) {
    const { pinkTrombone, tongue, constrictions } = this;

    runSchedule(pinkTrombone, currentTime);

    const isTongueChanged = runSchedule(tongue, currentTime);
    const isCnsChanged = constrictions.some((s) => runSchedule(s, currentTime));
    if (isTongueChanged || isCnsChanged) {
      pinkTrombone.setRestDiameter(tongue.index, tongue.diameter);
      for (let j = 0; j < constrictions.length; j++) {
        const cons = constrictions[j];
        if (!cons.isActive) continue;
        pinkTrombone.applyConstriction(cons.index, cons.diameter);
      }
    }
    pinkTrombone.process(input, output);
    return true;
  }
}

registerProcessor("pink-trombone", PinkTromboneProcessor);
