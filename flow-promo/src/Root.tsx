import "./index.css";
import { Composition } from 'remotion';
import { FlowPromo } from './FlowPromo';
import { TOTAL, FPS } from './timeline';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="FlowCognitiveOS"
        component={FlowPromo}
        durationInFrames={TOTAL} // 26 seconds
        fps={FPS}
        width={3840} // 4K Resolution
        height={2160}
      />
    </>
  );
};
