const STEAM_HOSTS = new Set(['steamcommunity.com', 'store.steampowered.com']);

export const detectSteamUrl = (url: URL): boolean => {
  const host = url.hostname.toLowerCase();
  return STEAM_HOSTS.has(host) || host.endsWith('.steamcommunity.com');
};
