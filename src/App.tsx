import React, { useEffect, useMemo, useState } from "react";

import pushups from "./data/strength_pushups.json";
import hrpu from "./data/strength_hrpu.json";
import whtr from "./data/whtr.json";
import run2mile from "./data/cardio_2mile.json";
import hamr from "./data/cardio_hamr.json";
import situps from "./data/core_situps.json";
import reverseCrunch from "./data/core_reverse_crunch.json";
import plank from "./data/core_plank.json";

import type { Gender } from "./scoring/utils";
import {
  getAgeBand,
  isValidMMSS,
  lookupMaxTimePointsPFRA,
  lookupMinValuePointsPFRA,
  parseNumber,
  timeToSeconds,
} from "./scoring/utils";

import {
  lookupAFSPEC2MilePoints,
  lookupAFSPECHamrPoints,
  lookupAFSPECStrengthCorePoints,
} from "./data/afspec";

type StrengthTest = "pushups" | "hrpu";
type CoreTest = "situps" | "reverse_crunch" | "plank";
type CardioTest = "2mile" | "hamr";
type TestProgram = "PFRA" | "AFSPECWAR_EOD";
type WHtRUnit = "in" | "cm";

type PersistState = {
  program: TestProgram;
  age: string;
  gender: Gender;

  strengthTest: StrengthTest;
  coreTest: CoreTest;
  cardioTest: CardioTest;

  pushupReps: string;
  hrpuReps: string;

  situpReps: string;
  reverseCrunchReps: string;
  plankTime: string;

  run2MileTime: string;
  hamrShuttles: string;

  whtrUnit: WHtRUnit;
  height: string;
  waist: string;

  exemptWHtR: boolean;
  exemptStrength: boolean;
  exemptCore: boolean;
  exemptCardio: boolean;
  prorateExemptions: boolean;

  showResultsOnly: boolean;

  // New
  targetTotal: string;
};

const LS_KEY = "pfra_calculator_state_v2";

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

// Bulletproof download
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
  onDownloadFailed: () => void;
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
              .catch(() => onDownloadFailed());
          }}
        >
          Download
        </button>
      </div>
    </div>
  );
}

function safeLoad(): Partial<PersistState> | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? (obj as Partial<PersistState>) : null;
  } catch {
    return null;
  }
}

function safeSave(state: PersistState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function convertInCm(valueStr: string, from: WHtRUnit, to: WHtRUnit): string {
  const n = parseNumber(valueStr);
  if (n == null) return valueStr;
  if (from === to) return valueStr;
  const converted = from === "in" && to === "cm" ? n * 2.54 : n / 2.54;
  const rounded = Math.round(converted * 10) / 10;
  return String(rounded);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// PFRA "next tier" helpers
function getNextHigherMinRequirementPFRA(
  table: any,
  band: string,
  g: Gender,
  value: number
): { currentPoints: number; nextPoints: number; needValue: number } | null {
  const rows: [number, number][] | undefined = table.bands?.[band]?.[g];
  if (!rows?.length) return null;

  let currentPoints = 0;
  for (const [pts, minVal] of rows) {
    if (value >= minVal) {
      currentPoints = pts;
      break;
    }
  }
  for (const [pts, minVal] of rows) {
    if (pts > currentPoints) return { currentPoints, nextPoints: pts, needValue: minVal };
  }
  return null;
}

function getNextLowerTimeRequirementPFRA(
  table: any,
  band: string,
  g: Gender,
  timeSec: number
): { currentPoints: number; nextPoints: number; needTime: string } | null {
  const rows: [number, string][] | undefined = table.bands?.[band]?.[g];
  if (!rows?.length) return null;

  let currentPoints = 0;
  for (const [pts, maxTime] of rows) {
    const maxSec = timeToSeconds(maxTime);
    if (maxSec != null && timeSec <= maxSec) {
      currentPoints = pts;
      break;
    }
  }
  for (const [pts, maxTime] of rows) {
    if (pts > currentPoints) return { currentPoints, nextPoints: pts, needTime: maxTime };
  }
  return null;
}

export default function App() {
  // ---- hydrate defaults (from localStorage) ----
  const loaded = useMemo(() => (typeof window !== "undefined" ? safeLoad() : null), []);
  const initial: PersistState = {
    program: loaded?.program ?? "PFRA",
    age: loaded?.age ?? "",
    gender: loaded?.gender ?? "M",

    strengthTest: loaded?.strengthTest ?? "pushups",
    coreTest: loaded?.coreTest ?? "situps",
    cardioTest: loaded?.cardioTest ?? "2mile",

    pushupReps: loaded?.pushupReps ?? "",
    hrpuReps: loaded?.hrpuReps ?? "",

    situpReps: loaded?.situpReps ?? "",
    reverseCrunchReps: loaded?.reverseCrunchReps ?? "",
    plankTime: loaded?.plankTime ?? "",

    run2MileTime: loaded?.run2MileTime ?? "",
    hamrShuttles: loaded?.hamrShuttles ?? "",

    whtrUnit: loaded?.whtrUnit ?? "in",
    height: loaded?.height ?? "",
    waist: loaded?.waist ?? "",

    exemptWHtR: loaded?.exemptWHtR ?? false,
    exemptStrength: loaded?.exemptStrength ?? false,
    exemptCore: loaded?.exemptCore ?? false,
    exemptCardio: loaded?.exemptCardio ?? false,
    prorateExemptions: loaded?.prorateExemptions ?? true,

    showResultsOnly: loaded?.showResultsOnly ?? false,

    targetTotal: loaded?.targetTotal ?? "90",
  };

  // ----- State -----
  const [program, setProgram] = useState<TestProgram>(initial.program);

  const [age, setAge] = useState(initial.age);
  const [gender, setGender] = useState<Gender>(initial.gender);

  const [strengthTest, setStrengthTest] = useState<StrengthTest>(initial.strengthTest);
  const [coreTest, setCoreTest] = useState<CoreTest>(initial.coreTest);
  const [cardioTest, setCardioTest] = useState<CardioTest>(initial.cardioTest);

  const [pushupReps, setPushupReps] = useState(initial.pushupReps);
  const [hrpuReps, setHrpuReps] = useState(initial.hrpuReps);

  const [situpReps, setSitupReps] = useState(initial.situpReps);
  const [reverseCrunchReps, setReverseCrunchReps] = useState(initial.reverseCrunchReps);
  const [plankTime, setPlankTime] = useState(initial.plankTime);

  const [run2MileTime, setRun2MileTime] = useState(initial.run2MileTime);
  const [hamrShuttles, setHamrShuttles] = useState(initial.hamrShuttles);

  const [whtrUnit, setWhtrUnit] = useState<WHtRUnit>(initial.whtrUnit);
  const [height, setHeight] = useState(initial.height);
  const [waist, setWaist] = useState(initial.waist);

  const [exemptWHtR, setExemptWHtR] = useState(initial.exemptWHtR);
  const [exemptStrength, setExemptStrength] = useState(initial.exemptStrength);
  const [exemptCore, setExemptCore] = useState(initial.exemptCore);
  const [exemptCardio, setExemptCardio] = useState(initial.exemptCardio);
  const [prorateExemptions, setProrateExemptions] = useState(initial.prorateExemptions);

  const [showResultsOnly, setShowResultsOnly] = useState(initial.showResultsOnly);

  // New
  const [targetTotal, setTargetTotal] = useState(initial.targetTotal);

  // ----- Toast -----
  const [toast, setToast] = useState<{ message: string; kind: "ok" | "err" } | null>(null);
  function showToast(message: string, kind: "ok" | "err" = "ok") {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 2200);
  }

  // ----- Persist to localStorage (debounced) -----
  useEffect(() => {
    const state: PersistState = {
      program,
      age,
      gender,
      strengthTest,
      coreTest,
      cardioTest,
      pushupReps,
      hrpuReps,
      situpReps,
      reverseCrunchReps,
      plankTime,
      run2MileTime,
      hamrShuttles,
      whtrUnit,
      height,
      waist,
      exemptWHtR,
      exemptStrength,
      exemptCore,
      exemptCardio,
      prorateExemptions,
      showResultsOnly,
      targetTotal,
    };

    const t = window.setTimeout(() => safeSave(state), 200);
    return () => window.clearTimeout(t);
  }, [
    program,
    age,
    gender,
    strengthTest,
    coreTest,
    cardioTest,
    pushupReps,
    hrpuReps,
    situpReps,
    reverseCrunchReps,
    plankTime,
    run2MileTime,
    hamrShuttles,
    whtrUnit,
    height,
    waist,
    exemptWHtR,
    exemptStrength,
    exemptCore,
    exemptCardio,
    prorateExemptions,
    showResultsOnly,
    targetTotal,
  ]);

  // ----- Responsive -----
  const [vw, setVw] = useState<number>(() => (typeof window !== "undefined" ? window.innerWidth : 1200));
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const isNarrow = vw < 980;
  const isVeryNarrow = vw < 680;

  const isAFSPEC = program === "AFSPECWAR_EOD";

  // ----- Age Band -----
  const ageBand = useMemo(() => {
    const a = parseNumber(age);
    return a == null ? "Under 25" : getAgeBand(a);
  }, [age]);

  // ----- WHtR -----
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

  // ----- Scoring -----
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

  const showPlankHint = coreTest === "plank" && !isValidMMSS(plankTime);
  const showRunHint = cardioTest === "2mile" && !isValidMMSS(run2MileTime);

  // ----- Visual -----
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
    disabled ? { opacity: 0.55, filter: "grayscale(0.15)" } : {};

  function resetAll() {
    setProgram("PFRA");
    setAge("");
    setGender("M");

    setStrengthTest("pushups");
    setCoreTest("situps");
    setCardioTest("2mile");

    setPushupReps("");
    setHrpuReps("");

    setSitupReps("");
    setReverseCrunchReps("");
    setPlankTime("");

    setRun2MileTime("");
    setHamrShuttles("");

    setWhtrUnit("in");
    setHeight("");
    setWaist("");

    setExemptWHtR(false);
    setExemptStrength(false);
    setExemptCore(false);
    setExemptCardio(false);
    setProrateExemptions(true);

    setShowResultsOnly(false);

    setTargetTotal("90");

    showToast("✅ Reset complete", "ok");
  }

  function toggleWHtRUnit(next: WHtRUnit) {
    if (next === whtrUnit) return;
    setHeight((h) => convertInCm(h, whtrUnit, next));
    setWaist((w) => convertInCm(w, whtrUnit, next));
    setWhtrUnit(next);
  }

  function buildShareText() {
    const programLabel = isAFSPEC ? "AFSPECWAR / EOD" : "PFRA (Standard)";
    const bandLabel = isAFSPEC ? "N/A" : ageBand;
    const genderLabel = isAFSPEC ? "N/A" : gender === "M" ? "Male" : "Female";

    const strengthInput = exemptStrength
      ? "Exempt"
      : strengthTest === "pushups"
        ? `Push-ups: ${pushupReps || "—"}`
        : `HRPU: ${hrpuReps || "—"}`;

    const coreInput = exemptCore
      ? "Exempt"
      : coreTest === "situps"
        ? `Sit-ups: ${situpReps || "—"}`
        : coreTest === "reverse_crunch"
          ? `Reverse crunch: ${reverseCrunchReps || "—"}`
          : `Plank: ${plankTime || "—"}`;

    const cardioInput = exemptCardio
      ? "Exempt"
      : cardioTest === "2mile"
        ? `2-mile: ${run2MileTime || "—"}`
        : `HAMR: ${hamrShuttles || "—"}`;

    const whtrInput = exemptWHtR
      ? "Exempt"
      : `Height/Waist: ${height || "—"} ${whtrUnit} / ${waist || "—"} ${whtrUnit} (WHtR ${whtrData.rounded ?? "—"})`;

    return [
      "PFRA Calculator Result",
      `Program: ${programLabel}`,
      `Age Band: ${bandLabel}`,
      `Gender: ${genderLabel}`,
      "",
      `WHtR: ${whtrInput}  → ${earnedWHtR.toFixed(1)} pts`,
      `Strength: ${strengthInput}  → ${earnedStrength.toFixed(1)} pts`,
      `Core: ${coreInput}  → ${earnedCore.toFixed(1)} pts`,
      `Cardio: ${cardioInput}  → ${earnedCardio.toFixed(1)} pts`,
      "",
      `Total: ${total.toFixed(1)}  (${badge.label})`,
    ].join("\n");
  }

  async function copyResultsToClipboard() {
    try {
      await navigator.clipboard.writeText(buildShareText());
      showToast("✅ Copied results to clipboard", "ok");
    } catch {
      showToast("Copy failed (browser blocked).", "err");
    }
  }

  function printResults() {
    // Ensures results show up even if user isn't in Results mode
    setShowResultsOnly(true);
    window.setTimeout(() => window.print(), 50);
  }

  const projection = useMemo(() => {
    const t = parseNumber(targetTotal);
    const target = t == null ? 0 : clamp(t, 0, 100);
    const gap = Math.max(0, target - total);

    const suggestions: Array<{ label: string; gain: number; detail: string }> = [];

    // Strength
    if (!exemptStrength) {
      if (!isAFSPEC) {
        const val = parseNumber(strengthTest === "pushups" ? pushupReps : hrpuReps);
        if (val != null) {
          const table = strengthTest === "pushups" ? pushups : hrpu;
          const next = getNextHigherMinRequirementPFRA(table, ageBand, gender, val);
          if (next) {
            const gain = Math.max(0, next.nextPoints - next.currentPoints);
            suggestions.push({
              label: "Strength",
              gain,
              detail: `${strengthTest === "pushups" ? "Push-ups" : "HRPU"}: aim for ${next.needValue}+ reps (to reach ${next.nextPoints} pts).`,
            });
          }
        }
      } else {
        suggestions.push({
          label: "Strength",
          gain: 0,
          detail: "AFSPEC: next tier is the next universal threshold on the AFSPEC chart.",
        });
      }
    }

    // Core
    if (!exemptCore) {
      if (!isAFSPEC) {
        if (coreTest === "plank") {
          const sec = timeToSeconds(plankTime);
          if (sec != null) {
            const next = getNextHigherMinRequirementPFRA(plank, ageBand, gender, sec);
            if (next) {
              const gain = Math.max(0, next.nextPoints - next.currentPoints);
              suggestions.push({
                label: "Core",
                gain,
                detail: `Plank: hold at least ${next.needValue} sec (to reach ${next.nextPoints} pts).`,
              });
            }
          }
        } else {
          const val = parseNumber(coreTest === "situps" ? situpReps : reverseCrunchReps);
          if (val != null) {
            const table = coreTest === "situps" ? situps : reverseCrunch;
            const next = getNextHigherMinRequirementPFRA(table, ageBand, gender, val);
            if (next) {
              const gain = Math.max(0, next.nextPoints - next.currentPoints);
              suggestions.push({
                label: "Core",
                gain,
                detail: `${coreTest === "situps" ? "Sit-ups" : "Reverse crunch"}: aim for ${next.needValue}+ reps (to reach ${next.nextPoints} pts).`,
              });
            }
          }
        }
      } else {
        suggestions.push({
          label: "Core",
          gain: 0,
          detail: "AFSPEC: next tier is the next universal threshold on the AFSPEC chart.",
        });
      }
    }

    // Cardio
    if (!exemptCardio) {
      if (!isAFSPEC) {
        if (cardioTest === "2mile") {
          const sec = timeToSeconds(run2MileTime);
          if (sec != null) {
            const next = getNextLowerTimeRequirementPFRA(run2mile, ageBand, gender, sec);
            if (next) {
              const gain = Math.max(0, next.nextPoints - next.currentPoints);
              suggestions.push({
                label: "Cardio",
                gain,
                detail: `2-mile: run ${next.needTime} or faster (to reach ${next.nextPoints} pts).`,
              });
            }
          }
        } else {
          const sh = parseNumber(hamrShuttles);
          if (sh != null) {
            const next = getNextHigherMinRequirementPFRA(hamr, ageBand, gender, sh);
            if (next) {
              const gain = Math.max(0, next.nextPoints - next.currentPoints);
              suggestions.push({
                label: "Cardio",
                gain,
                detail: `HAMR: aim for ${next.needValue}+ shuttles (to reach ${next.nextPoints} pts).`,
              });
            }
          }
        }
      } else {
        suggestions.push({
          label: "Cardio",
          gain: 0,
          detail: "AFSPEC: next tier is the next universal threshold on the AFSPEC chart.",
        });
      }
    }

    const ranked = [...suggestions].sort((a, b) => (b.gain === a.gain ? a.label.localeCompare(b.label) : b.gain - a.gain));

    return { target, gap, ranked };
  }, [
    targetTotal,
    total,
    isAFSPEC,
    ageBand,
    gender,
    exemptStrength,
    exemptCore,
    exemptCardio,
    strengthTest,
    coreTest,
    cardioTest,
    pushupReps,
    hrpuReps,
    situpReps,
    reverseCrunchReps,
    plankTime,
    run2MileTime,
    hamrShuttles,
  ]);

  const pageWatermark = "/branding/usaf_wings_transparent_refined.png";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: pageBg,
        color: "#FFFFFF",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Watermark */}
      <div
        className="print-hide"
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          opacity: 0.05,
          filter: "grayscale(1)",
          transform: "translateY(-10px)",
          zIndex: 0,
        }}
      >
        <img
          src={pageWatermark}
          alt=""
          style={{
            width: "min(980px, 95vw)",
            height: "auto",
          }}
        />
      </div>

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

          /* FIX: dropdown option visibility (Windows/Edge) */
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

          /* PRINT */
          @media print {
            body {
              background: #ffffff !important;
              color: #000000 !important;
            }
            .print-hide { display: none !important; }
            .print-only { display: block !important; }
            * { box-shadow: none !important; text-shadow: none !important; backdrop-filter: none !important; }
          }
        `}
      </style>

      <div style={{ width: "100%", maxWidth: 1120, padding: 16, position: "relative", zIndex: 1 }}>
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
          className="print-hide"
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
            <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: 0.35 }}>PFRA Scoring Dashboard</div>
            <div style={{ fontSize: 12, color: faintText }}>WHtR 20 + Strength 15 + Core 15 + Cardio 50 = 100</div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "stretch", flexWrap: "wrap", justifyContent: isVeryNarrow ? "flex-start" : "flex-end" }}>
            {/* Program */}
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
                <select className="af-select" value={program} onChange={(e) => setProgram(e.target.value as TestProgram)} style={{ ...selectStyle, padding: "10px 12px" }}>
                  <option value="PFRA">PFRA (Standard)</option>
                  <option value="AFSPECWAR_EOD">AFSPECWAR / EOD</option>
                </select>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.62)" }}>
                {isAFSPEC ? "Universal AFSPECWAR/EOD chart (all ages/genders)" : "Age/gender-based PFRA charts"}
              </div>
            </div>

            {/* Status */}
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

            {/* Total + Controls */}
            <div
              style={{
                background: "rgba(0,0,0,0.22)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 14,
                padding: "10px 12px",
                minWidth: isVeryNarrow ? "100%" : 260,
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

              <div style={{ marginTop: 8, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                <button className="af-btn af-btn--sm" type="button" onClick={() => setShowResultsOnly((v) => !v)}>
                  {showResultsOnly ? "Show Inputs" : "Results View"}
                </button>
                <button className="af-btn af-btn--sm" type="button" onClick={copyResultsToClipboard}>
                  Copy Result
                </button>
                <button className="af-btn af-btn--sm" type="button" onClick={printResults}>
                  Print
                </button>
                <button className="af-btn af-btn--sm" type="button" onClick={resetAll}>
                  Reset
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* KPI Row */}
        <div className="print-hide" style={{ marginTop: 12, display: "grid", gridTemplateColumns: kpiCols, gap: 10 }}>
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
            <div style={{ fontSize: 12, color: faintText }}>{exemptStrength ? "Exempt" : strengthTest === "pushups" ? "Push-ups" : "HRPU"}</div>
          </div>
          <div style={kpiCardStyle}>
            <div style={kpiLabelStyle}>CORE</div>
            <div style={kpiValueStyle}>{earnedCore.toFixed(1)}</div>
            <div style={{ fontSize: 12, color: faintText }}>{exemptCore ? "Exempt" : coreTest === "situps" ? "Sit-ups" : coreTest === "reverse_crunch" ? "Reverse crunch" : "Plank"}</div>
          </div>
          <div style={kpiCardStyle}>
            <div style={kpiLabelStyle}>CARDIO</div>
            <div style={kpiValueStyle}>{earnedCardio.toFixed(1)}</div>
            <div style={{ fontSize: 12, color: faintText }}>{exemptCardio ? "Exempt" : cardioTest === "2mile" ? "2-mile run" : "HAMR"}</div>
          </div>
        </div>

        {showDiagnostic && (
          <div
            className="print-hide"
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
                  Band: <span style={{ color: "#FFF" }}>{ageBand}</span> · <span style={{ color: "#FFF" }}>{gender === "M" ? "Male" : "Female"}</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* RESULTS VIEW (screen) */}
        <div style={{ display: showResultsOnly ? "block" : "none" }}>
          <div style={{ marginTop: 12, ...cardStyle }}>
            <div style={sectionTitleStyle}>
              <span>Results</span>
              <span style={sectionTagStyle}>Print</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isVeryNarrow ? "1fr" : "1fr 1fr", gap: 10 }}>
              <div style={{ padding: 10, borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}>
                <div style={{ fontSize: 12, color: faintText, fontWeight: 900 }}>PROGRAM</div>
                <div style={{ fontSize: 16, fontWeight: 950, marginTop: 4 }}>{isAFSPEC ? "AFSPECWAR / EOD" : "PFRA (Standard)"}</div>
                <div style={{ marginTop: 8, fontSize: 12, color: faintText }}>
                  Age Band: <strong style={{ color: "#fff" }}>{isAFSPEC ? "N/A" : ageBand}</strong>
                  {!isAFSPEC && (
                    <>
                      {" "}
                      · Gender: <strong style={{ color: "#fff" }}>{gender === "M" ? "Male" : "Female"}</strong>
                    </>
                  )}
                </div>
              </div>

              <div style={{ padding: 10, borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}>
                <div style={{ fontSize: 12, color: faintText, fontWeight: 900 }}>STATUS</div>
                <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ background: badge.bg, color: badge.fg, borderRadius: 999, padding: "8px 12px", fontSize: 12, fontWeight: 950 }}>{badge.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 950 }}>Total: {total.toFixed(1)}</div>
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: faintText }}>
                  WHtR {earnedWHtR.toFixed(1)} · Strength {earnedStrength.toFixed(1)} · Core {earnedCore.toFixed(1)} · Cardio {earnedCardio.toFixed(1)}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 10, padding: 10, borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}>
              <div style={{ fontSize: 12, color: faintText, fontWeight: 900 }}>INPUTS USED</div>
              <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: isVeryNarrow ? "1fr" : "1fr 1fr", gap: 8, fontSize: 12, color: "rgba(255,255,255,0.86)" }}>
                <div>WHtR: {exemptWHtR ? "Exempt" : `${height || "—"} ${whtrUnit} / ${waist || "—"} ${whtrUnit} (rounded ${whtrData.rounded ?? "—"})`}</div>
                <div>Strength: {exemptStrength ? "Exempt" : `${strengthTest === "pushups" ? "Push-ups" : "HRPU"} = ${(strengthTest === "pushups" ? pushupReps : hrpuReps) || "—"}`}</div>
                <div>Core: {exemptCore ? "Exempt" : `${coreTest === "situps" ? "Sit-ups" : coreTest === "reverse_crunch" ? "Reverse crunch" : "Plank"} = ${(coreTest === "situps" ? situpReps : coreTest === "reverse_crunch" ? reverseCrunchReps : plankTime) || "—"}`}</div>
                <div>Cardio: {exemptCardio ? "Exempt" : `${cardioTest === "2mile" ? "2-mile" : "HAMR"} = ${(cardioTest === "2mile" ? run2MileTime : hamrShuttles) || "—"}`}</div>
              </div>
            </div>

            <div style={{ marginTop: 10, fontSize: 11, color: faintText }}>
              Tip: Use <strong style={{ color: "#FFF" }}>Print</strong> for an official-looking report page.
            </div>
          </div>
        </div>

        {/* RESULTS VIEW (print-only) - always included; printing hides inputs via CSS */}
        <div className="print-only" style={{ display: "none" }}>
          <div style={{ marginTop: 12, ...cardStyle, background: "#fff", color: "#000", border: "1px solid rgba(0,0,0,0.15)" }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>PFRA Calculator Report</div>
            <div style={{ marginTop: 6, fontSize: 12 }}>
              Program: <strong>{isAFSPEC ? "AFSPECWAR / EOD" : "PFRA (Standard)"}</strong> · Age Band: <strong>{isAFSPEC ? "N/A" : ageBand}</strong> · Gender:{" "}
              <strong>{isAFSPEC ? "N/A" : gender === "M" ? "Male" : "Female"}</strong>
            </div>
            <div style={{ marginTop: 10, fontSize: 12 }}>
              WHtR: <strong>{earnedWHtR.toFixed(1)}</strong> · Strength: <strong>{earnedStrength.toFixed(1)}</strong> · Core: <strong>{earnedCore.toFixed(1)}</strong> · Cardio:{" "}
              <strong>{earnedCardio.toFixed(1)}</strong>
            </div>
            <div style={{ marginTop: 10, fontSize: 14 }}>
              Total: <strong>{total.toFixed(1)}</strong> · Status: <strong>{badge.label}</strong>
            </div>
            <div style={{ marginTop: 10, fontSize: 11, opacity: 0.85 }}>
              Unofficial planning tool. Confirm program rules and exemptions with official guidance.
            </div>
          </div>
        </div>

        {/* INPUTS AREA */}
        <div className={showResultsOnly ? "print-hide" : "print-hide"}>
          {!showResultsOnly && (
            <>
              {/* Exemptions */}
              <div style={{ marginTop: 12, ...cardStyle }}>
                <div style={sectionTitleStyle}>
                  <span>Exemptions</span>
                  <span style={sectionTagStyle}>Adjustments</span>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                  <label
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
                    title="Uncommon: may apply in certain circumstances (e.g., pregnancy/abdominal surgery) per official guidance."
                  >
                    <input type="checkbox" checked={exemptWHtR} onChange={(e) => setExemptWHtR(e.target.checked)} style={{ transform: "scale(1.05)" }} />
                    Exempt: WHtR (0–20) <span style={{ opacity: 0.75 }}>(uncommon)</span>
                  </label>

                  {[
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
                  Note: Unofficial planning tool. Confirm eligibility and exemption rules with official guidance.
                </div>
              </div>

              {/* Separator */}
              <div style={{ marginTop: 14, height: 1, background: "rgba(255,255,255,0.10)" }} />

              {/* Main Grid */}
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: gridCols, gap: 10, alignItems: "stretch" }}>
                {/* Column 1 */}
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
                        <select className="af-select" value={gender} onChange={(e) => setGender(e.target.value as Gender)} style={selectStyle} disabled={isAFSPEC} title={isAFSPEC ? "AFSPECWAR/EOD chart is universal (gender not used)" : ""}>
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

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: faintText }}>
                        Use the <strong style={{ color: "#fff" }}>same unit</strong> for height + waist. Switching units will convert values.
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="af-btn af-btn--sm" type="button" onClick={() => toggleWHtRUnit("in")} disabled={exemptWHtR || whtrUnit === "in"}>
                          inches
                        </button>
                        <button className="af-btn af-btn--sm" type="button" onClick={() => toggleWHtRUnit("cm")} disabled={exemptWHtR || whtrUnit === "cm"}>
                          cm
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: isVeryNarrow ? "1fr" : "1fr 1fr", gap: 10 }}>
                      <div>
                        <div style={labelStyle}>Height ({whtrUnit})</div>
                        <input value={height} onChange={(e) => setHeight(e.target.value)} inputMode="decimal" placeholder={whtrUnit === "in" ? "e.g., 68" : "e.g., 173"} style={inputStyle} disabled={exemptWHtR} />
                      </div>
                      <div>
                        <div style={labelStyle}>Waist ({whtrUnit})</div>
                        <input value={waist} onChange={(e) => setWaist(e.target.value)} inputMode="decimal" placeholder={whtrUnit === "in" ? "e.g., 38" : "e.g., 97"} style={inputStyle} disabled={exemptWHtR} />
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: isVeryNarrow ? "1fr" : "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
                      <div style={{ fontSize: 12, color: faintText }}>
                        Raw: <strong style={{ color: "#FFF" }}>{exemptWHtR ? "—" : whtrData.raw == null ? "—" : whtrData.raw.toFixed(4)}</strong>
                      </div>
                      <div style={{ fontSize: 12, color: faintText }}>
                        Rounded: <strong style={{ color: "#FFF" }}>{exemptWHtR ? "—" : whtrData.rounded == null ? "—" : whtrData.rounded.toFixed(2)}</strong>
                      </div>
                      <div style={{ fontSize: 12, color: faintText }}>
                        Points: <strong style={{ color: "#FFF" }}>{earnedWHtR.toFixed(1)}</strong>
                      </div>
                    </div>

                    {exemptWHtR && (
                      <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.62)" }}>
                        WHtR exemption is uncommon (e.g., pregnancy/abdominal surgery). Ensure eligibility/documentation per official guidance.
                      </div>
                    )}
                  </div>
                </div>

                {/* Column 2 */}
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ ...cardStyle, ...disabledCard(exemptStrength) }}>
                    <div style={sectionTitleStyle}>
                      <span>Strength (0–15)</span>
                      <span style={sectionTagStyle}>Muscular</span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 10 }}>
                      <div>
                        <div style={labelStyle}>Test</div>
                        <select className="af-select" value={strengthTest} onChange={(e) => setStrengthTest(e.target.value as StrengthTest)} style={selectStyle} disabled={exemptStrength}>
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
                      {isAFSPEC && <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.62)" }}>AFSPECWAR/EOD: universal points scale (15.0 → 2.5).</div>}
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
                        <select className="af-select" value={coreTest} onChange={(e) => setCoreTest(e.target.value as CoreTest)} style={selectStyle} disabled={exemptCore}>
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
                      <div style={labelStyle}>{coreTest === "situps" ? "Sit-ups (reps)" : coreTest === "reverse_crunch" ? "Reverse crunch (reps)" : "Plank (mm:ss)"}</div>
                      <input
                        value={coreTest === "situps" ? situpReps : coreTest === "reverse_crunch" ? reverseCrunchReps : plankTime}
                        onChange={(e) =>
                          coreTest === "situps" ? setSitupReps(e.target.value) : coreTest === "reverse_crunch" ? setReverseCrunchReps(e.target.value) : setPlankTime(e.target.value)
                        }
                        inputMode={coreTest === "plank" ? "text" : "numeric"}
                        placeholder={coreTest === "plank" ? "e.g., 2:30" : "e.g., 45"}
                        style={inputStyle}
                        disabled={exemptCore}
                      />
                      {showPlankHint && (
                        <div style={{ marginTop: 8, fontSize: 11, color: "#FFD166" }}>
                          Format hint: use <strong style={{ color: "#fff" }}>mm:ss</strong> (example: <strong style={{ color: "#fff" }}>2:30</strong>)
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Column 3 */}
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ ...cardStyle, ...disabledCard(exemptCardio) }}>
                    <div style={sectionTitleStyle}>
                      <span>Cardio (0–50)</span>
                      <span style={sectionTagStyle}>Aerobic</span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 10 }}>
                      <div>
                        <div style={labelStyle}>Test</div>
                        <select className="af-select" value={cardioTest} onChange={(e) => setCardioTest(e.target.value as CardioTest)} style={selectStyle} disabled={exemptCardio}>
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
                      {showRunHint && (
                        <div style={{ marginTop: 8, fontSize: 11, color: "#FFD166" }}>
                          Format hint: use <strong style={{ color: "#fff" }}>mm:ss</strong> (example: <strong style={{ color: "#fff" }}>16:54</strong>)
                        </div>
                      )}
                      {isAFSPEC && <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.62)" }}>AFSPECWAR/EOD cardio uses the universal points scale (50.0 → 35.0).</div>}
                    </div>
                  </div>

                  {/* Breakdown */}
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

                      <div style={{ borderTop: "1px solid rgba(255,255,255,0.10)", marginTop: 6, paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontWeight: 950 }}>Total</span>
                        <span style={{ fontWeight: 950, fontSize: 18 }}>{total.toFixed(1)}</span>
                      </div>

                      <div style={{ fontSize: 11, color: faintText, marginTop: 6 }}>
                        Tip: Use <strong style={{ color: "#FFF" }}>Tab</strong> to move between fields quickly.
                      </div>
                    </div>
                  </div>

                  {/* Projected Score */}
                  <div style={cardStyle}>
                    <div style={sectionTitleStyle}>
                      <span>Projected Score</span>
                      <span style={sectionTagStyle}>Target</span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <div style={labelStyle}>Target Total (0–100)</div>
                        <input value={targetTotal} onChange={(e) => setTargetTotal(e.target.value)} inputMode="decimal" placeholder="e.g., 90" style={inputStyle} />
                      </div>

                      <div>
                        <div style={labelStyle}>Gap</div>
                        <div style={{ fontSize: 26, fontWeight: 950, paddingTop: 4 }}>{projection.gap.toFixed(1)}</div>
                        <div style={{ fontSize: 11, color: faintText }}>Points needed to reach your target.</div>
                      </div>
                    </div>

                    <div style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,0.88)" }}>
                      {projection.gap <= 0.01 ? (
                        <div>✅ You’re at/above target.</div>
                      ) : (
                        <>
                          <div style={{ fontSize: 11, color: faintText, marginBottom: 6 }}>
                            Next-tier suggestions (based on your selected events and current inputs):
                          </div>
                          {projection.ranked.length === 0 ? (
                            <div style={{ color: faintText }}>Enter your current inputs to get suggestions.</div>
                          ) : (
                            <ul style={{ margin: "8px 0 0 18px", color: "rgba(255,255,255,0.86)" }}>
                              {projection.ranked.slice(0, 4).map((s, i) => (
                                <li key={`${s.label}-${i}`} style={{ marginBottom: 6 }}>
                                  <strong style={{ color: "#fff" }}>{s.label}:</strong> {s.detail}
                                  {s.gain > 0 ? <span style={{ color: "rgba(255,255,255,0.75)" }}> (+{s.gain.toFixed(1)} pts)</span> : null}
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Downloads */}
              <div style={{ marginTop: 18, height: 1, background: "rgba(255,255,255,0.10)" }} />

              <div style={{ ...cardStyle, marginTop: 12, padding: 12, background: "rgba(8, 18, 38, 0.62)", border: "1px solid rgba(255,255,255,0.10)" }}>
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
                    <AttachmentTile
                      title="Warfighter’s Fitness Playbook"
                      subtitle="2.0 • Feb 2026"
                      url="/attachments/Warfighters_Fitness_Playbook_2.0_Feb_2026.pdf"
                      filename="Warfighters_Fitness_Playbook_2.0_Feb_2026.pdf"
                      isVeryNarrow={isVeryNarrow}
                      onDownloaded={(fn) => showToast(`✅ Downloaded: ${fn}`, "ok")}
                      onDownloadFailed={() => showToast("Download failed. Please try again.", "err")}
                    />

                    <AttachmentTile
                      title="PFRA Scoring Charts"
                      subtitle="Includes AFSPECWAR/EOD page"
                      url="/attachments/PFRA_Scoring_Charts.pdf"
                      filename="PFRA_Scoring_Charts.pdf"
                      isVeryNarrow={isVeryNarrow}
                      onDownloaded={(fn) => showToast(`✅ Downloaded: ${fn}`, "ok")}
                      onDownloadFailed={() => showToast("Download failed. Please try again.", "err")}
                    />

                    <AttachmentTile
                      title="DAFMAN 36-2905 IC"
                      subtitle="22 Jan 2026"
                      url="/attachments/DAFMAN_36-2905_IC_22_Jan_2026.pdf"
                      filename="DAFMAN_36-2905_IC_22_Jan_2026.pdf"
                      isVeryNarrow={isVeryNarrow}
                      onDownloaded={(fn) => showToast(`✅ Downloaded: ${fn}`, "ok")}
                      onDownloadFailed={() => showToast("Download failed. Please try again.", "err")}
                    />
                  </div>
                </div>

                <div style={{ marginTop: 8, fontSize: 10.5, color: faintText }}>
                  Files must be in <strong style={{ color: "#FFF" }}>public/attachments/</strong>.
                </div>
              </div>

              {/* Footer */}
              <div style={{ marginTop: 18, height: 1, background: "rgba(255,255,255,0.10)" }} />

              <div style={{ marginTop: 12, paddingTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
                <img src="/branding/usaf_wings_transparent_refined.png" alt="USAF Wings" style={{ height: 34, width: "auto", opacity: 0.95 }} />
                <img src="/branding/us_air_force_text_transparent.png" alt="U.S. Air Force" style={{ height: 16, width: "auto", opacity: 0.9 }} />
              </div>

              <div style={{ textAlign: "center", marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                PFRA Calculator • Unofficial member planning tool • Not affiliated with or endorsed by DoD or USAF • Powered by HMAN
              </div>
            </>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="print-hide"
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