# June — Phone Banking for Elders

Helps older adults understand and manage their money by phone. A member calls (or is called by) June, a voice agent; a family caretaker supervises via a web dashboard.

## Language

### People

**Member**:
An older adult whose finances June helps with. Identified on the phone by caller ID + PIN; a Better Auth user only if they also use the native app.
_Avoid_: elder, senior, customer, user

**Caretaker**:
A family member who links the bank, sets budgets and rules, and approves sensitive changes. Always a Better Auth user. The `primary` caretaker can change settings and decide approvals; a `viewer` can only look.
_Avoid_: guardian, admin, family member

**Trusted Contact**:
A person June may reference or involve on the member's behalf (e.g. a daughter's phone number). Not an account holder.

**June**:
The voice agent persona. One ElevenLabs agent handles both inbound and outbound calls.
_Avoid_: bot, assistant, IVR

### Calls & identity

**Call Session**:
One phone conversation, inbound or outbound. Starts unverified; becomes Verified only after PIN success, checked server-side on every tool call.

**Verified**:
The state of a call session after the caller has spoken the member's correct PIN. Applies equally to inbound and outbound calls — June dialing out does not skip the PIN.
_Avoid_: authenticated, logged in

**Unknown Caller**:
An inbound caller whose caller ID matches no member. June politely declines and ends the call; there is no phone-based fallback login.

### Changes

**Change Request**:
A member-initiated change (by voice) that moves through propose → confirm → applied / awaiting approval. Proposals expire if unconfirmed within the confirmation window, and only the call session that proposed a change may confirm it.
_Avoid_: edit, update request

**Permission Tier**:
Per-change-type policy deciding what happens after the member confirms: `instant` (applies silently), `instant_notify` (applies, caretaker notified), `needs_approval` (waits for the primary caretaker, then applies or expires on timeout).
_Avoid_: approval level, rule

**Caretaker Edit**:
A settings change made by a caretaker on the dashboard. Applies directly — never a Change Request.

### Alerts

**Alert Rule**:
A per-member switch (with optional threshold) for each condition June proactively calls about: shortfall, bill due unfunded, unusual transaction, deposit arrived.

**Alert**:
One unusual or noteworthy real-world condition — detected by the system or reported by the member ("I don't recognize this charge") — and the attempt to surface it, tracked through queued → placed → answered / unanswered / failed / skipped.
_Avoid_: notification, reminder

**Dedupe Key**:
The identity of an Alert's real-world condition (the specific transaction, the specific bill occurrence, the shortfall window). Two alerts with the same key are the same alert; it is never sent twice.

**Quiet Hours**:
A daily window during which June never places outbound calls. Alerts detected then are skipped or held, not silently dropped.

### Money

**Safe to Spend**:
Available balance minus bills due before the next income minus the safety buffer, floored at zero. The number June gives when asked "can I afford it?".
_Avoid_: disposable income, remaining balance

**Safety Buffer**:
A caretaker-set cushion that Safe to Spend always keeps untouched.

**Shortfall**:
A projection that the member's balance won't cover bills due before the next income arrives.
_Avoid_: overdraft (that's the bank's word for after it happens)
