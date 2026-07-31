import React from "react";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Scene1Chaos } from "./scenes/Scene1Chaos";
import { Scene2Solution } from "./scenes/Scene2Solution";
import { Scene3Security } from "./scenes/Scene3Security";
import { Scene4Outro } from "./scenes/Scene4Outro";

export const FlowExplainer: React.FC = () => {
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={600} name="Chaos">
        <Scene1Chaos />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 20 })}
      />
      <TransitionSeries.Sequence durationInFrames={720} name="Flow Solution">
        <Scene2Solution />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 20 })}
      />
      <TransitionSeries.Sequence durationInFrames={780} name="Security">
        <Scene3Security />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 20 })}
      />
      <TransitionSeries.Sequence durationInFrames={600} name="Outro">
        <Scene4Outro />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
