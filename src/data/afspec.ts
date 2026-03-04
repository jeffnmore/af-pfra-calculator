// src/data/afspec.ts

import { timeToSeconds } from "../scoring/utils.ts";

// Strength/Core points (15.0 down to 2.5) — value must be >= min to earn points
export const AFSPEC_STRENGTH_CORE: Array<{
  pts: number;
  pushups: number;
  hrpu: number;
  situps: number;
  revCrunch: number;
  plankMin: string; // mm:ss (minimum time to earn points)
}> = [
  { pts: 15.0, pushups: 67, hrpu: 52, situps: 58, revCrunch: 60, plankMin: "3:40" },
  { pts: 14.5, pushups: 66, hrpu: 51, situps: 57, revCrunch: 59, plankMin: "3:35" },
  { pts: 14.0, pushups: 64, hrpu: 50, situps: 56, revCrunch: 58, plankMin: "3:30" },
  { pts: 13.5, pushups: 63, hrpu: 49, situps: 55, revCrunch: 57, plankMin: "3:25" },
  { pts: 13.0, pushups: 61, hrpu: 48, situps: 54, revCrunch: 56, plankMin: "3:20" },
  { pts: 12.5, pushups: 60, hrpu: 47, situps: 53, revCrunch: 55, plankMin: "3:15" },
  { pts: 12.0, pushups: 58, hrpu: 46, situps: 52, revCrunch: 54, plankMin: "3:10" },
  { pts: 11.5, pushups: 57, hrpu: 45, situps: 51, revCrunch: 53, plankMin: "3:05" },
  { pts: 11.0, pushups: 55, hrpu: 44, situps: 50, revCrunch: 52, plankMin: "3:00" },
  { pts: 10.5, pushups: 54, hrpu: 43, situps: 49, revCrunch: 51, plankMin: "2:55" },
  { pts: 10.0, pushups: 52, hrpu: 42, situps: 48, revCrunch: 50, plankMin: "2:50" },
  { pts: 9.5, pushups: 51, hrpu: 41, situps: 47, revCrunch: 49, plankMin: "2:45" },
  { pts: 9.0, pushups: 49, hrpu: 40, situps: 46, revCrunch: 48, plankMin: "2:40" },
  { pts: 8.5, pushups: 48, hrpu: 39, situps: 45, revCrunch: 47, plankMin: "2:35" },
  { pts: 8.0, pushups: 46, hrpu: 38, situps: 44, revCrunch: 46, plankMin: "2:30" },
  { pts: 7.5, pushups: 45, hrpu: 37, situps: 43, revCrunch: 45, plankMin: "2:25" },
  { pts: 7.0, pushups: 43, hrpu: 36, situps: 42, revCrunch: 44, plankMin: "2:20" },
  { pts: 6.5, pushups: 42, hrpu: 35, situps: 41, revCrunch: 43, plankMin: "2:15" },
  { pts: 6.0, pushups: 40, hrpu: 34, situps: 40, revCrunch: 42, plankMin: "2:10" },
  { pts: 5.5, pushups: 39, hrpu: 33, situps: 39, revCrunch: 41, plankMin: "2:05" },
  { pts: 5.0, pushups: 37, hrpu: 32, situps: 38, revCrunch: 40, plankMin: "2:00" },
  { pts: 4.5, pushups: 36, hrpu: 31, situps: 37, revCrunch: 39, plankMin: "1:55" },
  { pts: 4.0, pushups: 34, hrpu: 30, situps: 36, revCrunch: 38, plankMin: "1:50" },
  { pts: 3.5, pushups: 33, hrpu: 29, situps: 35, revCrunch: 37, plankMin: "1:45" },
  { pts: 3.0, pushups: 31, hrpu: 28, situps: 34, revCrunch: 36, plankMin: "1:40" },
  { pts: 2.5, pushups: 30, hrpu: 27, situps: 33, revCrunch: 35, plankMin: "1:35" },
];

// Cardio points (50.0 down to 35.0) — 2-mile <= max time; HAMR >= min shuttles
export const AFSPEC_CARDIO: Array<{
  pts: number;
  runMax: string; // mm:ss
  hamrMin: number; // shuttles
}> = [
  { pts: 50.0, runMax: "13:25", hamrMin: 87 },
  { pts: 49.5, runMax: "13:44", hamrMin: 84 },
  { pts: 49.0, runMax: "14:03", hamrMin: 81 },
  { pts: 48.0, runMax: "14:22", hamrMin: 78 },
  { pts: 47.0, runMax: "14:41", hamrMin: 75 },
  { pts: 46.0, runMax: "15:00", hamrMin: 72 },
  { pts: 45.0, runMax: "15:19", hamrMin: 70 },
  { pts: 44.0, runMax: "15:38", hamrMin: 67 },
  { pts: 43.0, runMax: "15:57", hamrMin: 65 },
  { pts: 42.0, runMax: "16:16", hamrMin: 63 },
  { pts: 41.0, runMax: "16:35", hamrMin: 60 },
  { pts: 40.0, runMax: "16:54", hamrMin: 58 },
  { pts: 39.0, runMax: "17:16", hamrMin: 56 },
  { pts: 38.5, runMax: "17:32", hamrMin: 54 },
  { pts: 38.0, runMax: "17:51", hamrMin: 52 },
  { pts: 37.5, runMax: "18:10", hamrMin: 51 },
  { pts: 37.0, runMax: "18:29", hamrMin: 49 },
  { pts: 36.5, runMax: "18:48", hamrMin: 47 },
  { pts: 36.0, runMax: "19:07", hamrMin: 46 },
  { pts: 35.5, runMax: "19:36", hamrMin: 44 },
  { pts: 35.0, runMax: "19:45", hamrMin: 42 },
];

export function lookupAFSPECStrengthCorePoints(
  component: "pushups" | "hrpu" | "situps" | "revCrunch" | "plank",
  value: number
): number {
  if (!Number.isFinite(value) || value < 0) return 0;

  for (const row of AFSPEC_STRENGTH_CORE) {
    if (component === "pushups" && value >= row.pushups) return row.pts;
    if (component === "hrpu" && value >= row.hrpu) return row.pts;
    if (component === "situps" && value >= row.situps) return row.pts;
    if (component === "revCrunch" && value >= row.revCrunch) return row.pts;
    if (component === "plank") {
      const minSec = timeToSeconds(row.plankMin);
      if (minSec != null && value >= minSec) return row.pts;
    }
  }
  return 0;
}

export function lookupAFSPEC2MilePoints(timeSec: number): number {
  if (!Number.isFinite(timeSec) || timeSec < 0) return 0;
  for (const row of AFSPEC_CARDIO) {
    const maxSec = timeToSeconds(row.runMax);
    if (maxSec != null && timeSec <= maxSec) return row.pts;
  }
  return 0;
}

export function lookupAFSPECHamrPoints(shuttles: number): number {
  if (!Number.isFinite(shuttles) || shuttles < 0) return 0;
  for (const row of AFSPEC_CARDIO) {
    if (shuttles >= row.hamrMin) return row.pts;
  }
  return 0;
}