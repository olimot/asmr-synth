declare const sampleRate: number;

declare const currentTime: number;

declare const currentFrame: number;

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new (
    options?: AudioWorkletNodeOptions,
  ) => AudioWorkletProcessor,
): void;

declare interface AudioParamMap {
  get(name: string): AudioParam;
}
