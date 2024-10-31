import { Component, series } from "./util";

const minFreq = 20;
const maxFreq = 20000;
const expRange = Math.log(maxFreq / minFreq);
const nSplit = 31;
const expStep = expRange / (nSplit - 1);

export const equalizerFrequencies = [...Array(nSplit)].map((_, i) => {
  return minFreq * Math.E ** (i * expStep);
});

const initialEqualizerValues = equalizerFrequencies.map(() => 0);

export const equalLoudnessContour = [
  1, 0.901, 0.8075, 0.71986, 0.6433, 0.5696, 0.4981, 0.4348, 0.3772, 0.3188,
  0.2701, 0.2266, 0.186, 0.1499, 0.1232, 0.1009, 0.08611, 0.08623, 0.1018,
  0.09156, 0.05241, 0.01747, 0, 0.009416, 0.05476, 0.1401, 0.2223, 0.2526,
  0.239, 0.2742, 0.9718,
].map((v) => Math.round(v * 11 - 3));

type Falsy = false | 0 | "" | null | undefined;

export function equalize(
  context: BaseAudioContext,
  values?: number[] | Falsy,
): Component {
  const nodes = [];
  values ||= initialEqualizerValues;
  for (let i = 0; i < values.length; i++) {
    const filterNode = new BiquadFilterNode(context, { channelCount: 2 });
    filterNode.frequency.value = equalizerFrequencies[i];
    filterNode.gain.value = values[i];
    if (i === 0) {
      filterNode.type = "lowshelf";
    } else if (i === values.length - 1) {
      filterNode.type = "highshelf";
    } else {
      filterNode.type = "peaking";
      filterNode.Q.value =
        filterNode.frequency.value /
        (equalizerFrequencies[i + 1] - equalizerFrequencies[i - 1]);
    }
    nodes.push(filterNode);
  }

  return series(...nodes);
}
