import * as z from "zod";

import type { SdkLogger } from "../options";
import type { Shape } from "../protocol/schemas/shape";

/** A way a payload departed from its described shape. */
export type Drift = {
  kind: "newField" | "newValue" | "missingField" | "typeChanged" | "other";
  /** Where, with array indexes as `[]`: `rounds[].question.type`. */
  path: string;
  detail: string;
  /** The value found, as JSON, cut short. */
  sample?: string;
};

/** Enough to spot a pattern, not enough to flood the logs. */
const MAX_DRIFT_REPORTS = 100;
const MAX_SAMPLE_LENGTH = 500;

/**
 * Reads GeoGuessr payloads against their shapes. A payload the SDK can't use
 * is logged as an error; any drift from the described shape — a new field, a
 * new enum value, a missing field, a changed type — is logged as a warning,
 * once per client, so the code and the stored data can catch up with it.
 */
export class PayloadReader {
  readonly #logger: SdkLogger;
  readonly #reported = new Set<string>();

  constructor(logger: SdkLogger) {
    this.#logger = logger;
  }

  /** `data` read with `shape`, or `null` if the SDK can't use it. */
  read<Schema extends z.ZodType>(
    shape: Shape<Schema>,
    data: unknown,
  ): z.output<Schema> | null {
    this.audit(shape, data);

    const result = shape.runtime.safeParse(data);
    if (result.success) return result.data;

    this.#logger.error(`🧬 Could not read a ${shape.name}`, {
      data,
      reason: z.prettifyError(result.error),
    });
    return null;
  }

  /** Only reports drift: for payloads the SDK has no use for. */
  audit(shape: Shape, data: unknown) {
    try {
      const result = shape.audit.safeParse(data, { reportInput: true });
      if (result.success) return;

      for (const drift of result.error.issues.flatMap(toDrifts)) {
        this.#report(shape.name, drift);
      }
    } catch (error) {
      // The audit is a bystander: it must never cost a payload.
      this.#logger.warn("🧬 Could not audit a payload", {
        payload: shape.name,
        error,
      });
    }
  }

  #report(payload: string, drift: Drift) {
    const key = `${payload}|${drift.kind}|${drift.path}|${drift.detail}`;
    if (this.#reported.has(key) || this.#reported.size >= MAX_DRIFT_REPORTS) {
      return;
    }
    this.#reported.add(key);
    this.#logger.warn("🧬 GeoGuessr payload drifted", { payload, ...drift });
  }
}

const toDrifts = (issue: z.core.$ZodIssue): Drift[] => {
  const path = formatPath(issue.path);
  switch (issue.code) {
    case "unrecognized_keys":
      return issue.keys.map((key) => ({
        kind: "newField",
        path: joinPath(path, key),
        detail: key,
        sample: sampleOf(fieldOf(issue.input, key)),
      }));
    case "invalid_value":
      return [
        {
          kind: "newValue",
          path,
          detail: String(issue.input),
          sample: sampleOf(issue.input),
        },
      ];
    case "invalid_type":
    case "invalid_union":
      return [
        issue.input === undefined
          ? { kind: "missingField", path, detail: expectedOf(issue) }
          : {
              kind: "typeChanged",
              path,
              detail: `${expectedOf(issue)} → ${typeOf(issue.input)}`,
              sample: sampleOf(issue.input),
            },
      ];
    default:
      return [
        {
          kind: "other",
          path,
          detail: issue.message,
          sample: sampleOf(issue.input),
        },
      ];
  }
};

const formatPath = (path: PropertyKey[]) =>
  path
    .map((key) => (typeof key === "number" ? "[]" : `.${String(key)}`))
    .join("")
    .replace(/^\./, "");

const joinPath = (path: string, key: string) => (path ? `${path}.${key}` : key);

const fieldOf = (input: unknown, key: string) =>
  input && typeof input === "object"
    ? (input as Record<string, unknown>)[key]
    : undefined;

const expectedOf = (issue: z.core.$ZodIssue) =>
  "expected" in issue ? String(issue.expected) : "one of its known types";

const typeOf = (value: unknown) => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
};

const sampleOf = (value: unknown) =>
  JSON.stringify(value)?.slice(0, MAX_SAMPLE_LENGTH);
