class VectorComputeProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: "angle", defaultValue: 0, automationRate: "a-rate" }];
  }

  process(
    _: never,
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ) {
    const blockLength = outputs[0][0].length;
    for (let i = 0; i < blockLength; i += 1) {
      const angle = parameters.angle[i] ?? parameters.angle[0];
      outputs[0][0][i] = Math.sin(angle);
      outputs[1][0][i] = Math.cos(angle);
    }
    return true;
  }
}

registerProcessor("vector-compute", VectorComputeProcessor);
