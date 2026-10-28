import { Composition, type CalculateMetadataFunction } from "remotion";
import earthFall from "../episodes/earth-fall.json";
import earthWater from "../episodes/earth-water.json";
import { Descent } from "./descent/Descent";
import { mariana } from "./descent/episodes/mariana";
import { episodeSchema, type Episode } from "./descent/types";
import { Fall } from "./fall/Fall";
import { fallSchema, type FallEpisode } from "./fall/types";
import { Orbit } from "./orbit/Orbit";
import { skitSpan, type SkitData } from "./shared/Skit";
import { orbitSchema, type OrbitEpisode } from "./orbit/types";
import { Scale } from "./scale/Scale";
import { scaleSchema, type ScaleEpisode } from "./scale/types";
import starsScale from "./scale/example.json";

// Length comes from the episode itself: the last keyframe or narration line, whichever ends later.
const lengthOf = (props: { keyframes: [number, number][]; narration: { to: number }[]; fps: number; skit?: SkitData }) => {
  const end = Math.max(props.keyframes[props.keyframes.length - 1][0], ...props.narration.map((n) => n.to), skitSpan(props)?.[1] ?? 0);
  return { durationInFrames: Math.ceil(end * props.fps), fps: props.fps };
};
const descentMetadata: CalculateMetadataFunction<Episode> = ({ props }) => lengthOf(props);
const fallMetadata: CalculateMetadataFunction<FallEpisode> = ({ props }) => lengthOf(props);
const orbitMetadata: CalculateMetadataFunction<OrbitEpisode> = ({ props }) => lengthOf(props);
// Scale has no keyframes: it lasts as long as its narration and the skit.
const scaleMetadata: CalculateMetadataFunction<ScaleEpisode> = ({ props }) => {
  const end = Math.max(...props.narration.map((n) => n.to), skitSpan(props)?.[1] ?? 0);
  return { durationInFrames: Math.ceil(end * (props.fps ?? 30)), fps: props.fps ?? 30 };
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Descent"
        component={Descent}
        schema={episodeSchema}
        defaultProps={mariana}
        calculateMetadata={descentMetadata}
        durationInFrames={1800}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="Fall"
        component={Fall}
        schema={fallSchema}
        defaultProps={fallSchema.parse(earthFall)}
        calculateMetadata={fallMetadata}
        durationInFrames={1800}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="Orbit"
        component={Orbit}
        schema={orbitSchema}
        defaultProps={orbitSchema.parse(earthWater)}
        calculateMetadata={orbitMetadata}
        durationInFrames={1800}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="Scale"
        component={Scale}
        schema={scaleSchema}
        defaultProps={scaleSchema.parse(starsScale)}
        calculateMetadata={scaleMetadata}
        durationInFrames={1800}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
