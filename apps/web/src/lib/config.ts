// Client-visible settings for the two interfaces.
//
// TODO(milestone 7): move SUPPORT_PHONE into apps/web/.env.schema as a
// `@public` var once the Twilio number connected to the ElevenLabs agent
// exists, so preview and production can point at different lines.
export const SUPPORT_PHONE = "+14125550100";

/** How the number is shown on screen. */
export const SUPPORT_PHONE_DISPLAY = "(412) 555-0100";
