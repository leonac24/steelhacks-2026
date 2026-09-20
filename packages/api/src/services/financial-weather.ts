// The Financial Weather Report: a short, ambient, spoken briefing delivered on
// a schedule instead of triggered by an event. Same data as the alert engine,
// zero query required from the member — June calls and reads ~3 sentences.
import type { Database } from "@steelhacks-2026/db";
import { alertSent, member, memberSettings } from "@steelhacks-2026/db/schema/index";
import {
  buildFinancialWeather,
  isBriefingDue,
  nextBriefingDate,
  todayInTimezone,
  localTimeInTimezone,
  type BriefingFrequency,
  type IsoDate,
} from "@steelhacks-2026/finance";
import { and, eq, gte } from "drizzle-orm";

import * as activity from "./activity";
import { checkDelivery } from "./alert-rules";
import { budgetsOverview } from "./budgets";
import { memberSummary } from "./member-summary";
import * as outboundCalls from "./outbound-calls";
import type { ElevenLabsConfig } from "./outbound-calls";

export type WeatherOutcome = {
  memberId: string;
  preferredName: string;
  today: IsoDate;
  due: boolean;
  frequency: BriefingFrequency;
  lastBriefingDate: IsoDate | null;
  nextBriefingDate: IsoDate | null;
  // The briefing text, sentence by sentence (first sentence is the greeting).
  sentences: string[];
  // Everything joined, ready for June to read verbatim.
  spoken: string;
};

// Assemble today's briefing for a member without touching any phones.
export async function weatherForMember(
  db: Database,
  memberId: string,
  now: Date = new Date(),
): Promise<WeatherOutcome> {
  const [target, settings, summary, budgets] = await Promise.all([
    db.query.member.findFirst({ where: eq(member.id, memberId) }),
    db.query.memberSettings.findFirst({ where: eq(memberSettings.memberId, memberId) }),
    memberSummary(db, memberId, now),
    budgetsOverview(db, memberId, now),
  ]);
  if (!target || !settings) throw new Error(`Member ${memberId} is not fully set up`);

  const today = todayInTimezone(target.timezone, now);
  const briefing = buildFinancialWeather({
    today,
    budgets: budgets.budgets.map((b) => ({
      category: b.category,
      limitCents: b.limitCents,
      spentCents: b.spentCents,
    })),
    nextIncome: summary.nextIncome
      ? {
          name: summary.nextIncome.name,
          amountCents: summary.nextIncome.amountCents,
          date: summary.nextIncome.date,
        }
      : null,
    shortfallDate: summary.shortfall.willShortfall ? summary.shortfall.date : null,
  });

  const lastBriefingDate = settings.lastBriefingDate ?? null;
  return {
    memberId,
    preferredName: target.preferredName,
    today,
    due: isBriefingDue(lastBriefingDate, settings.briefingFrequency, today),
    frequency: settings.briefingFrequency,
    lastBriefingDate,
    nextBriefingDate: nextBriefingDate(lastBriefingDate, settings.briefingFrequency, today),
    sentences: briefing.sentences,
    spoken: briefing.spoken,
  };
}

export type BriefingDispatchResult = {
  placed: boolean;
  skipped: { reason: string } | null;
};

// Send one member's briefing. Due dates are checked unless `force` is set, and
// the same quiet-hours / daily-cap / reminder-mode rules as alerts apply.
export async function dispatchBriefing(
  db: Database,
  memberId: string,
  options: {
    force?: boolean;
    elevenLabs?: ElevenLabsConfig | null;
    now?: Date;
  } = {},
): Promise<BriefingDispatchResult> {
  const now = options.now ?? new Date();
  const weather = await weatherForMember(db, memberId, now);
  if (!options.force && !weather.due) {
    return { placed: false, skipped: { reason: "not_due" } };
  }

  const [target, settings] = await Promise.all([
    db.query.member.findFirst({ where: eq(member.id, memberId) }),
    db.query.memberSettings.findFirst({ where: eq(memberSettings.memberId, memberId) }),
  ]);
  if (!target || !settings) throw new Error(`Member ${memberId} is not fully set up`);

  const startOfLocalDay = new Date(`${weather.today}T00:00:00Z`);
  const placedToday = await db
    .select({ id: alertSent.id })
    .from(alertSent)
    .where(and(eq(alertSent.memberId, memberId), gte(alertSent.sentAt, startOfLocalDay)));

  const decision = checkDelivery({
    localTime: localTimeInTimezone(target.timezone, now),
    quietHoursStart: settings.quietHoursStart,
    quietHoursEnd: settings.quietHoursEnd,
    callsPlacedToday: placedToday.length,
    maxCallsPerDay: settings.maxCallsPerDay,
    reminderMode: settings.reminderMode,
  });
  if (!decision.deliver) return { placed: false, skipped: { reason: decision.reason } };
  if (decision.channel === "sms") {
    return { placed: false, skipped: { reason: "sms_not_implemented" } };
  }

  const candidate = {
    ruleType: "briefing" as const,
    dedupeKey: `${memberId}:briefing:${weather.today}`,
    spokenMessage: weather.spoken,
    summaryText: weather.spoken,
  };

  const call = await outboundCalls.place(
    db,
    target,
    candidate,
    options.elevenLabs ?? null,
    settings.voiceSpeed,
  );
  await db.insert(alertSent).values({
    memberId,
    ruleType: "briefing",
    dedupeKey: candidate.dedupeKey,
    channel: "call",
    status: call.simulated ? "queued" : "placed",
    callSessionId: call.callSessionId,
    sentAt: now,
  });
  await db
    .update(memberSettings)
    .set({ lastBriefingDate: weather.today })
    .where(eq(memberSettings.memberId, memberId));
  await activity.log(db, {
    memberId,
    type: "briefing_sent",
    summaryText: call.simulated
      ? `Would call ${target.preferredName} with the weather briefing: ${weather.spoken}`
      : `Called ${target.preferredName} with the weather briefing: ${weather.spoken}`,
    metadata: { callSessionId: call.callSessionId, simulated: call.simulated },
  });

  return { placed: true, skipped: null };
}

// The daily cron: brief every member whose schedule says so.
export async function dispatchBriefings(
  db: Database,
  options: { elevenLabs?: ElevenLabsConfig | null; now?: Date } = {},
) {
  const members = await db.select({ id: member.id }).from(member);
  const results = [];
  for (const row of members) {
    try {
      results.push({ memberId: row.id, ...(await dispatchBriefing(db, row.id, options)) });
    } catch (error) {
      console.error(`[briefings] member ${row.id} failed:`, error);
      results.push({ memberId: row.id, placed: false, skipped: { reason: "error" } });
    }
  }
  return results;
}
