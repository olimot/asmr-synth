export interface AudioModule {
  /* components that will be connected from previous component */
  readonly input: Component[];

  /* components that will be connected to previous component */
  readonly output: Component[];

  /* AudioContext that this belongs to */
  readonly context: BaseAudioContext;
}

export type Component = AudioNode | AudioModule;

export function single(component: AudioNode): AudioModule {
  return {
    input: [component],
    output: [component],
    context: component.context,
  };
}

export function parallel(...components: Component[]): AudioModule {
  if (components.length < 2) throw new TypeError("Not enough argument.");
  return {
    input: components.flatMap((m) => ("input" in m ? m.input : [m])),
    output: components.flatMap((m) => ("output" in m ? m.output : [m])),
    context: components[0].context,
  };
}

export function series(...components: Component[]): AudioModule {
  if (components.length < 2) throw new TypeError("Not enough argument.");
  if (components.length > 2) {
    return components.reduce((a, b) => series(a, b)) as AudioModule;
  }
  const [src, dst] = components;

  if (src instanceof AudioNode) {
    if (dst instanceof AudioNode) src.connect(dst);
    else dst.input.forEach((subdst) => series(src, subdst));
    return { input: [src], output: [dst], context: src.context };
  }
  src.output.forEach((subsrc) => series(subsrc, dst));
  return { input: [src], output: [dst], context: src.context };
}

export function disconnect(component: Component) {
  if (component instanceof AudioNode) {
    component.disconnect();
  } else {
    component.input.forEach(disconnect);
    component.output.forEach(disconnect);
  }
}
