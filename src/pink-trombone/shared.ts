export const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t;

export const TAU = 2 * Math.PI;

export const minTongueDiameter = 1.55;

export const maxTongueDiameter = 3.5;

export type TractPoint = { index: number; diameter: number };

export type ConstrictionProps = {
  index: number;
  diameter: number;
  isActive: boolean;
};

export function gradientNoise(rate = 1) {
  let [a, b, cursor] = [1 - 2 * Math.random(), 1 - 2 * Math.random(), 0];
  return (x: number) => {
    x *= rate;
    const i = Math.floor(x);
    const f = x - i;
    if (cursor < i) [a, b, cursor] = [b, 1 - 2 * Math.random(), i];
    return lerp(a, b, f * f * (3 - 2 * f));
  };
}

export function createBiquadFilter(
  a0: number,
  a1: number,
  a2: number,
  b1: number,
  b2: number,
) {
  const state = new Float64Array(4);
  return (xn: number) => {
    const [ym2, ym1, xm2, xm1] = state;
    const yn = a0 * xn + a1 * xm1 + a2 * xm2 - b1 * ym1 - b2 * ym2;
    state.set([ym1, yn, xm1, xn]);
    return yn;
  };
}

export function lowpass(frequency: number, q: number, sampleRate: number) {
  const w = (2 * Math.PI * frequency) / sampleRate;
  const alpha = Math.sin(w) / (2 * q);
  const cs = Math.cos(w);
  const b0 = 1 + alpha;
  const a0 = (1 - cs) / (2 * b0);
  const a1 = (1 - cs) / b0;
  const a2 = (1 - cs) / (2 * b0);
  const b1 = (-2 * cs) / b0;
  const b2 = (1 - alpha) / b0;
  return createBiquadFilter(a0, a1, a2, b1, b2);
}

export function bandpass(frequency: number, q: number, sampleRate: number) {
  const w = (2 * Math.PI * frequency) / sampleRate;
  const alpha = Math.sin(w) / (2 * q);
  const b0 = 1 + alpha;
  const a0 = alpha / b0;
  const a1 = 0;
  const a2 = -alpha / b0;
  const b1 = (-2 * Math.cos(w)) / b0;
  const b2 = (1 - alpha) / b0;
  return createBiquadFilter(a0, a1, a2, b1, b2);
}

export type PinkTromboneProps = {
  isActive: boolean;
  peakStart: boolean;
  autoWobble: boolean;
  voiceness: number;
  frequency: number;
  velumDiameter: number;
  vibratoAmount: number;
  vibratoFrequency: number;
};

export type Scheduled<T> = T & { time: number; flag?: "cancel" | "flush" };

export interface JSONRPCRequest {
  id: string;
  method: string;
  params: unknown[];
}

export interface JSONRPCResponse {
  id: string;
  result?: unknown;
  error?: JSONRPCError;
}

export interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MethodMap = Record<string, (...params: any[]) => unknown>;

export function createServer(
  portLike: {
    onmessage: ((e: MessageEvent) => unknown) | null;
    postMessage(message: unknown): void;
  },
  methods: MethodMap,
) {
  portLike.onmessage = async (e: MessageEvent) => {
    const request: JSONRPCRequest = e.data;
    if (!(request.method in methods)) return;
    try {
      const result = await methods[request.method](...request.params);
      const response: JSONRPCResponse = { id: request.id, result };
      portLike.postMessage(response);
    } catch (cause) {
      if (!(cause instanceof Error)) throw cause;
      const error: JSONRPCError = {
        message: cause.message,
        code: "code" in cause ? Number(cause.code) : -1,
        ...("data" in cause && { data: cause.data }),
      };
      const response: JSONRPCResponse = { id: request.id, error };
      portLike.postMessage(response);
    }
  };
}

let idInc = 0;

export function createClient(portLike: {
  onmessage: ((e: MessageEvent) => unknown) | null;
  postMessage(message: unknown): void;
}) {
  type Waiter = {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
  };
  const waitings: Record<string, Waiter> = {};

  portLike.onmessage = (e: Event) => {
    const message: JSONRPCResponse = (e as MessageEvent).data;
    if (!(message.id in waitings)) return;
    const { resolve, reject } = waitings[message.id];
    if (message.error) reject(message.error);
    else resolve(message.result);
    delete waitings[message.id];
  };

  return <T = unknown>(method: string, params: unknown[] = []) => {
    return new Promise<T>((resolve, reject) => {
      const id = (idInc++).toString(36);
      portLike.postMessage({ id, method, params });
      waitings[id] = { resolve, reject } as Waiter;
    });
  };
}

export const invMaxTongueDiameter = 1 / maxTongueDiameter;

export const normalizeDiameter = (diameters: Float64Array) => {
  const out = Array<number>(diameters.length);
  for (let i = 0; i < diameters.length; i++) {
    out[i] = diameters[i] * invMaxTongueDiameter;
  }
  return out;
};

export type Schedules<T> = Partial<Scheduled<T>>[];
