export class TimeRange {
  private constructor(
    private readonly _fromMs: number,
    private readonly _toMs: number,
  ) {}

  static parse(_fromIso: string, _toIso: string): TimeRange {
    const fromMs = parseIsoWithOffsetMs(_fromIso);
    const toMs = parseIsoWithOffsetMs(_toIso);

    if (fromMs > toMs) {
      const error = new Error("Invalid time range.");
      (error as unknown as { code: string }).code = "INVALID_TASK_FORMAT";
      throw error;
    }

    return new TimeRange(fromMs, toMs);
  }

  contains(_iso: string): boolean {
    const ms = parseIsoWithOffsetMs(_iso);
    return ms >= this._fromMs && ms <= this._toMs;
  }
}

const ISO_WITH_OFFSET_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?[+-]\d{2}:\d{2}$/;

function parseIsoWithOffsetMs(iso: string): number {
  if (typeof iso !== "string" || !ISO_WITH_OFFSET_REGEX.test(iso)) {
    const error = new Error("Invalid timestamp.");
    (error as unknown as { code: string }).code = "INVALID_TASK_FORMAT";
    throw error;
  }

  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) {
    const error = new Error("Invalid timestamp.");
    (error as unknown as { code: string }).code = "INVALID_TASK_FORMAT";
    throw error;
  }

  return ms;
}
