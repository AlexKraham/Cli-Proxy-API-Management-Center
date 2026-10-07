import { describe, expect, test } from 'bun:test';
import type { TFunction } from 'i18next';
import {
  ledgerMeters,
  ledgerPlanLabel,
  maskIdentity,
  summarizeProvider,
  type LedgerCredential,
  type LedgerMeter,
} from '@/features/quota/ledgerModel';

const t = ((key: string) => key) as TFunction;
const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 6, 12);

const claude = (fableUsed: number, weeklyUsed: number, fableResetAtMs: number) => ({
  status: 'success',
  planType: 'plan_max',
  windows: [
    {
      id: 'five-hour',
      label: 'x',
      labelKey: 'claude_quota.five_hour',
      usedPercent: 0,
      resetAtMs: null,
      periodHours: 5,
    },
    {
      id: 'seven-day',
      label: 'x',
      labelKey: 'claude_quota.seven_day',
      usedPercent: weeklyUsed,
      resetAtMs: NOW + 30 * HOUR,
      periodHours: 168,
    },
    {
      id: 'seven-day-fable',
      label: 'x',
      labelKey: 'claude_quota.seven_day_fable',
      usedPercent: fableUsed,
      resetAtMs: fableResetAtMs,
      periodHours: 168,
    },
  ],
});

describe('ledger meters', () => {
  test('turn used into remaining, the way every quota bar is drawn', () => {
    const meters = ledgerMeters('claude', claude(42, 21, NOW + 25 * HOUR), t);
    expect(meters.map((m) => [m.id, m.label, m.remainingPercent, m.periodHours])).toEqual([
      ['five-hour', 'claude_quota.five_hour', 100, 5],
      ['seven-day', 'claude_quota.seven_day', 79, 168],
      ['seven-day-fable', 'claude_quota.seven_day_fable', 58, 168],
    ]);
  });

  test('read nothing from a credential that has not loaded or failed', () => {
    expect(ledgerMeters('claude', { status: 'idle', windows: [] }, t)).toEqual([]);
    expect(ledgerMeters('codex', { status: 'error', windows: [] }, t)).toEqual([]);
    expect(ledgerMeters('claude', undefined, t)).toEqual([]);
  });

  test('normalise every provider to remaining 0–100', () => {
    expect(
      ledgerMeters(
        'antigravity',
        {
          status: 'success',
          groups: [{ buckets: [{ id: 'g', label: 'Gemini', remainingFraction: 0.25 }] }],
        },
        t
      )[0].remainingPercent
    ).toBe(25);
    expect(
      ledgerMeters(
        'kimi',
        { status: 'success', rows: [{ id: 'w', label: 'Week', used: 30, limit: 40 }] },
        t
      )[0].remainingPercent
    ).toBe(25);
    expect(
      ledgerMeters(
        'devin',
        {
          status: 'success',
          windows: [{ id: 'daily', remainingPercent: 140, resetAtMs: null, periodHours: 24 }],
        },
        t
      )[0].remainingPercent
    ).toBe(100);
    expect(
      ledgerMeters(
        'meta',
        {
          status: 'success',
          data: { windows: [{ id: 'weekly', usedPercent: 10, resetAt: 1_800_000_000 }] },
        },
        t
      )[0]
    ).toMatchObject({ remainingPercent: 90, resetAtMs: 1_800_000_000_000 });
    expect(
      ledgerMeters(
        'xai',
        {
          status: 'success',
          billing: {
            periodType: 'weekly',
            usagePercent: 40,
            resetAtMs: NOW + HOUR,
            periodHours: 168,
          },
        },
        t
      )
    ).toEqual([
      {
        id: 'xai:weekly',
        label: 'xai_quota.weekly_limit',
        remainingPercent: 60,
        resetAtMs: NOW + HOUR,
        periodHours: 168,
      },
    ]);
  });

  test('carry the plan a credential is on', () => {
    expect(ledgerPlanLabel('claude', claude(0, 0, NOW), t)).toBe('claude_quota.plan_max');
    expect(ledgerPlanLabel('codex', { status: 'success', planType: 'pro' }, t)).toBe('Pro');
    expect(ledgerPlanLabel('claude', { status: 'idle' }, t)).toBe(null);
  });
});

describe('provider summary', () => {
  const credential = (key: string, quota: unknown): LedgerCredential => ({
    key,
    meters: ledgerMeters('claude', quota, t),
  });

  test('leads with the longest window that has the least left, summed across credentials', () => {
    const summary = summarizeProvider(
      'claude',
      [
        credential('a', claude(42, 21, NOW + 25 * HOUR)),
        credential('b', claude(0, 0, NOW + 4 * 24 * HOUR)),
        credential('c', claude(0, 0, NOW + 4 * 24 * HOUR)),
      ],
      NOW
    );
    expect(summary).toMatchObject({ credentialCount: 3, loadedCount: 3 });
    expect(summary.headline).toMatchObject({
      meterId: 'seven-day-fable',
      totalRemaining: 258,
      capacity: 300,
      soonestResetAtMs: NOW + 25 * HOUR,
    });
    expect(summary.headline?.segments.map((s) => s.remainingPercent)).toEqual([58, 100, 100]);
    expect(summary.secondary).toMatchObject({ meterId: 'seven-day', totalRemaining: 279 });
  });

  test('keeps a segment for a credential that has not loaded, and counts only what reported', () => {
    const summary = summarizeProvider(
      'claude',
      [credential('a', claude(50, 0, NOW + HOUR)), { key: 'b', meters: null }],
      NOW
    );
    expect(summary.loadedCount).toBe(1);
    expect(summary.headline).toMatchObject({ totalRemaining: 50, capacity: 100 });
    expect(summary.headline?.segments).toEqual([
      { key: 'a', remainingPercent: 50 },
      { key: 'b', remainingPercent: null },
    ]);
  });

  test('ignores a reset that has already passed', () => {
    const meters: LedgerMeter[] = [
      { id: 'w', label: 'W', remainingPercent: 10, resetAtMs: NOW - HOUR, periodHours: 168 },
    ];
    expect(summarizeProvider('codex', [{ key: 'a', meters }], NOW).headline?.soonestResetAtMs).toBe(
      null
    );
  });

  test('has no headline before anything loads', () => {
    expect(summarizeProvider('codex', [{ key: 'a', meters: null }], NOW)).toMatchObject({
      loadedCount: 0,
      headline: null,
      secondary: null,
    });
  });
});

describe('identity masking', () => {
  test('keeps the first letter of the mailbox and the domain, and the file around them', () => {
    expect(maskIdentity('claude-alex@example.dev.json')).toBe('claude-a•••@e•••.dev.json');
    expect(maskIdentity('codex-sam.lee@corp.co.uk.json')).toBe('codex-s•••@c•••.co.uk.json');
  });

  test('leaves a name without an email as it is', () => {
    expect(maskIdentity('kimi-oauth-1.json')).toBe('kimi-oauth-1.json');
  });
});
