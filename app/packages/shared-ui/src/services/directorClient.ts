import type { DirectorRequest, DirectorResponse } from '../types/director';
import { resolveAgentBaseUrl } from '../config/demo';

/**
 * Client for the Director's Cut agent.
 *
 * The agent runs as a separate service (a local Node process in development,
 * a Lambda or Bedrock AgentCore Runtime in a real deployment). The Fire TV
 * app talks to it over JSON.
 *
 * See `src/config/demo.ts` for why the agent and the demo media share a
 * single public HTTPS origin.
 */

/**
 * Ask the agent for context and trivia.
 *
 * Never throws: if the agent is unreachable the caller gets a null response
 * and the UI shows a neutral state. A TV app must not crash because a
 * backend is down.
 */
export async function requestDirectorResponse(
  request: DirectorRequest,
  timeoutMs = 12000,
): Promise<DirectorResponse | null> {
  const baseUrl = resolveAgentBaseUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/director`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(`[director] agent returned ${response.status}`);
      return null;
    }

    return (await response.json()) as DirectorResponse;
  } catch (err) {
    console.warn('[director] agent unreachable:', String(err));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cheap liveness check for the agent.
 *
 * Used by the UI to show "companion offline" rather than pretending the
 * panel is working.
 */
export async function pingAgent(timeoutMs = 3000): Promise<boolean> {
  const baseUrl = resolveAgentBaseUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/ping`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
