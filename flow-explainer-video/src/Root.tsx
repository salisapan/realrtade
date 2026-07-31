import "./index.css";
import { Composition, Folder } from "remotion";
import { FlowExplainer } from "./FlowExplainer";
import { Scene1Chaos } from "./scenes/Scene1Chaos";
import { Scene2Solution } from "./scenes/Scene2Solution";
import { Scene3Security } from "./scenes/Scene3Security";
import { Scene4Outro } from "./scenes/Scene4Outro";

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
          durationInFrames={720}
          fps={60}
          width={1920}
          height={1080}
        />
        <Composition
          id="Scene3Security"
          component={Scene3Security}
          durationInFrames={780}
          fps={60}
          width={1920}
          height={1080}
        />
        <Composition
          id="Scene4Outro"
          component={Scene4Outro}
          durationInFrames={600}
          fps={60}
          width={1920}
          height={1080}
        />
      </Folder>
      <Composition
        id="FlowExplainer"
        component={FlowExplainer}
        durationInFrames={2640}
        fps={60}
        width={1920}
        height={1080}
      />
    </>
  );
};
