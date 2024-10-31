export function createOrbitalControl(context: BaseAudioContext) {
  const panner = new PannerNode(context, {
    orientationZ: 0,
    panningModel: "HRTF",
    maxDistance: 100,
    distanceModel: "linear",
  });

  const vectorComputer = new AudioWorkletNode(context, "vector-compute", {
    numberOfOutputs: 2,
  });
  const angle = vectorComputer.parameters.get("angle");

  const radiusSource = new ConstantSourceNode(context, { offset: 50 });
  const radius = radiusSource.offset;
  radiusSource.start();

  const xgain = new GainNode(context, { gain: 0 });
  const zgain = new GainNode(context, { gain: 0 });
  vectorComputer.connect(xgain, 0).connect(panner.positionX);
  radiusSource.connect(xgain.gain);
  vectorComputer.connect(zgain, 1).connect(panner.positionZ);
  radiusSource.connect(zgain.gain);

  const negativeGain = () => new GainNode(context, { gain: -1 });
  vectorComputer.connect(negativeGain(), 0).connect(panner.orientationX);
  vectorComputer.connect(negativeGain(), 1).connect(panner.orientationZ);

  return { input: [panner], output: [panner], context, angle, radius };
}
