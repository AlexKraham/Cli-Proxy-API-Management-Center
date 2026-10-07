/**
 * Ledger rows: one line per credential, grouped by provider, every quota
 * window side by side so a column reads down the same limit on each account.
 *
 * Loading stays click-driven like the cards view: an unloaded row offers
 * "Load quota" and draws nothing it has not been told.
 */

import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { IconRefreshCw } from '@/components/ui/icons';
import type { ResolvedTheme } from '@/types';
import { buildResetDisplay } from '@/utils/quota';
import { getAuthFileIcon, getTypeLabel } from '@/features/authFiles/constants';
import type { LedgerMeter } from '../ledgerModel';
import type { QuotaFileEntry } from '../logic';
import type { QuotaProviderType } from '../providers/types';
import { meterLevelClass } from './ledgerLevel';
import styles from './QuotaLedger.module.scss';

export interface QuotaLedgerRow {
  key: string;
  entry: QuotaFileEntry;
  /** Already masked unless emails are shown. */
  name: string;
  plan: string | null;
  status: 'idle' | 'loading' | 'success' | 'error';
  error?: string;
  meters: LedgerMeter[];
  canRefresh: boolean;
}

export interface QuotaLedgerGroup {
  provider: QuotaProviderType;
  rows: QuotaLedgerRow[];
  /** Meter ids in column order, shared by every row of the group. */
  columns: string[];
}

export type QuotaLedgerProps = {
  groups: QuotaLedgerGroup[];
  resolvedTheme: ResolvedTheme;
  now: number;
  onRefresh: (entry: QuotaFileEntry) => void;
};

function MeterCell({ meter, now }: { meter: LedgerMeter; now: number }) {
  const { t, i18n } = useTranslation();
  const reset = buildResetDisplay(null, meter.resetAtMs, now, i18n.resolvedLanguage);
  const percent = meter.remainingPercent;

  return (
    <div className={styles.meter}>
      <div className={styles.meterHeader}>
        <span className={styles.meterLabel}>{meter.label}</span>
        <span className={styles.meterValue}>
          {percent === null ? '--' : `${Math.round(percent)}%`}
        </span>
      </div>
      <div
        className={styles.meterTrack}
        role={percent === null ? undefined : 'meter'}
        aria-label={percent === null ? undefined : meter.label}
        aria-valuemin={percent === null ? undefined : 0}
        aria-valuemax={percent === null ? undefined : 100}
        aria-valuenow={percent === null ? undefined : Math.round(percent)}
      >
        <span
          className={`${styles.meterFill} ${meterLevelClass(percent)}`}
          style={{ width: `${percent ?? 0}%` }}
        />
      </div>
      <div className={styles.meterReset}>
        {reset?.relative ? (
          <>
            <span className={styles.resetRelative}>{reset.relative}</span>
            <span className={styles.resetAbsolute}>{reset.absolute}</span>
          </>
        ) : (
          <span className={styles.resetAbsolute}>{t('quota_management.ledger_no_reset')}</span>
        )}
      </div>
    </div>
  );
}

function RowBody({ row, columns, now }: { row: QuotaLedgerRow; columns: string[]; now: number }) {
  const { t } = useTranslation();
  if (row.status === 'error') {
    return (
      <p className={styles.rowMessage} role="alert">
        {row.error || t('quota_management.ledger_load_failed')}
      </p>
    );
  }
  if (row.status === 'loading') {
    return <p className={styles.rowMessage}>{t('quota_management.ledger_loading')}</p>;
  }
  if (row.status === 'idle') {
    return <p className={styles.rowMessage}>{t('quota_management.ledger_idle')}</p>;
  }
  if (row.meters.length === 0) {
    return <p className={styles.rowMessage}>{t('quota_management.ledger_no_windows')}</p>;
  }
  return (
    <div className={styles.meters}>
      {columns.map((id) => {
        const meter = row.meters.find((candidate) => candidate.id === id);
        return meter ? (
          <MeterCell key={id} meter={meter} now={now} />
        ) : (
          <div key={id} className={styles.meter} aria-hidden="true" />
        );
      })}
    </div>
  );
}

export function QuotaLedger({ groups, resolvedTheme, now, onRefresh }: QuotaLedgerProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.ledger}>
      {groups.map((group) => {
        const icon = getAuthFileIcon(group.provider, resolvedTheme);
        return (
          <section
            key={group.provider}
            className={styles.group}
            aria-labelledby={`ledger-${group.provider}`}
          >
            <h2 id={`ledger-${group.provider}`} className={styles.groupTitle}>
              {icon && <img src={icon} alt="" className={styles.providerIcon} />}
              {getTypeLabel(t, group.provider)}
              <span className={styles.groupCount}>{group.rows.length}</span>
            </h2>
            <ul
              className={styles.rows}
              style={{ '--ledger-columns': Math.max(1, group.columns.length) } as CSSProperties}
            >
              {group.rows.map((row) => (
                <li key={row.key} className={styles.row}>
                  <div className={styles.identity}>
                    <span className={styles.identityName} title={row.name}>
                      {row.name}
                    </span>
                    {row.plan && <span className={styles.identityPlan}>{row.plan}</span>}
                  </div>
                  <RowBody row={row} columns={group.columns} now={now} />
                  <button
                    type="button"
                    className={styles.rowAction}
                    disabled={!row.canRefresh || row.status === 'loading'}
                    onClick={() => onRefresh(row.entry)}
                  >
                    <IconRefreshCw
                      size={14}
                      className={row.status === 'loading' ? styles.spinning : undefined}
                      aria-hidden="true"
                    />
                    {row.status === 'idle'
                      ? t('quota_management.ledger_load')
                      : t('quota_management.ledger_refresh')}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
