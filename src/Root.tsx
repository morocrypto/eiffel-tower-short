import React from "react";
import { Composition } from "remotion";
import { BridgeShort, BRIDGE_FRAMES } from "./videos/bridge/Bridge";
import { EiffelShort, EIFFEL_FRAMES } from "./videos/eiffel/Eiffel";

export const Root: React.FC = () => (
  <>
    <Composition
      id="BridgeShort"
      component={BridgeShort}
      durationInFrames={BRIDGE_FRAMES}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="EiffelShort"
      component={EiffelShort}
      durationInFrames={EIFFEL_FRAMES}
      fps={30}
      width={1080}
      height={1920}
    />
  </>
);
