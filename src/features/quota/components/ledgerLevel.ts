import { QUOTA_PROGRESS_HIGH_THRESHOLD, QUOTA_PROGRESS_MEDIUM_THRESHOLD } from './QuotaMeter';
import styles from './QuotaLedger.module.scss';

/** The ledger's three meter colours, on QuotaMeter's thresholds; unknown stays unfilled. */
export const meterLevelClass = (percent: number | null): string =>
  percent === null
    ? styles.levelUnknown
    : percent >= QUOTA_PROGRESS_HIGH_THRESHOLD
      ? styles.levelHigh
      : percent >= QUOTA_PROGRESS_MEDIUM_THRESHOLD
        ? styles.levelMedium
        : styles.levelLow;
