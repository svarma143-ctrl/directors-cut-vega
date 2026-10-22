/**
 * Endpoints for the Director's Cut demo.
 *
 * Both the demo media and the AI agent are served from a single public
 * HTTPS origin. That is not a stylistic choice:
 *
 * The Vega media player refuses to play cleartext HTTP video URLs. The
 * native error is:
 *
 *   MEDIA_PLAYER:MediaPlayerUtils.cpp(113) isUriSchemeSecure
 *   Got an insecure protocol/scheme http, return error
 *
 * So even when the app and the media live on the same machine, the media
 * has to be reachable over HTTPS. We use one tunnel in front of the local
 * asset server, and the asset server proxies `/agent/*` to the local agent
 * process, which keeps the Fire TV app pointed at a single origin.
 *
 * To point the app at a different deployment, change `ASSET_BASE_URL` here
 * (or set `agentUrl` / `assetBaseUrl` in the app config, which takes
 * precedence).
 */

/**
 * Public HTTPS origin serving the demo media and proxying the agent.
 *
 * For local development, run:
 *   node tools/serve-assets.mjs
 *   cloudflared tunnel --url http://localhost:8099
 * and paste the resulting `https://....trycloudflare.com` URL here.
 */
export const ASSET_BASE_URL = 'https://quad-excitement-destiny-chronicles.trycloudflare.com';

/** The agent lives behind the asset origin under this prefix. */
export const AGENT_PATH_PREFIX = '/agent';

/** Full base URL for the agent, including the proxy prefix. */
export const AGENT_BASE_URL = `${ASSET_BASE_URL}${AGENT_PATH_PREFIX}`;

/**
 * Read an override from the app config, if the build provides one.
 *
 * `expo-constants` is not present on every target, so this is deliberately
 * defensive.
 */
export function getConfigOverride(key: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants').default;
    const extra = Constants?.expoConfig?.extra;
    if (extra && extra[key]) return String(extra[key]);
  } catch {
    // Not running under Expo, or the module is absent on this platform.
  }
  return '';
}

/** The base URL for demo media, honouring a config override. */
export function resolveAssetBaseUrl(): string {
  const override = getConfigOverride('assetBaseUrl');
  return (override || ASSET_BASE_URL).replace(/\/$/, '');
}

/** The base URL for the agent, honouring a config override. */
export function resolveAgentBaseUrl(): string {
  const override = getConfigOverride('agentUrl');
  if (override) return override.replace(/\/$/, '');
  return AGENT_BASE_URL;
}
