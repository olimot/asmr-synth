export class NoiseGeneratorProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: "gain", defaultValue: 1, automationRate: "a-rate" }];
  }

  process(
    _: never,
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ) {
    for (let i = 0; i < outputs.length; i += 1) {
      const channels = outputs[i];
      for (let j = 0; j < channels.length; j += 1) {
        const samples = channels[j];
        for (let k = 0; k < samples.length; k += 1) {
          const gain = parameters.gain[k] ?? parameters.gain[0];
          samples[k] = 1 - 2 * Math.random() * gain;
        }
      }
    }
    return true;
  }
}

registerProcessor("noise-generator", NoiseGeneratorProcessor);
