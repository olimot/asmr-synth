import {
  ConstrictionProps,
  PinkTromboneProps,
  Schedules,
  TractPoint,
  createClient,
} from "./shared";

export const preset = {
  kh: { index: 20, diameter: 1.55 },
  uh: { index: 17.8, diameter: 2.5 },
  ah: { index: 12, diameter: 2.2 },
  eo: { index: 18, diameter: 2.15 },
  e: { index: 21, diameter: 2.15 },
  eu: { index: 24, diameter: 2.15 },
  eh: { index: 19.5, diameter: 3.5 },
  ee: { index: 34, diameter: 2.5 },
  diameter: [0.305, 0.32, 0.45, 0.7],
  k: 20,
  t: 34,
  p: 41,
};

export interface ConstrictionContainer {
  updateConstriction(
    id: string,
    ...mods: Schedules<ConstrictionProps>
  ): Promise<unknown>;
  removeConstriction(id: string): Promise<unknown>;
}

export class Constriction {
  container: ConstrictionContainer;
  id: Promise<string>;

  constructor(pinkTrombone: ConstrictionContainer, id: Promise<string>) {
    this.container = pinkTrombone;
    this.id = id;
  }

  async set(...modifications: Schedules<ConstrictionProps>) {
    const id = await this.id;
    return this.container.updateConstriction(id, ...modifications);
  }

  async remove() {
    const id = await this.id;
    return this.container.removeConstriction(id);
  }
}

export class PinkTromboneNode extends AudioWorkletNode {
  request = createClient(this.port);

  constructor(context: BaseAudioContext, options?: { tractLengthCm?: number }) {
    super(context, "pink-trombone", { processorOptions: options });
  }

  getDiameter() {
    return this.request<Float32Array>("getDiameter");
  }

  set(...mods: Schedules<PinkTromboneProps>) {
    return this.request("set", mods);
  }

  setTongue(...mods: Schedules<TractPoint>) {
    return this.request("setTongue", mods);
  }

  createConstriction(init?: Partial<ConstrictionProps>) {
    const constriction = { index: 24, diameter: 3.3, isActive: true, ...init };
    const id = this.request<string>("createConstriction", [constriction]);
    return new Constriction(this, id);
  }

  updateConstriction(id: string, ...mods: Schedules<ConstrictionProps>) {
    return this.request("updateConstriction", [id, ...mods]);
  }

  removeConstriction(id: string) {
    return this.request("removeConstriction", [id]);
  }
}
