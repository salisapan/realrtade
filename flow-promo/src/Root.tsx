import "./index.css";
import { Composition } from 'remotion';
import { FlowPromo } from './FlowPromo';
import { TOTAL, FPS } from './timeline';
import { FlowPromoHebrew } from './FlowPromoHebrew';
import { TOTAL as TOTAL_HE, FPS as FPS_HE } from './timelineHebrew';

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
      <Composition
        id="FlowCognitiveOSHebrew"
        component={FlowPromoHebrew}
        durationInFrames={TOTAL_HE} // 88 seconds
        fps={FPS_HE}
        width={3840} // 4K Resolution
        height={2160}
      />
    </>
  );
};
