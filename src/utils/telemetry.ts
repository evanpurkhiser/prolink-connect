/**
 * Telemetry utility - Sentry removed, now a no-op implementation.
 */

/**
 * Check if telemetry is enabled - always false now.
 */
export const isTelemetryEnabled = (): boolean => false;

/**
 * Span status values for telemetry.
 */
export const SpanStatus = {
  Ok: 'ok',
  Cancelled: 'cancelled',
  Unknown: 'unknown',
  InvalidArgument: 'invalid_argument',
  DeadlineExceeded: 'deadline_exceeded',
  NotFound: 'not_found',
  AlreadyExists: 'already_exists',
  PermissionDenied: 'permission_denied',
  ResourceExhausted: 'resource_exhausted',
  FailedPrecondition: 'failed_precondition',
  Aborted: 'aborted',
  OutOfRange: 'out_of_range',
  Unimplemented: 'unimplemented',
  InternalError: 'internal_error',
  Unavailable: 'unavailable',
  DataLoss: 'data_loss',
  Unauthenticated: 'unauthenticated',
} as const;

export type SpanStatusType = (typeof SpanStatus)[keyof typeof SpanStatus];

/**
 * Context for starting a child span.
 */
export interface SpanContext {
  name?: string;
  op?: string;
  description?: string;
  data?: Record<string, unknown>;
}

/**
 * Interface for span-like objects returned by telemetry functions.
 */
export interface TelemetrySpan {
  startChild(context?: SpanContext): TelemetrySpan;
  setData(key: string, value: unknown): TelemetrySpan;
  setTag(key: string, value: string): TelemetrySpan;
  setStatus(status: SpanStatusType): TelemetrySpan;
  end(): void;
  /** @deprecated Use end() instead */
  finish(): void;
}

/**
 * No-op span implementation.
 */
const noopSpan: TelemetrySpan = {
  startChild(_context?: SpanContext) {
    return noopSpan;
  },
  setData(_key: string, _value: unknown) {
    return noopSpan;
  },
  setTag(_key: string, _value: string) {
    return noopSpan;
  },
  setStatus(_status: SpanStatusType) {
    return noopSpan;
  },
  end() {
    // Intentional no-op
  },
  finish() {
    // Intentional no-op
  },
};

/**
 * Initialize telemetry - no-op.
 */
export function init(_options?: unknown): void {
  // Intentional no-op
}

/**
 * Start a transaction/span - returns no-op.
 */
export function startTransaction(_context: SpanContext): TelemetrySpan {
  return noopSpan;
}

/**
 * Capture an exception - no-op.
 */
export function captureException(_exception: unknown, _hint?: unknown): string {
  return '';
}

/**
 * Capture a message - no-op.
 */
export function captureMessage(_message: string, _level?: unknown): string {
  return '';
}

/**
 * Set a tag - no-op.
 */
export function setTag(_key: string, _value: string): void {
  // Intentional no-op
}

/**
 * Severity levels for messages.
 */
export const Severity = {
  Fatal: 'fatal',
  Error: 'error',
  Warning: 'warning',
  Log: 'log',
  Info: 'info',
  Debug: 'debug',
} as const;
