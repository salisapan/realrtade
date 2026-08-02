import React from "react";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Scene1Chaos } from "./scenes/Scene1Chaos";
import { Scene2Solution } from "./scenes/Scene2Solution";
import { Scene3Architecture } from "./scenes/Scene3Architecture";
import { Scene4IntentCompiler } from "./scenes/Scene4IntentCompiler";
import { Scene5ActionGraph } from "./scenes/Scene5ActionGraph";
import { Scene6ActionHub } from "./scenes/Scene6ActionHub";
import { Scene7Security } from "./scenes/Scene7Security";
import { Scene8Outro } from "./scenes/Scene8Outro";

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
      <TransitionSeries.Sequence durationInFrames={720} name="Action Graph">
        <Scene5ActionGraph />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 20 })}
      />
      <TransitionSeries.Sequence durationInFrames={540} name="Action Hub">
        <Scene6ActionHub />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 20 })}
      />
      <TransitionSeries.Sequence durationInFrames={780} name="Security">
        <Scene7Security />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 20 })}
      />
      <TransitionSeries.Sequence durationInFrames={600} name="Outro">
        <Scene8Outro />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
