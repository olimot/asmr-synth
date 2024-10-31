import { invMaxTongueDiameter } from "./shared";

const ONE_THIRD = 1 / 3;

function getSlopeAtPoint(yPrev: number, y: number, yNext: number) {
  const dyPrev = y - yPrev;
  const dyNext = yNext - y;
  if (Math.sign(dyPrev) !== Math.sign(dyNext)) return 0;
  return Math.abs(dyPrev) < Math.abs(dyNext) ? dyPrev : dyNext;
}

export default function drawTract(
  context: CanvasRenderingContext2D,
  diameter: Float32Array,
) {
  const { width, height } = context.canvas;

  context.fillStyle = "rgb(81, 64, 68)";
  context.fillRect(0, 0, width, height);

  const xs = Array(diameter.length);
  const ys = Array(diameter.length);
  context.beginPath();
  for (let i = 0; i < diameter.length; i++) {
    const t = i / (diameter.length - 1);
    const v = diameter[i] * invMaxTongueDiameter;

    xs[i] = width * t;
    ys[i] = height * v;
    context.moveTo(xs[i], 0);
    context.lineTo(xs[i], height);
  }
  context.lineWidth = 1;
  context.strokeStyle = "#1e1e1e";
  context.stroke();

  context.beginPath();
  context.moveTo(xs[0], ys[0]);
  for (let i = 1; i < diameter.length; i++) {
    const cp1x = xs[i - 1] * (1 - ONE_THIRD) + xs[i] * ONE_THIRD;
    const cp2x = xs[i - 1] * ONE_THIRD + xs[i] * (1 - ONE_THIRD);
    const prev = ys[i - 1 > 0 ? i - 2 : i - 1];
    const a = ys[i - 1];
    const b = ys[i];
    const next = ys[i < diameter.length - 1 ? i + 1 : i];
    const cp1y = a + ONE_THIRD * getSlopeAtPoint(prev, a, b);
    const cp2y = b - ONE_THIRD * getSlopeAtPoint(a, b, next);
    context.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, xs[i], ys[i]);
  }
  context.lineTo(xs.at(-1), height);
  context.lineTo(0, height);
  context.fillStyle = "rgb(249, 192, 203)";
  context.fill();
}
