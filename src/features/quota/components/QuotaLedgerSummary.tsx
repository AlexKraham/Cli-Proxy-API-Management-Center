/**
 * Ledger summary: one card per provider, adding its credentials' remaining
 * capacity into one figure (five Claude credentials read "409% of 500%").
 *
 * The segmented bar keeps each credential visible inside the total, so a sum
 * that looks healthy cannot hide one account that is already spent.
 */

import { useTranslation } from 'react-i18next';
import type { ResolvedTheme } from '@/types';
import { buildResetDisplay } from '@/utils/quota';
import { getAuthFileIcon, getTypeLabel } from '@/features/authFiles/constants';
import type { LedgerAggregate, LedgerSummary } from '../ledgerModel';
import { meterLevelClass } from './ledgerLevel';
import styles from './QuotaLedger.module.scss';

export type QuotaLedgerSummaryProps = {
  summaries: LedgerSummary[];
  resolvedTheme: ResolvedTheme;
  now: number;
};

function Headline({ aggregate, now }: { aggregate: LedgerAggregate; now: number }) {
  const { t, i18n } = useTranslation();
  const reset = buildResetDisplay(null, aggregate.soonestResetAtMs, now, i18n.resolvedLanguage);

  return (
    <>
      <div className={styles.summaryLabel}>{aggregate.label}</div>
      <div className={styles.summaryFigure}>
        <span className={styles.summaryValue}>{aggregate.totalRemaining}%</span>
        <span className={styles.summaryCapacity}>
          {t('quota_management.ledger_of_capacity', { capacity: aggregate.capacity })}
        </span>
      </div>
      <div
        className={styles.segments}
        role="img"
        aria-label={t('quota_management.ledger_segments_label', {
          label: aggregate.label,
          count: aggregate.segments.length,
        })}
      >
        {aggregate.segments.map((segment) => (
          <span key={segment.key} className={styles.segment}>
            <span
              className={`${styles.segmentFill} ${meterLevelClass(segment.remainingPercent)}`}
              style={{ width: `${segment.remainingPercent ?? 0}%` }}
            />
          </span>
        ))}
      </div>
      <div className={styles.summaryReset}>
        {reset?.relative ? (
          <>
            <span className={styles.resetRelative}>{reset.relative}</span>
            <span className={styles.resetAbsolute}>{reset.absolute}</span>
          </>
        ) : (
          <span className={styles.resetAbsolute}>{t('quota_management.ledger_no_reset')}</span>
        )}
      </div>
    </>
  );
}

export function QuotaLedgerSummary({ summaries, resolvedTheme, now }: QuotaLedgerSummaryProps) {
  const { t } = useTranslation();
  if (summaries.length === 0) return null;

  return (
    <section
      className={styles.summaryStrip}
      aria-label={t('quota_management.ledger_summary_label')}
    >
      {summaries.map((summary) => {
        const icon = getAuthFileIcon(summary.provider, resolvedTheme);
        return (
          <article key={summary.provider} className={styles.summaryCard}>
            <header className={styles.summaryHeader}>
              <span className={styles.providerName}>
                {icon && <img src={icon} alt="" className={styles.providerIcon} />}
                {getTypeLabel(t, summary.provider)}
              </span>
              <span className={styles.summaryCount}>
                {t('quota_management.ledger_credential_count', { count: summary.credentialCount })}
              </span>
            </header>
            {summary.headline ? (
              <Headline aggregate={summary.headline} now={now} />
            ) : (
              <p className={styles.summaryEmpty}>
                {t('quota_management.ledger_not_loaded', {
                  loaded: summary.loadedCount,
                  count: summary.credentialCount,
                })}
              </p>
            )}
            {summary.secondary && (
              <footer className={styles.summarySecondary}>
                <span>{summary.secondary.label}</span>
                <span className={styles.summarySecondaryValue}>
                  {summary.secondary.totalRemaining}%
                </span>
              </footer>
            )}
          </article>
        );
      })}
    </section>
  );
}
