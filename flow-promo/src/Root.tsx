import "./index.css";
import { Composition } from 'remotion';
import { FlowPromo } from './FlowPromo';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="FlowCognitiveOS"
        component={FlowPromo}
        durationInFrames={1200} // 20 seconds @ 60fps
        fps={60}
        width={3840} // 4K Resolution
        height={2160}
      />
    </>
  );
};
