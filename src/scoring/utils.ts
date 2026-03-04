// src/scoring/utils.ts

export type Gender = "M" | "F";

export function parseNumber(s: string): number | null {
  const t = String(s ?? "").trim();
  if (t.length === 0) return null; // FIX: blanks should not become 0
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function getAgeBand(age: number): string {
  if (!Number.isFinite(age) || age < 0) return "Under 25";
  if (age < 25) return "Under 25";
  if (age <= 29) return "25-29";
  if (age <= 34) return "30-34";
  if (age <= 39) return "35-39";
  if (age <= 44) return "40-44";
  if (age <= 49) return "45-49";
  if (age <= 54) return "50-54";
  if (age <= 59) return "55-59";
  return "60 and Over";
}

// PFRA rows are [points, minValue] in descending points order; value must be >= minValue
export function lookupMinValuePointsPFRA(table: any, ageBand: string, gender: Gender, value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  const band = table.bands?.[ageBand];
  const rows: [number, number][] | undefined = band?.[gender];
  if (!rows || rows.length === 0) return 0;

  for (const [points, minVal] of rows) {
    if (value >= minVal) return points;
  }
  return 0;
}

export function timeToSeconds(input: string): number | null {
  const s = String(input ?? "").trim();
  if (!s) return null;

  const parts = s.split(":");
  if (parts.length !== 2) return null;

  const mm = Number(parts[0]);
  const ss = Number(parts[1]);

  if (!Number.isFinite(mm) || !Number.isFinite(ss)) return null;
  if (mm < 0 || ss < 0 || ss >= 60) return null;

  return mm * 60 + ss;
}

export function isValidMMSS(input: string): boolean {
  const t = String(input ?? "").trim();
  if (!t) return true;
  return timeToSeconds(t) != null;
}

// PFRA rows are [points, maxTime "mm:ss"] in descending points order; time must be <= maxTime
export function lookupMaxTimePointsPFRA(table: any, ageBand: string, gender: Gender, timeSec: number): number {
  if (!Number.isFinite(timeSec) || timeSec < 0) return 0;

  const band = table.bands?.[ageBand];
  const rows: [number, string][] | undefined = band?.[gender];
  if (!rows || rows.length === 0) return 0;

  for (const [points, maxTime] of rows) {
    const maxSec = timeToSeconds(maxTime);
    if (maxSec == null) continue;
    if (timeSec <= maxSec) return points;
  }
  return 0;
}