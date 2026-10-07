/**
 * The ledger view's model: every credential as one row of meters, and every
 * provider as one summary card that adds those meters up.
 *
 * Pure and React-free like resetSchedule.ts: quota states are read
 * structurally, `t` and `nowMs` are passed in, nothing touches the store.
 *
 * A meter is always *remaining* capacity (0–100), the way every provider body
 * draws its bar, so a summary can add them: five Claude credentials at 100%
 * are "500% of 500%", and the sum falls as any of them is spent.
 */

import type { TFunction } from 'i18next';
import type { QuotaProviderType } from './providers/types';
import { XAI_WEEKLY_ROW_ID } from './resetSchedule';

export interface LedgerMeter {
  /** Stable per provider, so the same window lines up across credentials. */
  id: string;
  label: string;
  /** Remaining capacity, 0–100; null when the provider did not report it. */
  remainingPercent: number | null;
  resetAtMs: number | null;
  /** Window length in hours; longer windows lead the summary. */
  periodHours: number | null;
}

const clampPercent = (value: number): number => Math.max(0, Math.min(100, value));
const remainingFromUsed = (used: number | null | undefined): number | null =>
  typeof used === 'number' && Number.isFinite(used) ? clampPercent(100 - used) : null;
const usableMs = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

interface WindowShape {
  id: string;
  label?: string;
  labelKey?: string;
  labelParams?: Record<string, string | number>;
  usedPercent?: number | null;
  resetAtMs?: number | null;
  periodHours?: number | null;
}

const windowLabel = (window: WindowShape, t: TFunction): string =>
  window.labelKey
    ? String(t(window.labelKey, window.labelParams ?? {}))
    : (window.label ?? window.id);

/** Every meter one credential reports, in the order its provider body draws them. */
export function ledgerMeters(
  provider: QuotaProviderType,
  quota: unknown,
  t: TFunction
): LedgerMeter[] {
  const state = quota as { status?: string } | undefined;
  if (!state || state.status !== 'success') return [];

  if (provider === 'claude' || provider === 'codex') {
    return ((quota as { windows?: WindowShape[] }).windows ?? []).map((window) => ({
      id: window.id,
      label: windowLabel(window, t),
      remainingPercent: remainingFromUsed(window.usedPercent),
      resetAtMs: usableMs(window.resetAtMs),
      periodHours: usableMs(window.periodHours),
    }));
  }

  if (provider === 'devin') {
    const windows =
      (
        quota as {
          windows?: {
            id: string;
            remainingPercent: number | null;
            resetAtMs: number | null;
            periodHours: number;
          }[];
        }
      ).windows ?? [];
    return windows.map((window) => ({
      id: window.id,
      label: String(t(`devin_quota.${window.id}`)),
      remainingPercent:
        typeof window.remainingPercent === 'number' ? clampPercent(window.remainingPercent) : null,
      resetAtMs: usableMs(window.resetAtMs),
      periodHours: usableMs(window.periodHours),
    }));
  }

  if (provider === 'kimi') {
    const rows = (quota as { rows?: (WindowShape & { used: number; limit: number })[] }).rows ?? [];
    return rows.map((row) => ({
      id: row.id,
      label: windowLabel(row, t),
      remainingPercent:
        row.limit > 0
          ? clampPercent(Math.round(((row.limit - row.used) / row.limit) * 100))
          : row.used > 0
            ? 0
            : null,
      resetAtMs: usableMs(row.resetAtMs),
      periodHours: usableMs(row.periodHours),
    }));
  }

  if (provider === 'antigravity') {
    const groups =
      (
        quota as {
          groups?: {
            buckets?: {
              id: string;
              label: string;
              remainingFraction: number;
              resetAtMs?: number | null;
              periodHours?: number | null;
            }[];
          }[];
        }
      ).groups ?? [];
    return groups.flatMap((group) =>
      (group.buckets ?? []).map((bucket) => ({
        id: bucket.id,
        label: bucket.label,
        remainingPercent: Number.isFinite(bucket.remainingFraction)
          ? clampPercent(bucket.remainingFraction * 100)
          : null,
        resetAtMs: usableMs(bucket.resetAtMs),
        periodHours: usableMs(bucket.periodHours),
      }))
    );
  }

  if (provider === 'xai') {
    const billing = (
      quota as {
        billing?: {
          periodType?: string;
          usagePercent?: number | null;
          usedPercent?: number | null;
          resetAtMs?: number | null;
          periodHours?: number | null;
        } | null;
      }
    ).billing;
    if (!billing) return [];
    // The same two rows XaiQuotaBody draws: the weekly quota when the plan has
    // one, else the monthly spend, whose rollover is a billing date, not a reset.
    if (billing.periodType === 'weekly') {
      return [
        {
          id: XAI_WEEKLY_ROW_ID,
          label: String(t('xai_quota.weekly_limit')),
          remainingPercent: remainingFromUsed(billing.usagePercent),
          resetAtMs: usableMs(billing.resetAtMs),
          periodHours: usableMs(billing.periodHours),
        },
      ];
    }
    return [
      {
        id: 'xai:monthly',
        label: String(t('xai_quota.monthly_credits')),
        remainingPercent: remainingFromUsed(billing.usedPercent),
        resetAtMs: null,
        periodHours: null,
      },
    ];
  }

  if (provider === 'meta') {
    const windows =
      (
        quota as {
          data?: {
            windows?: {
              id: string;
              usedPercent: number | null;
              resetAt?: number;
              durationMinutes?: number;
            }[];
          };
        }
      ).data?.windows ?? [];
    return windows.map((window) => ({
      id: window.id,
      label: window.durationMinutes
        ? String(t('meta_quota.window_duration', { minutes: window.durationMinutes }))
        : String(t(`meta_quota.${window.id}`)),
      remainingPercent: remainingFromUsed(window.usedPercent),
      resetAtMs: typeof window.resetAt === 'number' ? window.resetAt * 1000 : null,
      periodHours: window.durationMinutes ? window.durationMinutes / 60 : null,
    }));
  }

  return [];
}

/** The plan a credential is on, as its provider body labels it; null when unknown. */
export function ledgerPlanLabel(
  provider: QuotaProviderType,
  quota: unknown,
  t: TFunction
): string | null {
  const state = quota as { status?: string } | undefined;
  if (!state || state.status !== 'success') return null;
  if (provider === 'claude') {
    const planType = (quota as { planType?: string | null }).planType;
    return planType ? String(t(`claude_quota.${planType}`)) : null;
  }
  if (provider === 'codex') {
    const planType = (quota as { planType?: string | null }).planType;
    return planType ? planType.charAt(0).toUpperCase() + planType.slice(1) : null;
  }
  if (provider === 'devin') return (quota as { plan?: string | null }).plan ?? null;
  if (provider === 'meta')
    return (quota as { data?: { planName?: string } }).data?.planName ?? null;
  if (provider === 'xai') {
    return (quota as { billing?: { planLabel?: string } | null }).billing?.planLabel ?? null;
  }
  return null;
}

/* ---------- provider summary ---------- */

export interface LedgerCredential {
  key: string;
  /** Null while the credential's quota has not loaded. */
  meters: LedgerMeter[] | null;
}

export interface LedgerSegment {
  key: string;
  remainingPercent: number | null;
}

export interface LedgerAggregate {
  meterId: string;
  label: string;
  /** Sum of remaining across the credentials that report this meter. */
  totalRemaining: number;
  /** 100 per credential that reports this meter. */
  capacity: number;
  /** One per credential of the provider, in list order; null where unreported. */
  segments: LedgerSegment[];
  /** Soonest reset still ahead of `nowMs` among the credentials, or null. */
  soonestResetAtMs: number | null;
}

export interface LedgerSummary {
  provider: QuotaProviderType;
  credentialCount: number;
  loadedCount: number;
  headline: LedgerAggregate | null;
  secondary: LedgerAggregate | null;
}

/**
 * One card per provider. The headline is the meter that binds first: among the
 * longest windows (a weekly limit outlasts a 5-hour one), the one with the
 * least capacity left. The secondary is the next by the same rule.
 */
export function summarizeProvider(
  provider: QuotaProviderType,
  credentials: readonly LedgerCredential[],
  nowMs: number
): LedgerSummary {
  const groups = new Map<string, { label: string; periodHours: number | null }>();
  credentials.forEach((credential) =>
    credential.meters?.forEach((meter) => {
      if (meter.remainingPercent !== null && !groups.has(meter.id)) {
        groups.set(meter.id, { label: meter.label, periodHours: meter.periodHours });
      }
    })
  );

  const aggregates: LedgerAggregate[] = [...groups.entries()].map(([meterId, group]) => {
    let totalRemaining = 0;
    let reporting = 0;
    let soonest: number | null = null;
    const segments = credentials.map((credential) => {
      const meter = credential.meters?.find((candidate) => candidate.id === meterId);
      const remaining = meter?.remainingPercent ?? null;
      if (remaining !== null) {
        totalRemaining += remaining;
        reporting += 1;
      }
      const resetAt = meter?.resetAtMs ?? null;
      if (resetAt !== null && resetAt > nowMs && (soonest === null || resetAt < soonest)) {
        soonest = resetAt;
      }
      return { key: credential.key, remainingPercent: remaining };
    });
    return {
      meterId,
      label: group.label,
      totalRemaining: Math.round(totalRemaining),
      capacity: reporting * 100,
      segments,
      soonestResetAtMs: soonest,
    };
  });

  const period = (meterId: string) => groups.get(meterId)?.periodHours ?? 0;
  aggregates.sort(
    (a, b) =>
      period(b.meterId) - period(a.meterId) ||
      a.totalRemaining / a.capacity - b.totalRemaining / b.capacity ||
      a.meterId.localeCompare(b.meterId)
  );

  return {
    provider,
    credentialCount: credentials.length,
    loadedCount: credentials.filter((credential) => credential.meters !== null).length,
    headline: aggregates[0] ?? null,
    secondary: aggregates[1] ?? null,
  };
}

/* ---------- identity ---------- */

const EMAIL = /([A-Za-z0-9._%+-]+)@([A-Za-z0-9-]+)((?:\.[A-Za-z0-9-]+)+)/g;
const MASK = '•••';

/**
 * `claude-alex@example.dev.json` → `claude-a•••@e•••.dev.json`. The first
 * character of the mailbox and the domain stay so credentials remain
 * tellable apart on a shared screen; the suffixes stay because they name the
 * file, not the person.
 */
export function maskIdentity(name: string): string {
  // Credential files are `<provider>-<email>.json`; a hyphen is legal in a
  // mailbox, so the provider prefix is set aside before the email is read.
  const prefix = /^[A-Za-z]+-(?=[^@]*@)/.exec(name)?.[0] ?? '';
  return (
    prefix +
    name
      .slice(prefix.length)
      .replace(
        EMAIL,
        (_match, local: string, domain: string, rest: string) =>
          `${local.charAt(0)}${MASK}@${domain.charAt(0)}${MASK}${rest}`
      )
  );
}
