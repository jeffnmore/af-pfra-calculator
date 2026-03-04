import React, { useEffect, useMemo, useState } from "react";

import pushups from "./data/strength_pushups.json";
import hrpu from "./data/strength_hrpu.json";

import whtr from "./data/whtr.json";
import run2mile from "./data/cardio_2mile.json";
import hamr from "./data/cardio_hamr.json";

import situps from "./data/core_situps.json";
import reverseCrunch from "./data/core_reverse_crunch.json";
import plank from "./data/core_plank.json";

type Gender = "M" | "F";
type StrengthTest = "pushups" | "hrpu";
type CoreTest = "situps" | "reverse_crunch" | "plank";
type CardioTest = "2mile" | "hamr";
type TestProgram = "PFRA" | "AFSPECWAR_EOD";

function parseNumber(s: string): number | null {
  const n = Number(String(s).trim());
  return Number.isFinite(n) ? n : null;
}

function getAgeBand(age: number): string {
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
function lookupMinValuePointsPFRA(table: any, ageBand: string, gender: Gender, value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  const band = table.bands?.[ageBand];
  const rows: [number, number][] | undefined = band?.[gender];
  if (!rows || rows.length === 0) return 0;

  for (const [points, minVal] of rows) {
    if (value >= minVal) return points;
  }
  return 0;
}

function timeToSeconds(input: string): number | null {
  const s = input.trim();
  if (!s) return null;

  const parts = s.split(":");
  if (parts.length !== 2) return null;

  const mm = Number(parts[0]);
  const ss = Number(parts[1]);

  if (!Number.isFinite(mm) || !Number.isFinite(ss)) return null;
  if (mm < 0 || ss < 0 || ss >= 60) return null;

  return mm * 60 + ss;
}

// PFRA rows are [points, maxTime "mm:ss"] in descending points order; time must be <= maxTime
function lookupMaxTimePointsPFRA(table: any, ageBand: string, gender: Gender, timeSec: number): number {
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

function scoreColor(total: number): { bg: string; fg: string; label: string } {
  if (total >= 90) return { bg: "#0A7A2F", fg: "#FFFFFF", label: "EXCELLENT (≥ 90)" };
  if (total >= 75) return { bg: "#F2C200", fg: "#111111", label: "SATISFACTORY (75–89.9)" };
  return { bg: "#B00020", fg: "#FFFFFF", label: "FAIL (< 75)" };
}

function isDiagnosticWindow(): boolean {
  const now = new Date();
  const cutoff = new Date(2026, 6, 1, 0, 0, 0, 0); // July 1, 2026
  return now < cutoff;
}

// Bulletproof download (avoids PDF viewer weirdness)
async function forceDownload(url: string, filename: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download: ${res.status}`);
  const blob = await res.blob();

  const a = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

function AttachmentTile(props: {
  title: string;
  subtitle?: string;
  url: string;
  filename: string;
  isVeryNarrow: boolean;
  onDownloaded: (filename: string) => void;
  onDownloadFailed: (detail?: string) => void;
}) {
  const { title, subtitle, url, filename, isVeryNarrow, onDownloaded, onDownloadFailed } = props;

  return (
    <div
      style={{
        padding: 10,
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.03)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 86,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ fontWeight: 900, letterSpacing: 0.2, fontSize: 13, lineHeight: 1.15 }}>{title}</div>
        {subtitle ? <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)" }}>{subtitle}</div> : null}
      </div>

      <div
        style={{
          marginTop: "auto",
          display: "grid",
          gridTemplateColumns: isVeryNarrow ? "1fr" : "1fr 1fr",
          gap: 8,
        }}
      >
        <a className="af-btn af-btn--sm" href={url} target="_blank" rel="noreferrer">
          Open PDF
        </a>
        <button
          className="af-btn af-btn--sm"
          type="button"
          onClick={() => {
            forceDownload(url, filename)
              .then(() => onDownloaded(filename))
              .catch((e) => onDownloadFailed(String(e?.message || "")));
          }}
        >
          Download
        </button>
      </div>
    </div>
  );
}

/**
 * AFSPECWAR/EOD page-10 universal standards
 * (Single standard for all ages / all genders)
 */

// Strength/Core points (15.0 down to 2.5) — value must be >= min to earn points
const AFSPEC_STRENGTH_CORE: Array<{
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

// Cardio points (50.0 down to 35.0) — 2-mile must be <= max time; HAMR must be >= min shuttles
const AFSPEC_CARDIO: Array<{
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

function lookupAFSPECStrengthCorePoints(
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

function lookupAFSPEC2MilePoints(timeSec: number): number {
  if (!Number.isFinite(timeSec) || timeSec < 0) return 0;
  for (const row of AFSPEC_CARDIO) {
    const maxSec = timeToSeconds(row.runMax);
    if (maxSec != null && timeSec <= maxSec) return row.pts;
  }
  return 0;
}

function lookupAFSPECHamrPoints(shuttles: number): number {
  if (!Number.isFinite(shuttles) || shuttles < 0) return 0;
  for (const row of AFSPEC_CARDIO) {
    if (shuttles >= row.hamrMin) return row.pts;
  }
  return 0;
}

export default function App() {
  // ===== Branding/Meta (B + C) =====
  const APP_VERSION = "1.0.0";
  const APP_UPDATED = "2026-03-04";

  // ===== Attachments (fix 404 by matching filenames in public/attachments) =====
  // These should exist at:
  // public/attachments/Playbook.pdf
  // public/attachments/PFRA_Scoring_Charts.pdf
  // public/attachments/DAFMAN.pdf
  const ATTACHMENTS = [
    {
      title: "Warfighter’s Fitness Playbook",
      subtitle: "2.0 • Feb 2026",
      url: "/attachments/Playbook.pdf",
      filename: "Playbook.pdf",
    },
    {
      title: "PFRA Scoring Charts",
      subtitle: "Includes AFSPECWAR/EOD page",
      url: "/attachments/PFRA_Scoring_Charts.pdf",
      filename: "PFRA_Scoring_Charts.pdf",
    },
    {
      title: "DAFMAN 36-2905 IC",
      subtitle: "22 Jan 2026",
      url: "/attachments/DAFMAN.pdf",
      filename: "DAFMAN.pdf",
    },
  ] as const;

  // ----- Program selection -----
  const [program, setProgram] = useState<TestProgram>("PFRA");

  // ----- Inputs -----
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Gender>("M");

  const [strengthTest, setStrengthTest] = useState<StrengthTest>("pushups");
  const [coreTest, setCoreTest] = useState<CoreTest>("situps");
  const [cardioTest, setCardioTest] = useState<CardioTest>("2mile");

  const [pushupReps, setPushupReps] = useState("");
  const [hrpuReps, setHrpuReps] = useState("");

  const [situpReps, setSitupReps] = useState("");
  const [reverseCrunchReps, setReverseCrunchReps] = useState("");
  const [plankTime, setPlankTime] = useState("");

  const [run2MileTime, setRun2MileTime] = useState("");
  const [hamrShuttles, setHamrShuttles] = useState("");

  const [height, setHeight] = useState("");
  const [waist, setWaist] = useState("");

  // ----- Exemptions -----
  const [exemptWHtR, setExemptWHtR] = useState(false);
  const [exemptStrength, setExemptStrength] = useState(false);
  const [exemptCore, setExemptCore] = useState(false);
  const [exemptCardio, setExemptCardio] = useState(false);
  const [prorateExemptions, setProrateExemptions] = useState(true);

  // ----- Toast -----
  const [toast, setToast] = useState<{ message: string; kind: "ok" | "err" } | null>(null);
  function showToast(message: string, kind: "ok" | "err" = "ok") {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 2600);
  }

  // ----- Responsive (updates on resize) -----
  const [vw, setVw] = useState<number>(() => (typeof window !== "undefined" ? window.innerWidth : 1200));
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isNarrow = vw < 980;
  const isVeryNarrow = vw < 680;

  // ----- Derived -----
  const ageBand = useMemo(() => {
    const a = parseNumber(age);
    return a == null ? "Under 25" : getAgeBand(a);
  }, [age]);

  const whtrData = useMemo(() => {
    const h = parseNumber(height);
    const w = parseNumber(waist);
    if (h == null || w == null || h <= 0) return { raw: null as number | null, rounded: null as number | null };
    const raw = w / h;
    const rounded = Math.round(raw * 100) / 100;
    return { raw, rounded };
  }, [height, waist]);

  const whtrPoints = useMemo(() => {
    const r = whtrData.rounded;
    if (r == null) return 0;
    if (r >= (whtr as any).fail.min) return 0;
    for (const t of (whtr as any).thresholds) {
      if (r <= t.max) return t.points;
    }
    return 0;
  }, [whtrData]);

  const isAFSPEC = program === "AFSPECWAR_EOD";

  const strengthPoints = useMemo(() => {
    if (exemptStrength) return 0;

    if (!isAFSPEC) {
      if (strengthTest === "pushups") {
        const reps = parseNumber(pushupReps);
        return reps == null ? 0 : lookupMinValuePointsPFRA(pushups, ageBand, gender, reps);
      }
      const reps = parseNumber(hrpuReps);
      return reps == null ? 0 : lookupMinValuePointsPFRA(hrpu, ageBand, gender, reps);
    }

    if (strengthTest === "pushups") {
      const reps = parseNumber(pushupReps);
      return reps == null ? 0 : lookupAFSPECStrengthCorePoints("pushups", reps);
    }
    const reps = parseNumber(hrpuReps);
    return reps == null ? 0 : lookupAFSPECStrengthCorePoints("hrpu", reps);
  }, [exemptStrength, isAFSPEC, strengthTest, pushupReps, hrpuReps, ageBand, gender]);

  const corePoints = useMemo(() => {
    if (exemptCore) return 0;

    if (!isAFSPEC) {
      if (coreTest === "situps") {
        const reps = parseNumber(situpReps);
        return reps == null ? 0 : lookupMinValuePointsPFRA(situps, ageBand, gender, reps);
      }
      if (coreTest === "reverse_crunch") {
        const reps = parseNumber(reverseCrunchReps);
        return reps == null ? 0 : lookupMinValuePointsPFRA(reverseCrunch, ageBand, gender, reps);
      }
      const sec = timeToSeconds(plankTime);
      return sec == null ? 0 : lookupMinValuePointsPFRA(plank, ageBand, gender, sec);
    }

    if (coreTest === "situps") {
      const reps = parseNumber(situpReps);
      return reps == null ? 0 : lookupAFSPECStrengthCorePoints("situps", reps);
    }
    if (coreTest === "reverse_crunch") {
      const reps = parseNumber(reverseCrunchReps);
      return reps == null ? 0 : lookupAFSPECStrengthCorePoints("revCrunch", reps);
    }
    const sec = timeToSeconds(plankTime);
    return sec == null ? 0 : lookupAFSPECStrengthCorePoints("plank", sec);
  }, [exemptCore, isAFSPEC, coreTest, situpReps, reverseCrunchReps, plankTime, ageBand, gender]);

  const cardioPoints = useMemo(() => {
    if (exemptCardio) return 0;

    if (!isAFSPEC) {
      if (cardioTest === "2mile") {
        const sec = timeToSeconds(run2MileTime);
        return sec == null ? 0 : lookupMaxTimePointsPFRA(run2mile, ageBand, gender, sec);
      }
      const sh = parseNumber(hamrShuttles);
      return sh == null ? 0 : lookupMinValuePointsPFRA(hamr, ageBand, gender, sh);
    }

    if (cardioTest === "2mile") {
      const sec = timeToSeconds(run2MileTime);
      return sec == null ? 0 : lookupAFSPEC2MilePoints(sec);
    }
    const sh = parseNumber(hamrShuttles);
    return sh == null ? 0 : lookupAFSPECHamrPoints(sh);
  }, [exemptCardio, isAFSPEC, cardioTest, run2MileTime, hamrShuttles, ageBand, gender]);

  // ----- Exemption-aware totals -----
  const maxWHtR = 20;
  const maxStrength = 15;
  const maxCore = 15;
  const maxCardio = 50;

  const earnedWHtR = exemptWHtR ? 0 : whtrPoints;
  const earnedStrength = strengthPoints;
  const earnedCore = corePoints;
  const earnedCardio = cardioPoints;

  const earnedTotal = useMemo(
    () => earnedWHtR + earnedStrength + earnedCore + earnedCardio,
    [earnedWHtR, earnedStrength, earnedCore, earnedCardio]
  );

  const availableMax = useMemo(() => {
    let m = 0;
    if (!exemptWHtR) m += maxWHtR;
    if (!exemptStrength) m += maxStrength;
    if (!exemptCore) m += maxCore;
    if (!exemptCardio) m += maxCardio;
    return m;
  }, [exemptWHtR, exemptStrength, exemptCore, exemptCardio]);

  const total = useMemo(() => {
    if (availableMax <= 0) return 0;
    if (!prorateExemptions) return earnedTotal;
    return (earnedTotal / availableMax) * 100;
  }, [earnedTotal, availableMax, prorateExemptions]);

  const badge = scoreColor(total);
  const showDiagnostic = isDiagnosticWindow();

  // ----- Visual System -----
  const pageBg = "#041A3A";
  const panelBg = "rgba(8, 18, 38, 0.78)";
  const panelBorder = "1px solid rgba(255,255,255,0.12)";
  const subtleText = "rgba(255,255,255,0.80)";
  const faintText = "rgba(255,255,255,0.62)";
  const accent = "#6EC1FF";

  const cardStyle: React.CSSProperties = {
    background: panelBg,
    borderRadius: 12,
    padding: 14,
    border: panelBorder,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
    backdropFilter: "blur(6px)",
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontWeight: 950,
    marginBottom: 10,
    color: "#FFFFFF",
    letterSpacing: 0.3,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  };

  const sectionTagStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 900,
    color: "rgba(255,255,255,0.70)",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.05)",
    padding: "4px 8px",
    borderRadius: 999,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 800,
    marginBottom: 6,
    color: subtleText,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.20)",
    outline: "none",
    fontSize: 14,
    background: "rgba(255,255,255,0.06)",
    color: "#FFFFFF",
  };

  const selectStyle: React.CSSProperties = { ...inputStyle };

  const kpiCardStyle: React.CSSProperties = {
    ...cardStyle,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minHeight: 92,
  };

  const kpiValueStyle: React.CSSProperties = {
    fontSize: 28,
    fontWeight: 950,
    lineHeight: 1,
    letterSpacing: 0.2,
  };

  const kpiLabelStyle: React.CSSProperties = {
    fontSize: 12,
    color: faintText,
    fontWeight: 800,
    letterSpacing: 0.6,
  };

  const gridCols = isVeryNarrow ? "1fr" : isNarrow ? "1fr 1fr" : "1.05fr 1fr 1fr";
  const kpiCols = isVeryNarrow ? "1fr 1fr" : "repeat(4, 1fr)";

  const disabledCard = (disabled: boolean): React.CSSProperties =>
    disabled
      ? {
          opacity: 0.55,
          filter: "grayscale(0.15)",
        }
      : {};

  return (
    <div
      style={{
        minHeight: "100vh",
        background: pageBg,
        color: "#FFFFFF",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
      }}
    >
      <style>
        {`
          .af-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 10px 12px;
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.14);
            background: rgba(255,255,255,0.06);
            color: rgba(255,255,255,0.92);
            font-weight: 900;
            letter-spacing: 0.2px;
            cursor: pointer;
            text-decoration: none;
            user-select: none;
          }
          .af-btn:hover { background: rgba(255,255,255,0.10); }
          .af-btn:disabled { opacity: 0.55; cursor: not-allowed; }

          .af-btn--sm {
            padding: 8px 10px;
            border-radius: 10px;
            font-size: 12px;
            font-weight: 900;
            letter-spacing: 0.15px;
          }

          /* dropdown option visibility (Windows/Edge) */
          .af-select {
            color: #fff;
            background: rgba(255,255,255,0.06);
          }
          .af-select option {
            color: #fff;
            background: #061a39;
          }
          .af-select:focus {
            outline: none;
            box-shadow: 0 0 0 3px rgba(110,193,255,0.20);
          }
        `}
      </style>

      <div style={{ width: "100%", maxWidth: 1120, padding: 16 }}>
        {/* Accent stripe */}
        <div
          style={{
            height: 4,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${accent} 0%, rgba(110,193,255,0.25) 55%, rgba(110,193,255,0.00) 100%)`,
            marginBottom: 10,
          }}
        />

        {/* Top Command Bar */}
        <div
          style={{
            display: "flex",
            flexDirection: isVeryNarrow ? "column" : "row",
            alignItems: isVeryNarrow ? "stretch" : "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "12px 14px",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0, 0, 0, 0.18)",
            boxShadow: "0 10px 22px rgba(0,0,0,0.25)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.2, color: "rgba(255,255,255,0.72)" }}>
              USAF FITNESS
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "baseline" }}>
              <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: 0.35 }}>PFRA Scoring Dashboard</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.60)" }}>
                v{APP_VERSION} · Updated {APP_UPDATED}
              </div>
            </div>

            <div style={{ fontSize: 12, color: faintText }}>WHtR 20 + Strength 15 + Core 15 + Cardio 50 = 100</div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "stretch",
              flexWrap: "wrap",
              justifyContent: isVeryNarrow ? "flex-start" : "flex-end",
            }}
          >
            <div
              style={{
                ...cardStyle,
                padding: "10px 12px",
                minWidth: isVeryNarrow ? "100%" : 260,
                textAlign: "center",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 900, color: faintText }}>TEST PROGRAM</div>
              <div style={{ marginTop: 8 }}>
                <select
                  className="af-select"
                  value={program}
                  onChange={(e) => setProgram(e.target.value as TestProgram)}
                  style={{ ...selectStyle, padding: "10px 12px" }}
                >
                  <option value="PFRA">PFRA (Standard)</option>
                  <option value="AFSPECWAR_EOD">AFSPECWAR / EOD</option>
                </select>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.62)" }}>
                {isAFSPEC ? "Universal AFSPECWAR/EOD chart (all ages/genders)" : "Age/gender-based PFRA charts"}
              </div>
            </div>

            <div
              style={{
                ...cardStyle,
                padding: "10px 12px",
                minWidth: isVeryNarrow ? "100%" : 240,
                textAlign: "center",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 900, color: faintText }}>STATUS</div>
              <div style={{ marginTop: 6, display: "flex", justifyContent: "center" }}>
                <div
                  style={{
                    background: badge.bg,
                    color: badge.fg,
                    borderRadius: 999,
                    padding: "6px 10px",
                    fontSize: 12,
                    fontWeight: 950,
                    letterSpacing: 0.2,
                    boxShadow: "0 8px 18px rgba(0,0,0,0.25)",
                  }}
                >
                  {badge.label}
                </div>
              </div>
            </div>

            <div
              style={{
                background: "rgba(0,0,0,0.22)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 14,
                padding: "10px 12px",
                minWidth: isVeryNarrow ? "100%" : 190,
                textAlign: "center",
                boxShadow: "0 10px 22px rgba(0,0,0,0.25)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 900, color: faintText }}>TOTAL</div>
              <div style={{ fontSize: 40, fontWeight: 950, lineHeight: 1.05, marginTop: 4 }}>{total.toFixed(1)}</div>
              <div style={{ marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.62)" }}>
                {prorateExemptions ? (
                  <>
                    Prorated · Available max <strong style={{ color: "#fff" }}>{availableMax.toFixed(0)}</strong>
                  </>
                ) : (
                  <>Raw (out of 100)</>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* KPI Row */}
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: kpiCols, gap: 10 }}>
          <div style={kpiCardStyle}>
            <div style={kpiLabelStyle}>WHtR</div>
            <div style={kpiValueStyle}>{earnedWHtR.toFixed(1)}</div>
            <div style={{ fontSize: 12, color: faintText }}>
              {exemptWHtR ? "Exempt" : whtrData.rounded == null ? "—" : `Rounded ${whtrData.rounded.toFixed(2)}`}
            </div>
          </div>

          <div style={kpiCardStyle}>
            <div style={kpiLabelStyle}>STRENGTH</div>
            <div style={kpiValueStyle}>{earnedStrength.toFixed(1)}</div>
            <div style={{ fontSize: 12, color: faintText }}>
              {exemptStrength ? "Exempt" : strengthTest === "pushups" ? "Push-ups" : "HRPU"}
            </div>
          </div>

          <div style={kpiCardStyle}>
            <div style={kpiLabelStyle}>CORE</div>
            <div style={kpiValueStyle}>{earnedCore.toFixed(1)}</div>
            <div style={{ fontSize: 12, color: faintText }}>
              {exemptCore ? "Exempt" : coreTest === "situps" ? "Sit-ups" : coreTest === "reverse_crunch" ? "Reverse crunch" : "Plank"}
            </div>
          </div>

          <div style={kpiCardStyle}>
            <div style={kpiLabelStyle}>CARDIO</div>
            <div style={kpiValueStyle}>{earnedCardio.toFixed(1)}</div>
            <div style={{ fontSize: 12, color: faintText }}>
              {exemptCardio ? "Exempt" : cardioTest === "2mile" ? "2-mile run" : "HAMR"}
            </div>
          </div>
        </div>

        {showDiagnostic && (
          <div
            style={{
              marginTop: 12,
              ...cardStyle,
              display: "flex",
              flexDirection: isVeryNarrow ? "column" : "row",
              justifyContent: "space-between",
              gap: 12,
              alignItems: isVeryNarrow ? "flex-start" : "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 950 }}>DIAGNOSTIC WINDOW</div>
              <div style={{ fontSize: 12, color: faintText, marginTop: 4 }}>
                Active until <strong>1 Jul 2026</strong>. Verify against official charts; alternatives are member-choice where authorized.
              </div>
            </div>
            <div
              style={{
                borderRadius: 999,
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 950,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.06)",
                color: subtleText,
                whiteSpace: "nowrap",
              }}
            >
              {isAFSPEC ? (
                <span style={{ color: "#FFF" }}>AFSPECWAR/EOD universal chart</span>
              ) : (
                <>
                  Band: <span style={{ color: "#FFF" }}>{ageBand}</span> ·{" "}
                  <span style={{ color: "#FFF" }}>{gender === "M" ? "Male" : "Female"}</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Disclaimer (C) */}
        <div style={{ marginTop: 12, ...cardStyle, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)" }}>
          <div style={{ fontWeight: 950, letterSpacing: 0.25 }}>Disclaimer</div>
          <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.74)", lineHeight: 1.35 }}>
            Unofficial member planning tool. Not affiliated with or endorsed by the DoD or USAF. Always verify scoring, exemptions, and program
            requirements against current official guidance and local unit policy.
          </div>
        </div>

        {/* Exemptions */}
        <div style={{ marginTop: 12, ...cardStyle }}>
          <div style={sectionTitleStyle}>
            <span>Exemptions</span>
            <span style={sectionTagStyle}>Adjustments</span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {[
              { label: "WHtR (0–20)", v: exemptWHtR, set: setExemptWHtR },
              { label: "Strength (0–15)", v: exemptStrength, set: setExemptStrength },
              { label: "Core (0–15)", v: exemptCore, set: setExemptCore },
              { label: "Cardio (0–50)", v: exemptCardio, set: setExemptCardio },
            ].map((x) => (
              <label
                key={x.label}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.04)",
                  fontSize: 12,
                  fontWeight: 850,
                  color: "rgba(255,255,255,0.88)",
                }}
              >
                <input type="checkbox" checked={x.v} onChange={(e) => x.set(e.target.checked)} style={{ transform: "scale(1.05)" }} />
                Exempt: {x.label}
              </label>
            ))}
          </div>

          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(255,255,255,0.78)" }}>
              <input type="checkbox" checked={prorateExemptions} onChange={(e) => setProrateExemptions(e.target.checked)} />
              Prorate score to 100 when exemptions are checked
            </label>

            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
              Available max: <strong style={{ color: "#fff" }}>{availableMax.toFixed(0)}</strong> · Earned:{" "}
              <strong style={{ color: "#fff" }}>{earnedTotal.toFixed(1)}</strong>
            </div>
          </div>

          <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.60)" }}>
            Note: Unofficial planning tool. Confirm program rules/exemptions with official guidance.
          </div>
        </div>

        {/* Section separator */}
        <div style={{ marginTop: 14, height: 1, background: "rgba(255,255,255,0.10)" }} />

        {/* Main Grid */}
        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: gridCols,
            gap: 10,
            alignItems: "stretch",
          }}
        >
          {/* Column 1: Profile + WHtR */}
          <div style={{ display: "grid", gap: 10 }}>
            <div style={cardStyle}>
              <div style={sectionTitleStyle}>
                <span>Profile</span>
                <span style={sectionTagStyle}>Inputs</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isVeryNarrow ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={labelStyle}>Exact Age</div>
                  <input value={age} onChange={(e) => setAge(e.target.value)} inputMode="numeric" placeholder="e.g., 27" style={inputStyle} />
                  <div style={{ fontSize: 12, marginTop: 8, color: faintText }}>
                    Band: <strong style={{ color: "#FFF" }}>{ageBand}</strong>
                    {isAFSPEC && <span style={{ marginLeft: 8, color: "rgba(255,255,255,0.62)" }}>(Age N/A)</span>}
                  </div>
                </div>

                <div>
                  <div style={labelStyle}>Gender</div>
                  <select
                    className="af-select"
                    value={gender}
                    onChange={(e) => setGender(e.target.value as Gender)}
                    style={selectStyle}
                    disabled={isAFSPEC}
                    title={isAFSPEC ? "AFSPECWAR/EOD chart is universal (gender not used)" : ""}
                  >
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                  </select>
                  {isAFSPEC && <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.62)" }}>Gender N/A</div>}
                </div>
              </div>
            </div>

            <div style={{ ...cardStyle, ...disabledCard(exemptWHtR) }}>
              <div style={sectionTitleStyle}>
                <span>WHtR (0–20)</span>
                <span style={sectionTagStyle}>Body Comp</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isVeryNarrow ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={labelStyle}>Height</div>
                  <input
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    inputMode="decimal"
                    placeholder="e.g., 68"
                    style={inputStyle}
                    disabled={exemptWHtR}
                  />
                </div>
                <div>
                  <div style={labelStyle}>Waist</div>
                  <input
                    value={waist}
                    onChange={(e) => setWaist(e.target.value)}
                    inputMode="decimal"
                    placeholder="e.g., 38"
                    style={inputStyle}
                    disabled={exemptWHtR}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isVeryNarrow ? "1fr" : "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
                <div style={{ fontSize: 12, color: faintText }}>
                  Raw: <strong style={{ color: "#FFF" }}>{exemptWHtR ? "—" : whtrData.raw == null ? "—" : whtrData.raw.toFixed(4)}</strong>
                </div>
                <div style={{ fontSize: 12, color: faintText }}>
                  Rounded:{" "}
                  <strong style={{ color: "#FFF" }}>{exemptWHtR ? "—" : whtrData.rounded == null ? "—" : whtrData.rounded.toFixed(2)}</strong>
                </div>
                <div style={{ fontSize: 12, color: faintText }}>
                  Points: <strong style={{ color: "#FFF" }}>{earnedWHtR.toFixed(1)}</strong>
                </div>
              </div>

              <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.60)" }}>
                Use the same unit for height and waist (both inches or both cm).
              </div>
            </div>
          </div>

          {/* Column 2: Strength + Core */}
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ ...cardStyle, ...disabledCard(exemptStrength) }}>
              <div style={sectionTitleStyle}>
                <span>Strength (0–15)</span>
                <span style={sectionTagStyle}>Muscular</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 10 }}>
                <div>
                  <div style={labelStyle}>Test</div>
                  <select
                    className="af-select"
                    value={strengthTest}
                    onChange={(e) => setStrengthTest(e.target.value as StrengthTest)}
                    style={selectStyle}
                    disabled={exemptStrength}
                  >
                    <option value="pushups">Push-ups</option>
                    <option value="hrpu">Hand-release push-ups</option>
                  </select>
                </div>

                <div>
                  <div style={labelStyle}>Points</div>
                  <div style={{ fontSize: 26, fontWeight: 950, paddingTop: 4 }}>{earnedStrength.toFixed(1)}</div>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={labelStyle}>{strengthTest === "pushups" ? "Push-ups (reps)" : "HRPU (reps)"}</div>
                <input
                  value={strengthTest === "pushups" ? pushupReps : hrpuReps}
                  onChange={(e) => (strengthTest === "pushups" ? setPushupReps(e.target.value) : setHrpuReps(e.target.value))}
                  inputMode="numeric"
                  placeholder="e.g., 45"
                  style={inputStyle}
                  disabled={exemptStrength}
                />
                {isAFSPEC && (
                  <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.62)" }}>
                    AFSPECWAR/EOD: universal points scale (15.0 → 2.5).
                  </div>
                )}
              </div>
            </div>

            <div style={{ ...cardStyle, ...disabledCard(exemptCore) }}>
              <div style={sectionTitleStyle}>
                <span>Core (0–15)</span>
                <span style={sectionTagStyle}>Stability</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 10 }}>
                <div>
                  <div style={labelStyle}>Test</div>
                  <select
                    className="af-select"
                    value={coreTest}
                    onChange={(e) => setCoreTest(e.target.value as CoreTest)}
                    style={selectStyle}
                    disabled={exemptCore}
                  >
                    <option value="situps">Sit-ups</option>
                    <option value="reverse_crunch">Cross-leg reverse crunch</option>
                    <option value="plank">Forearm plank (mm:ss)</option>
                  </select>
                </div>

                <div>
                  <div style={labelStyle}>Points</div>
                  <div style={{ fontSize: 26, fontWeight: 950, paddingTop: 4 }}>{earnedCore.toFixed(1)}</div>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={labelStyle}>
                  {coreTest === "situps" ? "Sit-ups (reps)" : coreTest === "reverse_crunch" ? "Reverse crunch (reps)" : "Plank (mm:ss)"}
                </div>
                <input
                  value={coreTest === "situps" ? situpReps : coreTest === "reverse_crunch" ? reverseCrunchReps : plankTime}
                  onChange={(e) =>
                    coreTest === "situps"
                      ? setSitupReps(e.target.value)
                      : coreTest === "reverse_crunch"
                      ? setReverseCrunchReps(e.target.value)
                      : setPlankTime(e.target.value)
                  }
                  inputMode={coreTest === "plank" ? "text" : "numeric"}
                  placeholder={coreTest === "plank" ? "e.g., 2:30" : "e.g., 45"}
                  style={inputStyle}
                  disabled={exemptCore}
                />
                {isAFSPEC && coreTest === "plank" && (
                  <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.62)" }}>
                    AFSPECWAR/EOD plank uses the universal thresholds (min time for points).
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Column 3: Cardio + Breakdown */}
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ ...cardStyle, ...disabledCard(exemptCardio) }}>
              <div style={sectionTitleStyle}>
                <span>Cardio (0–50)</span>
                <span style={sectionTagStyle}>Aerobic</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 10 }}>
                <div>
                  <div style={labelStyle}>Test</div>
                  <select
                    className="af-select"
                    value={cardioTest}
                    onChange={(e) => setCardioTest(e.target.value as CardioTest)}
                    style={selectStyle}
                    disabled={exemptCardio}
                  >
                    <option value="2mile">2-mile run (mm:ss)</option>
                    <option value="hamr">20m HAMR (shuttles)</option>
                  </select>
                </div>

                <div>
                  <div style={labelStyle}>Points</div>
                  <div style={{ fontSize: 26, fontWeight: 950, paddingTop: 4 }}>{earnedCardio.toFixed(1)}</div>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={labelStyle}>{cardioTest === "2mile" ? "2-mile time (mm:ss)" : "HAMR shuttles (count)"}</div>
                <input
                  value={cardioTest === "2mile" ? run2MileTime : hamrShuttles}
                  onChange={(e) => (cardioTest === "2mile" ? setRun2MileTime(e.target.value) : setHamrShuttles(e.target.value))}
                  inputMode={cardioTest === "2mile" ? "text" : "numeric"}
                  placeholder={cardioTest === "2mile" ? "e.g., 16:54" : "e.g., 60"}
                  style={inputStyle}
                  disabled={exemptCardio}
                />
                {isAFSPEC && (
                  <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.62)" }}>
                    AFSPECWAR/EOD cardio uses the universal points scale (50.0 → 35.0).
                  </div>
                )}
              </div>
            </div>

            <div style={cardStyle}>
              <div style={sectionTitleStyle}>
                <span>Breakdown</span>
                <span style={sectionTagStyle}>Summary</span>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: subtleText }}>
                  <span>WHtR</span>
                  <strong style={{ color: "#FFF" }}>{earnedWHtR.toFixed(1)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: subtleText }}>
                  <span>Strength</span>
                  <strong style={{ color: "#FFF" }}>{earnedStrength.toFixed(1)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: subtleText }}>
                  <span>Core</span>
                  <strong style={{ color: "#FFF" }}>{earnedCore.toFixed(1)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: subtleText }}>
                  <span>Cardio</span>
                  <strong style={{ color: "#FFF" }}>{earnedCardio.toFixed(1)}</strong>
                </div>

                <div
                  style={{
                    borderTop: "1px solid rgba(255,255,255,0.10)",
                    marginTop: 6,
                    paddingTop: 10,
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ fontWeight: 950 }}>Total</span>
                  <span style={{ fontWeight: 950, fontSize: 18 }}>{total.toFixed(1)}</span>
                </div>

                <div style={{ fontSize: 11, color: faintText, marginTop: 6 }}>
                  Tip: Use <strong style={{ color: "#FFF" }}>Tab</strong> to move between fields quickly.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Downloads */}
        <div style={{ marginTop: 18, height: 1, background: "rgba(255,255,255,0.10)" }} />

        <div
          style={{
            ...cardStyle,
            marginTop: 12,
            padding: 12,
            background: "rgba(8, 18, 38, 0.62)",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        >
          <div style={{ ...sectionTitleStyle, marginBottom: 10, fontSize: 14 }}>
            <span>Downloads</span>
            <span style={{ ...sectionTagStyle, fontSize: 10, padding: "3px 8px" }}>PDF</span>
          </div>

          <div style={{ display: "flex", justifyContent: "center" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isVeryNarrow ? "1fr" : isNarrow ? "1fr 1fr" : "repeat(3, minmax(220px, 320px))",
                gap: 10,
                alignItems: "stretch",
                width: "100%",
                maxWidth: isVeryNarrow ? "100%" : isNarrow ? 820 : 1040,
              }}
            >
              {ATTACHMENTS.map((a) => (
                <AttachmentTile
                  key={a.url}
                  title={a.title}
                  subtitle={a.subtitle}
                  url={a.url}
                  filename={a.filename}
                  isVeryNarrow={isVeryNarrow}
                  onDownloaded={(fn) => showToast(`✅ Downloaded: ${fn}`, "ok")}
                  onDownloadFailed={(detail) =>
                    showToast(`Download failed. Check /public/attachments filenames. ${detail ? `(${detail})` : ""}`, "err")
                  }
                />
              ))}
            </div>
          </div>

          <div style={{ marginTop: 8, fontSize: 10.5, color: faintText }}>
            Files must be in <strong style={{ color: "#FFF" }}>public/attachments/</strong>. If a tile 404s, the filename in code must match
            the file in that folder exactly.
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 18, height: 1, background: "rgba(255,255,255,0.10)" }} />

        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
          }}
        >
          <img
            src="/branding/usaf_wings_transparent_refined.png"
            alt="USAF Wings"
            style={{ height: 34, width: "auto", opacity: 0.95 }}
          />
          <img
            src="/branding/us_air_force_text_transparent.png"
            alt="U.S. Air Force"
            style={{ height: 16, width: "auto", opacity: 0.9 }}
          />
        </div>

        <div style={{ textAlign: "center", marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
          PFRA Calculator • Unofficial member planning tool • Not affiliated with or endorsed by DoD or USAF • Powered by HMAN
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 18,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "10px 12px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.16)",
            background: toast.kind === "ok" ? "rgba(10, 122, 47, 0.92)" : "rgba(176, 0, 32, 0.92)",
            color: "#fff",
            fontWeight: 900,
            fontSize: 12,
            letterSpacing: 0.2,
            boxShadow: "0 12px 28px rgba(0,0,0,0.35)",
            zIndex: 9999,
            maxWidth: "92vw",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}