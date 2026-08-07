export type CompatibilityModule = {
  id: string;
  detect: (url: URL) => boolean;
  css: string;
};

import { detectSteamUrl } from './steam/detect';
import { steamCompatibilityCss } from './steam/styles';

const modules: CompatibilityModule[] = [
  {
    id: 'steam',
    detect: detectSteamUrl,
    css: steamCompatibilityCss,
  },
];

export const detectCompatibilityModules = (url: URL): CompatibilityModule[] => {
  return modules.filter((module) => module.detect(url));
};
