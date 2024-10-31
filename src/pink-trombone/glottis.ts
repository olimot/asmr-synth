import { TAU, bandpass, lerp, gradientNoise } from "./shared";

const { PI, exp, sqrt, sin, acos, min, max, log } = Math;

export default class Glottis {
  isActive = false;
  voiceness = 0.0;
  peakStart = true;
  autoWobble = true;
  frequency = 120;
  vibratoAmount = 0.005;
  vibratoFrequency = 6;
  readonly timeStep: number;

  alpha = 0;
  E0 = 0;
  epsilon = 0;
  shift = 0;
  delta = 0;
  Te = 0;
  omega = 0;
  totalTime = 0;
  timeInWaveform = 0;
  waveformLength = -1;
  intensity = 0;
  currentFrequency = 120;
  oldFrequency = 120;
  newFrequency = 120;
  currentVoiceness = 0.0;
  oldVoiceness = 0.0;
  newVoiceness = 0.0;
  voicenessAmplitudeMultiplier = 0;

  aspirationBandpass: (xn: number) => number;

  aspirationNoise = () => this.aspirationBandpass(1 - 2 * Math.random());

  aspirationRand = [this.aspirationNoise, gradientNoise(1.99)];

  vibratoRand = [4.07, 2.15, 0.98, 0.5].map(gradientNoise);

  voicenessRand = [0.46, 0.36].map(gradientNoise);

  constructor(processRate: number) {
    this.timeStep = 1 / processRate;
    this.aspirationBandpass = bandpass(500, 0.7071, processRate);
  }

  sampleWaveform(lambda: number) {
    const frequency = lerp(this.oldFrequency, this.newFrequency, lambda);
    const tenseness = lerp(this.oldVoiceness, this.newVoiceness, lambda);
    if (this.timeInWaveform > this.waveformLength) {
      this.timeInWaveform -= this.waveformLength;
      this.waveformLength = 1 / frequency;

      const Rd = min(max(0.5, 3 * (1 - tenseness)), 2.7);
      // normalized to time = 1, Ee = 1
      const Ra = -0.01 + 0.048 * Rd;
      const Rk = 0.224 + 0.118 * Rd;
      const x = 0.5 + 1.2 * Rk;
      const Rg = ((Rk / 4) * x) / (0.11 * Rd - Ra * x);
      const Tp = 1 / (2 * Rg);
      this.omega = PI / Tp;
      this.epsilon = 1 / Ra; // = 1 / Ta
      this.Te = Tp + Tp * Rk;
      this.shift = exp(-this.epsilon * (1 - this.Te));
      this.delta = 1 - this.shift; //divide by this to scale RHS

      const RHSIntegral =
        ((1 / this.epsilon) * (this.shift - 1) + (1 - this.Te) * this.shift) /
        this.delta;
      const totalLowerIntegral = -(this.Te - Tp) / 2 + RHSIntegral;
      const totalUpperIntegral = -totalLowerIntegral;
      const s = sin(this.omega * this.Te);
      const z = log((-PI * s * totalUpperIntegral) / (Tp * 2));
      this.alpha = z / (Tp / 2 - this.Te);
      this.E0 = -1 / (s * exp(this.alpha * this.Te));
    }

    const tW = this.timeInWaveform / this.waveformLength;

    return tW > this.Te
      ? (-exp(-this.epsilon * (tW - this.Te)) + this.shift) / this.delta
      : this.E0 * exp(this.alpha * tW) * sin(this.omega * tW);
  }

  sample(
    input: number | undefined,
    lambda: number,
  ): [vocalOutput: number, noiseModulator: number] {
    this.totalTime += this.timeStep;
    this.timeInWaveform += this.timeStep;
    const wf = this.sampleWaveform(lambda);
    let out = input ?? wf;
    out *= this.intensity * this.voicenessAmplitudeMultiplier;

    const tW = this.timeInWaveform / this.waveformLength;
    const t = this.intensity * this.currentVoiceness;
    let noiseModulator = lerp(0.3, 0.3 * max(0, sin(TAU * tW)), t);
    noiseModulator *= this.intensity;
    noiseModulator *= 4; // added for more ASMRness. if you have better solution for this, please change it.

    const af = 20000;
    let aspiration = this.aspirationRand[0](this.totalTime * af);
    aspiration *= 0.2 + 0.02 * this.aspirationRand[1](this.totalTime * af);
    aspiration *= 1 - sqrt(this.currentVoiceness);
    return [out + noiseModulator * aspiration, noiseModulator];
  }

  setupBlock(dt: number) {
    let vibrato = 0;
    vibrato +=
      this.vibratoAmount * sin(TAU * this.totalTime * this.vibratoFrequency);
    vibrato += 0.02 * this.vibratoRand[0](this.totalTime);
    vibrato += 0.04 * this.vibratoRand[1](this.totalTime);
    if (this.autoWobble) {
      vibrato += 0.2 * this.vibratoRand[2](this.totalTime);
      vibrato += 0.4 * this.vibratoRand[3](this.totalTime);
    }

    // compute start and end of frequency change in block
    const isFrequencyChanged = this.frequency !== this.currentFrequency;
    if (this.frequency > this.currentFrequency) {
      this.currentFrequency = min(this.currentFrequency * 1.1, this.frequency);
    } else if (this.frequency < this.currentFrequency) {
      this.currentFrequency = max(this.frequency, this.currentFrequency * 0.9);
    }

    if (isFrequencyChanged && this.frequency === this.currentFrequency) {
      const freq = 3.5714285714285716 * this.frequency;
      this.aspirationBandpass = bandpass(freq, 0.5, sampleRate);
    }
    this.oldFrequency = this.newFrequency;
    this.newFrequency = this.currentFrequency * (1 + vibrato);

    // compute start and end of tenseness in block
    this.oldVoiceness = this.newVoiceness;
    this.newVoiceness =
      this.currentVoiceness +
      0.1 * this.voicenessRand[0](this.totalTime) +
      0.05 * this.voicenessRand[1](this.totalTime);

    if (this.peakStart) {
      this.newVoiceness += (2 - this.currentVoiceness) * (1 - this.intensity);
    }

    this.voicenessAmplitudeMultiplier =
      acos(1 - min(max(0, this.currentVoiceness), 1)) / (Math.PI * 0.5);

    // intensity change
    const speed = this.isActive ? 3.0465 : -5;
    this.intensity = min(max(0, this.intensity + speed * dt), 1);

    // voiceness change
    this.currentVoiceness =
      this.currentVoiceness < this.voiceness
        ? min(this.currentVoiceness + 3 * dt, this.voiceness)
        : max(this.voiceness, this.currentVoiceness - 3 * dt);
  }
}
