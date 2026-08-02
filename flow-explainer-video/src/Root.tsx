import "./index.css";
import { Composition, Folder } from "remotion";
import { FlowExplainer } from "./FlowExplainer";
import { Scene1Chaos } from "./scenes/Scene1Chaos";
import { Scene2Solution } from "./scenes/Scene2Solution";
import { Scene3Architecture } from "./scenes/Scene3Architecture";
import { Scene4IntentCompiler } from "./scenes/Scene4IntentCompiler";
import { Scene5ActionHub } from "./scenes/Scene5ActionHub";
import { Scene6Security } from "./scenes/Scene6Security";
import { Scene7Outro } from "./scenes/Scene7Outro";

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
          id="Scene5ActionHub"
          component={Scene5ActionHub}
          durationInFrames={540}
          fps={60}
          width={1920}
          height={1080}
        />
        <Composition
          id="Scene6Security"
          component={Scene6Security}
          durationInFrames={780}
          fps={60}
          width={1920}
          height={1080}
        />
        <Composition
          id="Scene7Outro"
          component={Scene7Outro}
          durationInFrames={600}
          fps={60}
          width={1920}
          height={1080}
        />
      </Folder>
      <Composition
        id="FlowExplainer"
        component={FlowExplainer}
        durationInFrames={4500}
        fps={60}
        width={1920}
        height={1080}
      />
    </>
  );
};
