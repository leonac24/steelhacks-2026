# One June agent for inbound and outbound, with the full PIN gate in both directions

We use a single ElevenLabs agent for member-initiated calls and proactive alert calls, differentiated per call by dynamic variables (`call_direction`, `call_reason`, alert context) and a first-message override passed to the outbound-call API — not a second "announcer" agent. And outbound calls do not relax security: even though we dialed the member, anyone can pick up the phone, so June asks for the PIN before disclosing balances, transactions, or alert specifics, exactly as on inbound calls.

## Considered Options

- Separate outbound agent: rejected — two prompts and two tool wirings to keep in sync for no capability gain, since the outbound API already supports per-call overrides, and a shared agent lets the member ask follow-up questions ("well, what IS my balance?") mid-alert-call with the same tools.
- PIN-free outbound (session starts verified because we placed the call): rejected — the person answering may not be the member, and financial details plus fraud alerts are exactly what shouldn't be read to whoever answers.
