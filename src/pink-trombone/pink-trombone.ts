import Glottis from "./glottis";
import { PinkTromboneProps } from "./shared";
import Tract from "./tract";

export default class PinkTrombone implements PinkTromboneProps {
  readonly glottis: Glottis;
  readonly tract: Tract;
  readonly sampleRate: number;
  readonly processRate: number;
  readonly s2p: number;
  readonly p2s: number;

  constructor(sampleRate: number, processRate: number, tractLengthCm: number) {
    this.glottis = new Glottis(processRate);
    this.tract = new Tract(processRate, tractLengthCm);
    this.sampleRate = sampleRate;
    this.processRate = processRate;
    this.s2p = processRate / sampleRate;
    this.p2s = 1 / this.s2p;
  }

  process(input: Float32Array | undefined, output: Float32Array) {
    const n_samples = output.length;
    const block_time = n_samples / this.sampleRate;
    this.tract.setupBlock(block_time);
    this.glottis.setupBlock(block_time);
    const nProcesses = Math.ceil(n_samples * this.s2p);
    for (let i = 0; i < nProcesses; i++) {
      const lambda = i / nProcesses;
      const samplei = Math.floor(i * this.p2s);
      const glottalOutput = this.glottis.sample(input?.[samplei], lambda);
      const vocalOutput = this.tract.sample(glottalOutput, lambda);
      output[samplei] = vocalOutput * 0.25;
    }
  }

  setRestDiameter(index: number, diameter: number) {
    this.tract.setRestDiameter({ index, diameter });
  }

  applyConstriction(index: number, diameter: number) {
    this.tract.applyConstriction({ index, diameter });
  }

  get diameter(): Float64Array {
    return this.tract.currentDiameter;
  }

  get autoWobble(): boolean {
    return this.glottis.autoWobble;
  }
  set autoWobble(value: boolean) {
    this.glottis.autoWobble = value;
  }

  get frequency(): number {
    return this.glottis.frequency;
  }
  set frequency(value: number) {
    this.glottis.frequency = value;
  }

  get isActive(): boolean {
    return this.glottis.isActive;
  }
  set isActive(value: boolean) {
    this.glottis.isActive = value;
  }

  get peakStart(): boolean {
    return this.glottis.peakStart;
  }
  set peakStart(value: boolean) {
    this.glottis.peakStart = value;
  }

  get velumDiameter(): number {
    return this.tract.velumDiameter;
  }
  set velumDiameter(value: number) {
    this.tract.velumDiameter = value;
  }

  get voiceness(): number {
    return this.glottis.voiceness;
  }
  set voiceness(value: number) {
    this.glottis.voiceness = value;
  }
}
