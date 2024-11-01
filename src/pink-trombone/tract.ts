import {
  TractPoint,
  bandpass,
  lerp,
  maxTongueDiameter,
  minTongueDiameter,
} from "./shared";

const { min, max } = Math;

export default class Tract {
  velumDiameter = 0.01;
  readonly diameter: Float64Array;
  readonly timeStep: number;
  readonly tractLength: number;
  readonly noseLength: number;
  readonly noseStart: number;
  readonly tipStart: number;
  readonly bladeStart: number;
  readonly lipStart: number;
  readonly processRate: number;

  currrentVelumDiameter = 0.01;
  reflectionRn = 0;
  reflectionLn = 0;
  newReflectionRn = 0;
  newReflectionLn = 0;
  reflectionNl = 0;
  newReflectionNl = 0;
  lastObstruction = -1;
  readonly fricativeIntensity: Float64Array;
  readonly currentDiameter: Float64Array;
  readonly reflection: Float64Array;
  readonly newReflection: Float64Array;
  readonly noseDiameter: Float64Array;
  readonly noseReflection: Float64Array;
  R: Float64Array;
  prevR: Float64Array;
  L: Float64Array;
  prevL: Float64Array;
  noseR: Float64Array;
  prevNoseR: Float64Array;
  noseL: Float64Array;
  prevNoseL: Float64Array;

  readonly transients = [] as { index: number; timeAlive: number }[];

  turbulenceBandpass: (xn: number) => number;

  turbulenceNoise = () => this.turbulenceBandpass(1 - 2 * Math.random());

  constructor(processRate: number, tractLengthCm: number) {
    this.timeStep = 1 / processRate;
    this.turbulenceBandpass = bandpass(1000, 0.7071, processRate);

    /** air pressure samples per centimeter */
    const apcm = processRate / 34000;
    this.processRate = processRate;
    this.tractLength = Math.round(tractLengthCm * apcm);
    this.noseLength = Math.round(0.6391 * tractLengthCm * apcm);
    this.tipStart = Math.round(0.7278 * tractLengthCm * apcm);
    this.bladeStart = Math.round(0.2273 * tractLengthCm * apcm);
    this.lipStart = Math.round(0.8817 * tractLengthCm * apcm);
    this.noseStart = this.tractLength - this.noseLength + 1;

    this.fricativeIntensity = new Float64Array(this.tractLength);
    this.diameter = new Float64Array(this.tractLength);
    this.currentDiameter =
      typeof SharedArrayBuffer === "undefined"
        ? new Float64Array(this.tractLength)
        : new Float64Array(new SharedArrayBuffer(8 * this.tractLength));
    this.reflection = new Float64Array(this.tractLength + 1);
    this.newReflection = new Float64Array(this.tractLength + 1);
    this.R = new Float64Array(this.tractLength);
    this.prevR = new Float64Array(this.tractLength);
    this.L = new Float64Array(this.tractLength);
    this.prevL = new Float64Array(this.tractLength);
    this.noseDiameter = new Float64Array(this.noseLength);
    this.noseReflection = new Float64Array(this.noseLength);
    this.noseR = new Float64Array(this.noseLength);
    this.prevNoseR = new Float64Array(this.noseLength);
    this.noseL = new Float64Array(this.noseLength);
    this.prevNoseL = new Float64Array(this.noseLength);

    for (let i = 0; i < this.noseLength; i++) {
      let diameter;
      const d = 2 * (i / this.noseLength);
      if (d < 1) diameter = 0.4 + 1.6 * d;
      else diameter = 0.5 + 1.5 * (2 - d);
      this.noseDiameter[i] = min(diameter, 1.9);
    }

    for (let i = 0, prevNoseA = 0; i < this.noseLength; i++) {
      const noseA = this.noseDiameter[i] * this.noseDiameter[i];
      if (i) this.noseReflection[i] = (prevNoseA - noseA) / (prevNoseA + noseA);
      prevNoseA = noseA;
    }

    const p1 = Math.floor(0.1591 * this.tractLength);
    const p2 = Math.floor(0.2727 * this.tractLength);
    for (let i = 0; i < this.tractLength; i++) {
      if (i < p1) this.currentDiameter[i] = 0.6;
      else if (i < p2) this.currentDiameter[i] = 1.1;
      else this.currentDiameter[i] = 1.5;
    }
    this.diameter.set(this.currentDiameter);
  }

  sample([glottalOutput, noiseModulator]: [number, number], lambda: number) {
    [this.R, this.prevR] = [this.prevR, this.R];
    [this.L, this.prevL] = [this.prevL, this.L];
    [this.noseR, this.prevNoseR] = [this.prevNoseR, this.noseR];
    [this.noseL, this.prevNoseL] = [this.prevNoseL, this.noseL];
    const { R, L, prevR, prevL, noseR, noseL, prevNoseR, prevNoseL } = this;

    // process transients (plosive sound)
    for (let i = 0; i < this.transients.length; i++) {
      const trans = this.transients[i];
      trans.timeAlive += this.timeStep;
      if (trans.timeAlive > 0.2) this.transients.splice(i--, 1);
      const amplitude = noiseModulator * 2 ** (-200 * trans.timeAlive);
      prevR[trans.index] += amplitude;
      prevL[trans.index] += amplitude;
    }

    const turbulence = noiseModulator * this.turbulenceNoise() * 0.25;

    // compute reflection at junction of tract and nose
    const Rn = prevR[this.noseStart - 1];
    const Ln = prevL[this.noseStart];
    const N0 = prevNoseL[0];
    const reflectionAmountN = N0 + Ln + Rn;
    const reflectionRn = lerp(this.reflectionRn, this.newReflectionRn, lambda);
    const reflectionLn = lerp(this.reflectionLn, this.newReflectionLn, lambda);
    const reflectionNl = lerp(this.reflectionNl, this.newReflectionNl, lambda);

    let ref = lerp(this.reflection[0], this.newReflection[0], lambda);
    for (let i = 0; i < this.tractLength; i++) {
      // add turbulence noise (fricative sound)
      const intensity = this.fricativeIntensity[i];
      if (intensity && i < this.tractLength - 1) {
        const diameter = this.currentDiameter[i];
        const thinness = min(max(0, 8 * (0.4 - diameter)), 1);
        const openness = min(max(0, 30 * diameter), 1);
        const fricative = intensity * turbulence * thinness * openness;
        prevR[i + 1] += fricative;
        prevL[i + 1] += fricative;
      }

      // compute air pressure in tract
      if (i === 0) {
        R[i] = 0.75 * prevL[i] + glottalOutput;
      } else if (i === this.noseStart) {
        R[i] = reflectionRn * reflectionAmountN + N0 + Rn;
      } else {
        R[i] = -ref * (prevR[i - 1] + prevL[i]) + prevR[i - 1];
      }
      if (i === this.tractLength - 1) {
        L[i] = -0.85 * prevR[i];
      } else if (i === this.noseStart - 1) {
        L[i] = reflectionLn * reflectionAmountN + N0 + Ln;
      } else {
        ref = lerp(this.reflection[i + 1], this.newReflection[i + 1], lambda);
        L[i] = ref * (prevR[i] + prevL[i + 1]) + prevL[i + 1];
      }
      R[i] = min(max(-1, R[i] * 0.9999), 1);
      L[i] = min(max(-1, L[i] * 0.9999), 1);

      // compute air pressure in nose
      if (i < this.noseLength) {
        if (i === 0) {
          noseR[i] = reflectionNl * reflectionAmountN + Ln + Rn;
        } else {
          const reflection = this.noseReflection[i];
          const reflectionAmount = prevNoseR[i - 1] + prevNoseL[i];
          noseR[i] = -reflection * reflectionAmount + prevNoseR[i - 1];
        }
        if (i === this.noseLength - 1) {
          noseL[i] = -0.85 * noseR[i];
        } else {
          const reflection = this.noseReflection[i + 1];
          const reflectionAmount = prevNoseR[i] + prevNoseL[i + 1];
          noseL[i] = reflection * reflectionAmount + prevNoseL[i + 1];
        }
        noseR[i] = min(max(-1, noseR[i] * 0.9999), 1);
        noseL[i] = min(max(-1, noseL[i] * 0.9999), 1);
      }
    }

    return R[this.tractLength - 1] + noseR[this.noseLength - 1];
  }

  setupBlock(dt: number) {
    const { noseStart, tipStart, currentDiameter, diameter } = this;

    let newLastObstruction = -1;
    for (let i = 0; i < this.tractLength; i++) {
      // find peak within fricative range (touches in original Pink Trombone)
      const isFricativePeak =
        i !== 0 &&
        i !== this.tractLength - 1 &&
        diameter[i] > 0 &&
        diameter[i] <= 0.4 &&
        diameter[i] <= diameter[i - 1] &&
        diameter[i] < diameter[i + 1];
      const targetFricativeIntensity = isFricativePeak ? 1 : 0;

      // ficative intensity change (fricative_intensity in original Pink Trombone)
      if (this.fricativeIntensity[i] !== targetFricativeIntensity) {
        const dFric = isFricativePeak ? 10 : -10;
        const prev = this.fricativeIntensity[i];
        this.fricativeIntensity[i] = min(max(0, prev + dFric * dt), 1);
      }

      if (currentDiameter[i] <= 0) newLastObstruction = i;

      // diameter change
      const t = min(max(0, (i - noseStart) / (tipStart - noseStart)), 1);
      currentDiameter[i] =
        currentDiameter[i] < diameter[i]
          ? min(currentDiameter[i] + dt * lerp(9, 15, t), diameter[i])
          : max(diameter[i], currentDiameter[i] - dt * 30);
    }

    // add transient with last obstruction if removed.
    const isVelumClosed = this.currrentVelumDiameter < 0.2;
    const isTractClosed = this.lastObstruction !== -1;
    if (isVelumClosed && isTractClosed && newLastObstruction === -1) {
      this.transients.push({ index: this.lastObstruction, timeAlive: 0 });
    }
    this.lastObstruction = newLastObstruction;

    // velum change
    this.currrentVelumDiameter =
      this.currrentVelumDiameter < this.velumDiameter
        ? min(this.currrentVelumDiameter + dt * 3.75, this.velumDiameter)
        : max(this.velumDiameter, this.currrentVelumDiameter - dt * 1.5);
    const velumA = this.currrentVelumDiameter * this.currrentVelumDiameter;

    // recalculate reflection
    let prevA = 0;
    let nA = 0;
    let n1A = 0;
    for (let i = 0; i < this.tractLength; i++) {
      const A = this.currentDiameter[i] * this.currentDiameter[i]; //ignoring PI etc.
      if (i === noseStart) nA = A;
      if (i === noseStart + 1) n1A = A;
      if (i) {
        this.reflection[i] = this.newReflection[i];
        this.newReflection[i] = A ? (prevA - A) / (prevA + A) : 0.999; // to prevent some bad behaviour if 0
      }
      prevA = A;
    }

    // now recalculate reflection of junction with nose
    this.reflectionLn = this.newReflectionLn;
    this.reflectionRn = this.newReflectionRn;
    this.reflectionNl = this.newReflectionNl;

    const sum = nA + n1A + velumA;
    this.newReflectionLn = (nA - n1A - velumA) / sum;
    this.newReflectionRn = (n1A - nA - velumA) / sum;
    this.newReflectionNl = (velumA - n1A - nA) / sum;
  }

  applyConstriction(constriction: Readonly<TractPoint>) {
    let { index, diameter } = constriction;
    index = (min(max(2, index), 44) / 44) * this.tractLength;
    diameter = min(max(0, diameter - 0.3), maxTongueDiameter);

    const tWidthBase = 0.5682 * this.tractLength;
    const tWidth = min(max(tWidthBase, index), this.tipStart);
    const t = (tWidth - tWidthBase) / (this.tipStart - tWidthBase);
    const maxWidth = 0.2273 * this.tractLength;
    const minWidth = 0.1136 * this.tractLength;
    const width = lerp(maxWidth, minWidth, t);

    const begin = Math.max(Math.round(index) - Math.ceil(width) - 1, 0);
    const end = Math.min(index + width + 1, this.tractLength);
    for (let i = begin; i < end; i++) {
      const prev = this.diameter[i];
      if (prev <= diameter) continue;
      const d = Math.abs(i - index) - 0.5;
      let w = 0;
      if (d > width) w = 1;
      else if (d > 0) w = 0.5 * (1 - Math.cos((Math.PI * d) / width));
      this.diameter[i] = diameter + (prev - diameter) * w;
    }
  }

  setRestDiameter(tongue: Readonly<TractPoint>) {
    let { index, diameter } = tongue;
    index = min(max(0.2727, index / 44), 0.659) * this.tractLength;
    diameter = min(max(minTongueDiameter, diameter), maxTongueDiameter);

    const p1 = Math.floor(0.1591 * this.tractLength);
    const p2 = Math.floor(0.2727 * this.tractLength);
    for (let i = 0; i < this.tractLength; i++) {
      if (i >= this.bladeStart && i < this.lipStart) {
        const t = (index - i) / (this.tipStart - this.bladeStart);
        const fixedDiameter = 2 + (diameter - 2) / 1.5;
        let curve = (1.5 - fixedDiameter + 1.7) * Math.cos(1.1 * Math.PI * t);
        if (i == this.bladeStart - 2 || i == this.lipStart - 1) curve *= 0.8;
        if (i == this.bladeStart || i == this.lipStart - 2) curve *= 0.94;
        this.diameter[i] = 1.5 - curve;
      } else {
        if (i < p1) this.diameter[i] = 0.6;
        else if (i < p2) this.diameter[i] = 1.1;
        else this.diameter[i] = 1.5;
      }
    }
  }
}
