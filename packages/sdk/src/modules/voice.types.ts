// This file deliberately states no backend limits, value lists, durations, or
// prices. Base44 validates every value, so changing a backend rule must never
// need an SDK release. Those details belong in the live voice guide.

/**
 * A text message placed in the conversation before the call starts.
 */
export interface VoiceSessionMessage {
  /**
   * Who wrote the message, such as:
   *
   * - `'developer'`: Context for the voice agent, such as what the current user is looking at.
   * - `'user'`: An earlier turn by the current user.
   * - `'assistant'`: An earlier turn by the voice agent.
   */
  role: string;
  /** The message text. */
  text: string;
}

/**
 * Options for {@linkcode VoiceModule.startSession | startSession()}.
 */
export interface VoiceSessionOptions {
  /**
   * The browser's WebRTC SDP offer.
   *
   * Create it in the browser with [`RTCPeerConnection.createOffer()`](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createOffer) and send it to your backend function. A new offer is needed for every session.
   */
  sdp: string;
  /**
   * ID of the app's MCP profile whose tools the voice agent can use.
   *
   * The AI inserts this ID into your backend function when it sets up voice for the app.
   */
  mcpProfileId: string;
  /**
   * Model that talks with the current user, as an AI Gateway model ID. Defaults to Base44's default voice model.
   */
  voiceModel?: string;
  /**
   * Model behind the voice that calls the app's tools, as an AI Gateway model ID, such as `'gpt_6_luna'`. Defaults to Base44's default agent model.
   */
  agentModel?: string;
  /**
   * How the voice model speaks with the current user, such as its persona, tone, and turn-taking.
   */
  voiceInstructions: string;
  /**
   * How the agent behind the voice uses the app's tools to answer and act.
   */
  agentInstructions: string;
  /**
   * Built-in voice to speak with, such as `'cedar'`. The voice is fixed for the whole session. Defaults to the provider's default voice.
   */
  voice?: string;
  /**
   * Text conversation placed before the call starts, oldest first.
   *
   * Use it to give the voice agent context, or to continue a conversation the current user started in text.
   */
  initialMessages?: VoiceSessionMessage[];
}

/**
 * A live voice session returned by {@linkcode VoiceModule.startSession | startSession()}.
 */
export interface VoiceSession {
  /**
   * Opaque session identifier issued to your app.
   *
   * Pass it unchanged to [`endSession()`](#endsession) to end the session from a different request.
   */
  sessionId: string;
  /**
   * The SDP answer.
   *
   * Return it to the browser and apply it with [`RTCPeerConnection.setRemoteDescription()`](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/setRemoteDescription). Audio then flows directly between the browser and the voice model.
   */
  sdp: string;
  /** ISO 8601 timestamp when the session ends at the latest. */
  expiresAt: string;
  /**
   * Where the voice agent's tools come from.
   *
   * - `'live'`: The published MCP profile.
   * - `'draft'`: The current draft of the MCP profile. Served when the app's owner or an editor starts the session from the app editor preview, so voice works before the app is published.
   */
  environment: "live" | "draft";
  /**
   * Ends the session. Equivalent to calling [`endSession()`](#endsession) with this session's ID.
   */
  end: () => Promise<void>;
}

/**
 * Voice module for live voice conversations between your app's users and an AI agent.
 *
 * This module starts and ends live voice sessions. The voice agent can use your app's tools through one of the app's MCP profiles, acting as the current user. Audio flows directly between the browser and the voice model over [WebRTC](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API), so your backend only handles the start and the end of a session.
 *
 * A session takes three steps:
 * - The browser creates a WebRTC SDP offer and sends it to one of your backend functions.
 * - The backend function calls {@linkcode startSession | startSession()} with the offer and your voice settings, and returns the SDP answer to the browser.
 * - The browser applies the answer, and the conversation starts.
 *
 * Keep the instructions, models, and MCP profile ID in the backend function. Only the SDP offer should come from the browser.
 *
 * This module is in beta and may change.
 *
 * ## Authentication modes
 *
 * This module is only available to use with a client in [service role authentication mode](/developers/references/sdk/getting-started/client#service-role) (`base44.asServiceRole.voice`), which means it can only be used in backend environments. The app's tools run as the current user of the request that created the client. Without a current user, they run as a guest, which only works in apps that allow anonymous access.
 */
export interface VoiceModule {
  /**
   * Starts a live voice session and returns the SDP answer for the browser.
   *
   * Each call starts a new session, which uses credits from the workspace that owns the app. The session ends on its own when it's idle or reaches its maximum duration. When the current user hangs up, call `end()` on the session. To end it from a different request, use {@linkcode endSession | endSession()}.
   *
   * @param options - The browser's SDP offer and the voice settings.
   * @returns Promise resolving to the new voice session. Rejects with a [`Base44Error`](/developers/references/sdk/getting-started/work-with-sdk#error-handling) whose `code` is one of the values under [Throws](#throws).
   * @throws `insufficient_credits`: The workspace is out of credits.
   * @throws `authentication_required`: The app requires a current user, and the request had none.
   * @throws `unsupported_voice_model`: The voice model isn't supported.
   * @throws `unsupported_agent_model`: The agent model isn't supported.
   * @throws `voice_settings_rejected`: The voice provider rejected the settings, for example because the instructions are too long.
   * @throws `invalid_request`: A value in the options is invalid.
   * @throws `rate_limited`: You started too many sessions in a short time.
   * @throws `voice_capacity_exceeded`: Voice capacity is temporarily unavailable.
   * @throws `voice_connection_failed`: The voice provider couldn't be reached or rejected the request.
   *
   * @example
   * ```typescript
   * // Backend function that starts a voice session for the current user
   * import { createClientFromRequest } from 'npm:@base44/sdk';
   *
   * const VOICE_PROFILE_ID = '6a1f0c2b9d8e7f6a5b4c3d2e';
   *
   * Deno.serve(async (req) => {
   *   const base44 = createClientFromRequest(req);
   *   // Only the SDP offer comes from the browser.
   *   const { sdp } = await req.json();
   *
   *   const session = await base44.asServiceRole.voice.startSession({
   *     sdp,
   *     mcpProfileId: VOICE_PROFILE_ID,
   *     voiceInstructions: 'You are the shop assistant. Speak briefly and let the person interrupt.',
   *     agentInstructions: 'Use the app tools to look up orders. Report only what the tools return.',
   *   });
   *
   *   return Response.json({ sessionId: session.sessionId, sdp: session.sdp });
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Pick the models and voice, and give the agent context about the current page
   * const session = await base44.asServiceRole.voice.startSession({
   *   sdp,
   *   mcpProfileId: VOICE_PROFILE_ID,
   *   voiceModel: 'gpt_live_1',
   *   agentModel: 'gpt_6_luna',
   *   voiceInstructions: 'You are the shop assistant.',
   *   agentInstructions: 'Use the app tools to look up orders.',
   *   voice: 'cedar',
   *   initialMessages: [
   *     { role: 'developer', text: 'The person is viewing order 1042 on the checkout page.' },
   *   ],
   * });
   * ```
   */
  startSession(options: VoiceSessionOptions): Promise<VoiceSession>;

  /**
   * Ends a voice session started by your app.
   *
   * Use this when the session was started in a different request, such as when the browser reports that the current user hung up. Otherwise call `end()` on the session returned by {@linkcode startSession | startSession()}. Ending a session that has already ended succeeds, so it's safe to call more than once.
   *
   * @param sessionId - The `sessionId` returned by {@linkcode startSession | startSession()}.
   * @returns Promise that resolves when Base44 accepts the request. The session closes in the background. Rejects with a [`Base44Error`](/developers/references/sdk/getting-started/work-with-sdk#error-handling) whose `code` is one of the values under [Throws](#throws-2).
   * @throws `voice_session_not_found`: The session ID wasn't issued to your app.
   * @throws `voice_connection_failed`: Base44 couldn't reach its background processing. It closes the session directly where possible, and retrying is safe.
   *
   * @example
   * ```typescript
   * // End a session from a later request, using the ID sent in the request body
   * import { createClientFromRequest } from 'npm:@base44/sdk';
   *
   * Deno.serve(async (req) => {
   *   const base44 = createClientFromRequest(req);
   *   const { sessionId } = await req.json();
   *   await base44.asServiceRole.voice.endSession(sessionId);
   *
   *   return new Response(null, { status: 204 });
   * });
   * ```
   */
  endSession(sessionId: string): Promise<void>;
}
