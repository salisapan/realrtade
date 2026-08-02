import React from "react";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Scene1Chaos } from "./scenes/Scene1Chaos";
import { Scene2Solution } from "./scenes/Scene2Solution";
import { Scene3Architecture } from "./scenes/Scene3Architecture";
import { Scene4IntentCompiler } from "./scenes/Scene4IntentCompiler";
import { Scene5ActionHub } from "./scenes/Scene5ActionHub";
import { Scene6Security } from "./scenes/Scene6Security";
import { Scene7Outro } from "./scenes/Scene7Outro";

export const FlowExplainer: React.FC = () => {
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={480} name="Chaos">
        <Scene1Chaos />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 20 })}
      />
      <TransitionSeries.Sequence durationInFrames={840} name="Flow Solution">
        <Scene2Solution />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 20 })}
      />
      <TransitionSeries.Sequence
        durationInFrames={840}
        name="Dual-Core Architecture"
      >
        <Scene3Architecture />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 20 })}
      />
      <TransitionSeries.Sequence
        durationInFrames={540}
        name="Intent Compiler"
      >
        <Scene4IntentCompiler />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 20 })}
      />
      <TransitionSeries.Sequence durationInFrames={540} name="Action Hub">
        <Scene5ActionHub />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 20 })}
      />
      <TransitionSeries.Sequence durationInFrames={780} name="Security">
        <Scene6Security />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 20 })}
      />
      <TransitionSeries.Sequence durationInFrames={600} name="Outro">
        <Scene7Outro />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
