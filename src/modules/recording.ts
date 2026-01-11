import {
  record,
  type eventWithTime,
  IncrementalSource,
  MouseInteractions,
} from "rrweb";
import { getRecordConsolePlugin } from "@rrweb/rrweb-plugin-console-record";
import type {
  RecordingModule,
  DebugReport,
  ConsoleEntry,
  UserAction,
} from "./recording.types.js";
import { generateUuid } from "../utils/common.js";

// Extended event type for all captured data
type RRWebEvent = eventWithTime & {
  data?: {
    // Plugin data (console)
    plugin?: string;
    payload?: {
      level?: string;
      payload?: unknown[];
    };
    // Incremental snapshot data
    source?: number;
    type?: number;
    id?: number;
    text?: string;
  };
};

// Recording state
interface RecordingState {
  isRecording: boolean;
  sessionId: string | null;
  startTime: string | null;
  events: RRWebEvent[];
  stopFn: (() => void) | null;
}

const state: RecordingState = {
  isRecording: false,
  sessionId: null,
  startTime: null,
  events: [],
  stopFn: null,
};

/**
 * Creates the recording module for the Base44 SDK.
 *
 * @returns Recording module with methods for capturing debug sessions
 * @internal
 */
export function createRecordingModule(): RecordingModule {
  return {
    start(): void {
      if (state.isRecording) {
        throw new Error("Recording is already in progress");
      }

      if (typeof window === "undefined") {
        throw new Error("Recording is only available in browser environments");
      }

      // Reset state
      state.isRecording = true;
      state.sessionId = generateUuid();
      state.startTime = new Date().toISOString();
      state.events = [];

      const stopFn = record({
        emit: (event) => {
          state.events.push(event as RRWebEvent);
        },
        plugins: [
          getRecordConsolePlugin({
            level: ["log", "warn", "error", "info", "debug"],
            lengthThreshold: 10000,
            stringifyOptions: {
              stringLengthLimit: 5000,
              numOfKeysLimit: 100,
              depthOfLimit: 5,
            },
          }),
        ],
      });
      state.stopFn = stopFn ?? null;
    },

    stop(): DebugReport {
      if (!state.isRecording) {
        throw new Error("No recording is in progress");
      }

      // Stop rrweb recording
      if (state.stopFn) {
        state.stopFn();
        state.stopFn = null;
      }

      const endTime = new Date().toISOString();
      const startTime = state.startTime!;
      const duration =
        new Date(endTime).getTime() - new Date(startTime).getTime();

      // Extract data from events
      const consoleEntries = extractConsoleEntries(state.events);
      const userActions = extractUserActions(state.events);

      const report: DebugReport = {
        sessionId: state.sessionId!,
        startTime,
        endTime,
        duration,
        console: consoleEntries,
        userActions,
      };

      // Reset state
      state.isRecording = false;
      state.sessionId = null;
      state.startTime = null;
      state.events = [];

      return report;
    },

    isRecording(): boolean {
      return state.isRecording;
    },

    toText(report: DebugReport): string {
      const lines: string[] = [
        "## Debug Session Report",
        `Session ID: ${report.sessionId}`,
        `Duration: ${report.duration}ms`,
        `Recorded: ${report.startTime} to ${report.endTime}`,
        "",
        `### User Actions (${report.userActions.length} actions)`,
      ];

      if (report.userActions.length === 0) {
        lines.push("No user actions captured.");
      } else {
        for (const action of report.userActions) {
          const timestamp = new Date(action.timestamp).toISOString();
          const valueStr = action.value ? ` = "${action.value}"` : "";
          lines.push(
            `[${timestamp}] ${action.type}: ${action.target}${valueStr}`
          );
        }
      }

      lines.push("");
      lines.push(`### Console Output (${report.console.length} entries)`);

      if (report.console.length === 0) {
        lines.push("No console output captured.");
      } else {
        for (const entry of report.console) {
          const timestamp = new Date(entry.timestamp).toISOString();
          lines.push(
            `[${timestamp}] [${entry.level.toUpperCase()}] ${entry.message}`
          );
        }
      }

      return lines.join("\n");
    },
  };
}

/**
 * Extracts console entries from rrweb events.
 */
function extractConsoleEntries(events: RRWebEvent[]): ConsoleEntry[] {
  const consoleEntries: ConsoleEntry[] = [];

  for (const event of events) {
    // rrweb plugin events have type 6
    if (event.type === 6 && event.data?.plugin === "rrweb/console@1") {
      const payload = event.data.payload;
      if (payload && payload.level && payload.payload) {
        const message = stringifyConsolePayload(payload.payload);
        consoleEntries.push({
          level: payload.level as ConsoleEntry["level"],
          message,
          timestamp: event.timestamp,
        });
      }
    }
  }

  return consoleEntries;
}

/**
 * Converts console payload array to a readable string.
 */
function stringifyConsolePayload(payload: unknown[]): string {
  return payload
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      try {
        return JSON.stringify(item);
      } catch {
        return String(item);
      }
    })
    .join(" ");
}

/**
 * Extracts user actions from rrweb events.
 */
function extractUserActions(events: RRWebEvent[]): UserAction[] {
  const userActions: UserAction[] = [];

  // Build a map of node IDs to readable descriptions from the full snapshot
  const nodeMap = buildNodeMap(events);

  for (const event of events) {
    // IncrementalSnapshot events have type 3
    if (event.type !== 3 || !event.data) continue;

    const { source, type, id, text } = event.data;

    // Mouse interactions
    if (source === IncrementalSource.MouseInteraction && id !== undefined) {
      const actionType = getMouseInteractionType(type);
      if (actionType) {
        userActions.push({
          type: actionType,
          target: nodeMap.get(id) || `element#${id}`,
          timestamp: event.timestamp,
        });
      }
    }

    // Input events
    if (source === IncrementalSource.Input && id !== undefined) {
      userActions.push({
        type: "input",
        target: nodeMap.get(id) || `input#${id}`,
        value: text ? truncateString(text, 100) : undefined,
        timestamp: event.timestamp,
      });
    }
  }

  return userActions;
}

/**
 * Maps mouse interaction type number to readable action type.
 */
function getMouseInteractionType(
  type: number | undefined
): UserAction["type"] | null {
  switch (type) {
    case MouseInteractions.Click:
      return "click";
    case MouseInteractions.DblClick:
      return "dblclick";
    default:
      return null;
  }
}

/**
 * Builds a map of node IDs to readable descriptions from the full snapshot.
 */
function buildNodeMap(events: RRWebEvent[]): Map<number, string> {
  const nodeMap = new Map<number, string>();

  // Find the full snapshot (type 2)
  const fullSnapshot = events.find((e) => e.type === 2);
  if (!fullSnapshot) return nodeMap;

  // Recursively extract node info
  const extractNodes = (node: any) => {
    if (!node || typeof node !== "object") return;

    if (node.id !== undefined && node.tagName) {
      const parts: string[] = [`<${node.tagName.toLowerCase()}`];

      if (node.attributes) {
        if (node.attributes.id) {
          parts[0] += `#${node.attributes.id}`;
        }
        if (node.attributes.class) {
          const firstClass = node.attributes.class.split(" ")[0];
          if (firstClass) parts[0] += `.${firstClass}`;
        }
      }
      parts[0] += ">";

      // Add text content hint if available
      if (node.childNodes) {
        for (const child of node.childNodes) {
          if (child.type === 3 && child.textContent) {
            // Text node
            const text = child.textContent.trim().slice(0, 30);
            if (text) {
              parts.push(`"${text}"`);
              break;
            }
          }
        }
      }

      nodeMap.set(node.id, parts.join(" "));
    }

    // Recurse into children
    if (node.childNodes) {
      for (const child of node.childNodes) {
        extractNodes(child);
      }
    }
  };

  // Start from the snapshot data
  if ((fullSnapshot as any).data?.node) {
    extractNodes((fullSnapshot as any).data.node);
  }

  return nodeMap;
}

/**
 * Truncates a string to a maximum length.
 */
function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}
