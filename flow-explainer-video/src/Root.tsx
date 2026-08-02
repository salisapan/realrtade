import "./index.css";
import { Composition, Folder } from "remotion";
import { FlowExplainer } from "./FlowExplainer";
import { Scene1Chaos } from "./scenes/Scene1Chaos";
import { Scene2Solution } from "./scenes/Scene2Solution";
import { Scene3Architecture } from "./scenes/Scene3Architecture";
import { Scene4Security } from "./scenes/Scene4Security";
import { Scene5Outro } from "./scenes/Scene5Outro";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="Flow-Explainer-Scenes">
        <Composition
          id="Scene1Chaos"
          component={Scene1Chaos}
          durationInFrames={600}
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
          id="Scene4Security"
          component={Scene4Security}
          durationInFrames={780}
          fps={60}
          width={1920}
          height={1080}
        />
        <Composition
          id="Scene5Outro"
          component={Scene5Outro}
          durationInFrames={600}
          fps={60}
          width={1920}
          height={1080}
        />
      </Folder>
      <Composition
        id="FlowExplainer"
        component={FlowExplainer}
        durationInFrames={3580}
        fps={60}
        width={1920}
        height={1080}
      />
    </>
  );
};
