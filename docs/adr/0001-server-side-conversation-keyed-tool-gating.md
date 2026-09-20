# Voice tool calls are gated server-side, keyed by ElevenLabs conversation_id

The voice agent's LLM can be prompt-injected or simply hallucinate, so it is never trusted with identity or authorization. Every ElevenLabs tool webhook carries only the platform-injected `system__conversation_id`; our server resolves it to a `call_session` row, derives the member from that row, and refuses every data/action tool until `call_session.verified` is true (set only by a successful `verify_pin`). The alternative — passing `member_id` as a tool parameter and letting the agent's prompt enforce the PIN flow — was rejected because a misbehaving model could read any member's data or skip verification entirely.

## Consequences

- The LLM never sees member IDs, phone numbers, or PIN hashes; tool schemas contain no identity parameters the model can supply.
- Inbound sessions are created by the conversation-initiation webhook; outbound sessions are created when we place the call (the outbound API returns the `conversation_id`). A tool call whose `conversation_id` matches no session is rejected regardless of what the agent claims.
- Three failed PIN attempts mark the session locked for the remainder of the call (`pin_locked` activity, visible to the caretaker); there is no cross-call lockout.
