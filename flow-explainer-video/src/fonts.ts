import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

export const inter = "Inter";
export const spaceGrotesk = "Space Grotesk";

[400, 500, 600, 700, 800].forEach((weight) => {
  loadFont({
    family: inter,
    url: staticFile("fonts/Inter-Variable.woff2"),
    weight: String(weight),
  });
});

[500, 600, 700].forEach((weight) => {
  loadFont({
    family: spaceGrotesk,
    url: staticFile("fonts/SpaceGrotesk-Variable.woff2"),
    weight: String(weight),
  });
});
