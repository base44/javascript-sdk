/**
 * A console log entry captured during recording.
 */
export interface ConsoleEntry {
  /** The console method that was called. */
  level: "log" | "warn" | "error" | "info" | "debug";
  /** The logged message content. */
  message: string;
  /** Unix timestamp when the log occurred. */
  timestamp: number;
}

/**
 * A user action captured during recording.
 */
export interface UserAction {
  /** The type of interaction. */
  type: "click" | "dblclick" | "input";
  /** Description of the target element. */
  target: string;
  /** Value entered (for input actions). */
  value?: string;
  /** Unix timestamp when the action occurred. */
  timestamp: number;
}

/**
 * Debug report containing captured session data.
 */
export interface DebugReport {
  /** Unique session identifier. */
  sessionId: string;
  /** Recording start time (ISO 8601). */
  startTime: string;
  /** Recording end time (ISO 8601). */
  endTime: string;
  /** Duration in milliseconds. */
  duration: number;
  /** Captured console output. */
  console: ConsoleEntry[];
  /** Captured user actions (clicks, inputs, etc.). */
  userActions: UserAction[];
}

/**
 * Recording module for capturing debug sessions.
 *
 * This module captures console output from the running app to help debug issues.
 * It's designed to provide context for AI agents analyzing app problems.
 *
 * @example
 * ```typescript
 * // Start recording
 * base44.recording.start();
 *
 * // ... user reproduces the issue ...
 *
 * // Stop and get the report
 * const report = base44.recording.stop();
 * console.log(report.console); // All console output
 *
 * // Get text summary for LLM
 * const summary = base44.recording.toText(report);
 * ```
 */
export interface RecordingModule {
  /**
   * Starts a debug recording session.
   *
   * Captures console output until stopped.
   * Only one recording can be active at a time.
   *
   * @throws {Error} If a recording is already in progress.
   *
   * @example
   * ```typescript
   * base44.recording.start();
   * ```
   */
  start(): void;

  /**
   * Stops the current recording and returns the captured data.
   *
   * @returns The debug report containing all captured console output.
   * @throws {Error} If no recording is in progress.
   *
   * @example
   * ```typescript
   * const report = base44.recording.stop();
   * console.log(`Captured ${report.console.length} console entries`);
   * ```
   */
  stop(): DebugReport;

  /**
   * Checks if a recording is currently in progress.
   *
   * @returns True if recording, false otherwise.
   *
   * @example
   * ```typescript
   * if (!base44.recording.isRecording()) {
   *   base44.recording.start();
   * }
   * ```
   */
  isRecording(): boolean;

  /**
   * Generates a text summary of a debug report for LLM consumption.
   *
   * @param report - The debug report to summarize.
   * @returns A formatted text summary.
   *
   * @example
   * ```typescript
   * const report = base44.recording.stop();
   * const summary = base44.recording.toText(report);
   * // Send summary to your backend for LLM processing
   * ```
   */
  toText(report: DebugReport): string;
}
