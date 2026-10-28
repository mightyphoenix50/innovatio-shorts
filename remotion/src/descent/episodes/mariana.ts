import type { Episode } from "../types";

/**
 * The Descent, episode 1: the Mariana Trench (60-second Short).
 * Every number in the narration is checked against a source:
 * - Challenger Deep about 10,935 m: NOAA Ocean Exploration
 * - Everest 8,849 m: Nepal/China joint survey, 2020
 * - Pressure ~1 atm per 10 m of seawater; >1,000 atm at the bottom: NOAA
 * - Deepest fish filmed, a snailfish at 8,336 m (2022, Izu-Ogasawara Trench): Univ. of Western Australia
 * - Sunlight zone to ~200 m, no sunlight below ~1,000 m: NOAA
 */
export const mariana: Episode = {
  title: "The Mariana Trench",
  fps: 30,
  keyframes: [
    [0, 0],
    [2.5, 0],
    [8, 200],
    [14, 1000],
    [22, 4000],
    [28, 6000],
    [36, 8300],
    [41, 8450],
    [48, 10935],
    [60, 10935],
  ],
  maxDepth: 10935,
  colours: [
    [0, [42, 143, 189]],
    [200, [14, 74, 120]],
    [1000, [3, 22, 46]],
    [4000, [1, 9, 18]],
    [11000, [0, 2, 5]],
  ],
  zones: [
    { from: 0, to: 200, name: "Sunlight zone", colour: "#8fd8f0" },
    { from: 200, to: 1000, name: "Twilight zone", colour: "#3f8fb8" },
    { from: 1000, to: 4000, name: "Midnight zone", colour: "#1f5a84" },
    { from: 4000, to: 6000, name: "Abyssal zone", colour: "#2d4f8c" },
    { from: 6000, to: 11000, name: "Hadal zone", colour: "#8a6fc0" },
  ],
  temperature: [
    [0, 26],
    [200, 18],
    [1000, 4],
    [4000, 1.6],
    [11000, 2.5],
  ],
  creatures: [
    { depth: 40, x: 0.25, kind: "turtle" },
    { depth: 110, x: 0.7, kind: "fish" },
    { depth: 520, x: 0.3, kind: "lantern" },
    { depth: 700, x: 0.72, kind: "jelly" },
    { depth: 880, x: 0.3, kind: "squid" },
    { depth: 1600, x: 0.62, kind: "whale" },
    { depth: 2600, x: 0.3, kind: "angler" },
    { depth: 3400, x: 0.7, kind: "gulper" },
    { depth: 4500, x: 0.32, kind: "dumbo" },
    { depth: 5400, x: 0.72, kind: "jelly" },
    { depth: 6800, x: 0.3, kind: "cuc" },
    { depth: 7600, x: 0.7, kind: "cuc" },
    { depth: 8380, x: 0.62, kind: "snail" },
    { depth: 10900, x: 0.62, kind: "amph" },
    { depth: 10985, x: 0.5, kind: "xeno" },
    { depth: 10990, x: 0.25, kind: "amph" },
  ],
  narration: [
    { from: 0, to: 2.5, heading: "The Mariana Trench", text: "This is how deep the ocean really goes." },
    { from: 2.5, to: 8, heading: "Sunlight zone", text: "Only the top 200 metres get enough sunlight for plants to grow." },
    { from: 8, to: 14, heading: "Twilight zone", text: "By 1,000 metres the sun is gone. Animals here make their own light." },
    { from: 14, to: 22, heading: "Midnight zone", text: "Sperm whales dive here to hunt. Anglerfish dangle glowing lures in total darkness." },
    { from: 22, to: 28, heading: "Abyssal zone", text: "At 4,000 metres the water presses 400 times harder than at the surface." },
    { from: 28, to: 36, heading: "Hadal zone", text: "Below 6,000 metres you're inside the trench, a place almost nothing else on Earth reaches." },
    { from: 36, to: 41, heading: "Snailfish", text: "A snailfish filmed at 8,336 metres is the deepest fish ever seen." },
    { from: 41, to: 48, heading: "The final drop", text: "The pressure passes 1,000 atmospheres on the way down." },
    { from: 48, to: 53, heading: "Challenger Deep, 10,935 m", text: "Put Everest here and its peak would still be 2 kilometres underwater." },
    { from: 53, to: 60, heading: "Why it's so deep", text: "The Pacific plate is sliding underneath the Philippine plate, dragging the seafloor down." },
  ],
  comparison: { label: "Everest", height: 8849, showAfter: 7000 },
  platesAt: 53,
  seed: "mariana-1",
  series: "The Descent",
  youtube: {
    titles: ["How deep is the Mariana Trench, really?", "Sinking 11 km to the bottom of the ocean"],
    description:
      "A 50-second dive from the surface to Challenger Deep, about 10,935 metres down, through every zone of the ocean: the light running out, the pressure climbing past 1,000 atmospheres, and the animals that live at each depth.",
    tags: ["mariana trench", "challenger deep", "deep sea", "ocean zones", "snailfish", "ocean science", "science shorts"],
  },
  sources: [
    { claim: "Challenger Deep is about 10,935 m deep", url: "https://oceanservice.noaa.gov/facts/oceandepth.html" },
    { claim: "Ocean zones and their depths", url: "https://www.whoi.edu/ocean-learning-hub/ocean-topics/how-the-ocean-works/ocean-zones/" },
    { claim: "Deepest fish ever filmed, a snailfish at 8,336 m", url: "https://uwa.edu.au/news/Article/2023/April/Scientists-break-new-record-after-finding-worlds-deepest-fish" },
  ],
};
