import { HealthScope } from '../streams/stream-health.service';
export const MAINTENANCE_QUEUE = 'maintenance';

export const JOB_FULL_IMPORT = 'full-import';
export const JOB_HEALTH_CHECK = 'health-check';

export interface FullImportJobData {
  trigger: string;
}

export interface HealthCheckJobData {
  /** Périmètre du contrôle ; par défaut tout ce qui sort d'une playlist. */
  scope?: HealthScope;
  trigger: string;
  /** Limite le contrôle à ces codes pays (vide = tout le périmètre). */
  countries?: string[];
}
