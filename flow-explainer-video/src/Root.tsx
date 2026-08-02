import "./index.css";
import { Composition, Folder } from "remotion";
import { FlowExplainer } from "./FlowExplainer";
import { Scene1Chaos } from "./scenes/Scene1Chaos";
import { Scene2Solution } from "./scenes/Scene2Solution";
import { Scene3Architecture } from "./scenes/Scene3Architecture";
import { Scene4IntentCompiler } from "./scenes/Scene4IntentCompiler";
import { Scene5ActionGraph } from "./scenes/Scene5ActionGraph";
import { Scene6ActionHub } from "./scenes/Scene6ActionHub";
import { Scene7Security } from "./scenes/Scene7Security";
import { Scene8Outro } from "./scenes/Scene8Outro";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="Flow-Explainer-Scenes">
        <Composition
          id="Scene1Chaos"
          component={Scene1Chaos}
          durationInFrames={480}
          fps={60}
          width={1920}
          height={1080}
        />
        <Composition
          id="Scene2Solution"
          component={Scene2Solution}
          durationInFrames={840}
          fps={60}
          width={1920}
          height={1080}
        />
        <Composition
          id="Scene3Architecture"
          component={Scene3Architecture}
          durationInFrames={840}
          fps={60}
          width={1920}
          height={1080}
        />
        <Composition
          id="Scene4IntentCompiler"
          component={Scene4IntentCompiler}
          durationInFrames={540}
          fps={60}
          width={1920}
          height={1080}
        />
        <Composition
          id="Scene5ActionGraph"
          component={Scene5ActionGraph}
          durationInFrames={720}
          fps={60}
          width={1920}
          height={1080}
        />
        <Composition
          id="Scene6ActionHub"
          component={Scene6ActionHub}
          durationInFrames={540}
          fps={60}
          width={1920}
          height={1080}
        />
        <Composition
          id="Scene7Security"
          component={Scene7Security}
          durationInFrames={780}
          fps={60}
          width={1920}
          height={1080}
        />
        <Composition
          id="Scene8Outro"
          component={Scene8Outro}
          durationInFrames={600}
          fps={60}
          width={1920}
          height={1080}
        />
      </Folder>
      <Composition
        id="FlowExplainer"
        component={FlowExplainer}
        durationInFrames={5200}
        fps={60}
        width={1920}
        height={1080}
      />
    </>
  );
};
