
import { Developer } from "./types";
import { pinnacleData } from "./pinnacleData";
import { urbanHorizonData } from "./urbanHorizonData";
import { extellData } from "./extellData";

export type { Developer } from "./types";

export const developers: Developer[] = [
  pinnacleData,
  urbanHorizonData,
  extellData
];

export const getDeveloperById = (id: string): Developer | undefined => {
  return developers.find(developer => developer.id === id);
};

export const getDeveloperByName = (name: string): Developer | undefined => {
  return developers.find(developer => developer.name.toLowerCase() === name.toLowerCase());
};
