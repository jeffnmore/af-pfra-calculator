import React, { useEffect, useMemo, useRef, useState } from "react";

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

type MetaOptions = {
  name?: string;
  property?: string;
  content: string;
};

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

function performanceBand(pct: number): { bg: string; fg: string; border: string } {
  if (pct >= 90) return { bg: "rgba(10,122,47,0.92)", fg: "#FFFFFF", border: "rgba(10,122,47,1)" };
  if (pct >= 80) return { bg: "rgba(242,194,0,0.92)", fg: "#111111", border: "rgba(242,194,0,1)" };
  if (pct >= 75) return { bg: "rgba(255,165,0,0.92)", fg: "#111111", border: "rgba(255,165,0,1)" };
  return { bg: "rgba(176,0,32,0.92)", fg: "#FFFFFF", border: "rgba(176,0,32,1)" };
}

function compositeCategory(total: number): "Unsatisfactory" | "Satisfactory" | "Excellent" {
  if (total >= 90) return "Excellent";
  if (total >= 75) return "Satisfactory";
  return "Unsatisfactory";
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function isDiagnosticWindow(): boolean {
  const now = new Date();
  const cutoff = new Date(2026, 6, 1, 0, 0, 0, 0);
  return now < cutoff;
}

function upsertMetaTag({ name, property, content }: MetaOptions) {
  if (typeof document === "undefined") return;

  const selector = name ? `meta[name="${name}"]` : `meta[property="${property}"]`;
  let tag = document.head.querySelector(selector) as HTMLMetaElement | null;

  if (!tag) {
    tag = document.createElement("meta");
    if (name) tag.setAttribute("name", name);
    if (property) tag.setAttribute("property", property);
    document.head.appendChild(tag);
  }

  tag.setAttribute("content", content);
}

function upsertLinkTag(rel: string, href: string) {
  if (typeof document === "undefined") return;
  let tag = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!tag) {
    tag = document.createElement("link");
    tag.setAttribute("rel", rel);
    document.head.appendChild(tag);
  }
  tag.setAttribute("href", href);
}

function upsertJsonLd(id: string, data: Record<string, unknown>) {
  if (typeof document === "undefined") return;
  let tag = document.getElementById(id) as HTMLScriptElement | null;
  if (!tag) {
    tag = document.createElement("script");
    tag.type = "application/ld+json";
    tag.id = id;
    document.head.appendChild(tag);
  }
  tag.text = JSON.stringify(data);
}

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
        padding: 12,
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.03)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minHeight: 96,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontWeight: 950, letterSpacing: 0.2, fontSize: 13, lineHeight: 1.2 }}>{title}</div>
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

const AFSPEC_STRENGTH_CORE: Array<{
  pts: number;
  pushups: number;
  hrpu: number;
  situps: number;
  revCrunch: number;
  plankMin: string;
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

const AFSPEC_CARDIO: Array<{ pts: number; runMax: string; hamrMin: number }> = [
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
  const APP_VERSION = "1.2.0";
  const APP_UPDATED = "2026-03-07";
  const SITE_URL = "https://usafpfracalculator.com";
  const PAGE_TITLE = "USAF PFRA Calculator | Air Force PT Score";
  const META_DESCRIPTION =
    "Calculate USAF PFRA scores for waist-to-height ratio, strength, core, cardio, HAMR, and 2-mile run with AFSPECWAR/EOD support.";
  const META_KEYWORDS = [
    "USAF PFRA calculator",
    "Air Force fitness calculator",
    "Air Force PT test",
    "Air Force PT test calculator",
    "Air Force fitness assessment",
    "Air Force fitness assessment calculator",
    "AFPT",
    "AFPT calculator",
    "USAF PT",
    "USAF PT test",
    "USAF FA test",
    "USAF FA calculator",
    "PFRA score calculator",
    "USAF fitness test score",
    "Air Force readiness test calculator",
    "AFSPECWAR EOD calculator",
    "AFSPECWAR fitness test",
    "EOD fitness test",
    "2 mile run calculator",
    "HAMR calculator",
    "waist to height ratio calculator",
    "hand release push ups calculator",
  ].join(", ");

  const ATTACHMENTS = [
    { title: "Warfighter’s Fitness Playbook", subtitle: "2.0 • Feb 2026", url: "/attachments/Playbook.pdf", filename: "Playbook.pdf" },
    {
      title: "PFRA Scoring Charts",
      subtitle: "Includes AFSPECWAR/EOD page",
      url: "/attachments/PFRA_Scoring_Charts.pdf",
      filename: "PFRA_Scoring_Charts.pdf",
    },
    { title: "DAFMAN 36-2905 IC", subtitle: "22 Jan 2026", url: "/attachments/DAFMAN.pdf", filename: "DAFMAN.pdf" },
  ] as const;

  const [program, setProgram] = useState<TestProgram>("PFRA");
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

  const [exemptWHtR, setExemptWHtR] = useState(false);
  const [exemptStrength, setExemptStrength] = useState(false);
  const [exemptCore, setExemptCore] = useState(false);
  const [exemptCardio, setExemptCardio] = useState(false);

  const [toast, setToast] = useState<{ message: string; kind: "ok" | "err" } | null>(null);
  function showToast(message: string, kind: "ok" | "err" = "ok") {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 2600);
  }

  const [vw, setVw] = useState<number>(() => (typeof window !== "undefined" ? window.innerWidth : 1200));
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isNarrow = vw < 980;
  const isVeryNarrow = vw < 680;
  const [mobileMode, setMobileMode] = useState<boolean>(() => (typeof window !== "undefined" ? window.innerWidth < 680 : false));

  useEffect(() => {
    if (vw < 680) setMobileMode(true);
  }, [vw]);

  const [showOverview, setShowOverview] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [showMobileTicker, setShowMobileTicker] = useState(false);

  const introRef = useRef<HTMLElement | null>(null);
  const calculatorRef = useRef<HTMLElement | null>(null);
  const downloadsRef = useRef<HTMLElement | null>(null);
  const supportRef = useRef<HTMLElement | null>(null);

  function scrollToRef(ref: React.RefObject<HTMLElement | null>) {
    const el = ref.current;
    if (!el) return;
    const y = el.getBoundingClientRect().top + (window.pageYOffset || window.scrollY || 0) - 12;
    window.scrollTo({ top: y, behavior: "smooth" });
  }

  useEffect(() => {
    if (!mobileMode) {
      setShowMobileTicker(false);
      return;
    }

    const updateTickerVisibility = () => {
      const y = Math.max(window.scrollY || 0, window.pageYOffset || 0, document.documentElement.scrollTop || 0);
      setShowMobileTicker((prev) => {
        if (y <= 2) return false;
        return prev || y > 24;
      });
    };

    updateTickerVisibility();
    window.addEventListener("scroll", updateTickerVisibility, { passive: true });
    window.addEventListener("resize", updateTickerVisibility);
    window.addEventListener("focusin", updateTickerVisibility);

    return () => {
      window.removeEventListener("scroll", updateTickerVisibility);
      window.removeEventListener("resize", updateTickerVisibility);
      window.removeEventListener("focusin", updateTickerVisibility);
    };
  }, [mobileMode]);

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

  const maxWHtR = 20;
  const maxStrength = 15;
  const maxCore = 15;
  const maxCardio = 50;

  const earnedWHtR = exemptWHtR ? 0 : whtrPoints;
  const earnedStrength = strengthPoints;
  const earnedCore = corePoints;
  const earnedCardio = cardioPoints;

  const earnedTotal = useMemo(() => earnedWHtR + earnedStrength + earnedCore + earnedCardio, [earnedWHtR, earnedStrength, earnedCore, earnedCardio]);

  const availableMax = useMemo(() => {
    let m = 0;
    if (!exemptWHtR) m += maxWHtR;
    if (!exemptStrength) m += maxStrength;
    if (!exemptCore) m += maxCore;
    if (!exemptCardio) m += maxCardio;
    return m;
  }, [exemptWHtR, exemptStrength, exemptCore, exemptCardio]);

  const total = useMemo(() => (availableMax <= 0 ? 0 : (earnedTotal / availableMax) * 100), [earnedTotal, availableMax]);
  const showDiagnostic = isDiagnosticWindow();
  const compositeText = compositeCategory(total);
  const whtrPct = exemptWHtR ? null : (earnedWHtR / maxWHtR) * 100;
  const strengthPct = exemptStrength ? null : (earnedStrength / maxStrength) * 100;
  const corePct = exemptCore ? null : (earnedCore / maxCore) * 100;
  const cardioPct = exemptCardio ? null : (earnedCardio / maxCardio) * 100;
  const whtrBand = whtrPct == null ? null : performanceBand(whtrPct);
  const strengthBand = strengthPct == null ? null : performanceBand(strengthPct);
  const coreBand = corePct == null ? null : performanceBand(corePct);
  const cardioBand = cardioPct == null ? null : performanceBand(cardioPct);
  const compositeBand = performanceBand(total);
  const CASH_APP_URL = "https://cash.app/$YourCashtag";
  const VENMO_URL = "https://account.venmo.com/u/Fingers-HMAN";

  useEffect(() => {
    document.title = PAGE_TITLE;
    document.documentElement.lang = "en";

    upsertMetaTag({ name: "description", content: META_DESCRIPTION });
    upsertMetaTag({ name: "keywords", content: META_KEYWORDS });
    upsertMetaTag({ name: "robots", content: "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" });
    upsertMetaTag({ name: "theme-color", content: "#041A3A" });
    upsertMetaTag({ name: "application-name", content: "USAF PFRA Calculator" });
    upsertMetaTag({ name: "apple-mobile-web-app-title", content: "USAF PFRA Calculator" });
    upsertMetaTag({ property: "og:type", content: "website" });
    upsertMetaTag({ property: "og:title", content: PAGE_TITLE });
    upsertMetaTag({ property: "og:description", content: META_DESCRIPTION });
    upsertMetaTag({ property: "og:url", content: SITE_URL });
    upsertMetaTag({ property: "og:site_name", content: "USAF PFRA Calculator" });
    upsertMetaTag({ name: "twitter:card", content: "summary_large_image" });
    upsertMetaTag({ name: "twitter:title", content: PAGE_TITLE });
    upsertMetaTag({ name: "twitter:description", content: META_DESCRIPTION });
    upsertLinkTag("canonical", SITE_URL);

    upsertJsonLd("pfra-webapp-schema", {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "USAF PFRA Calculator",
      alternateName: [
        "Air Force fitness calculator",
        "Air Force PT test calculator",
        "AFPT calculator",
        "USAF PT calculator",
        "USAF FA test calculator",
      ],
      url: SITE_URL,
      applicationCategory: "HealthApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires JavaScript",
      description: META_DESCRIPTION,
      keywords: META_KEYWORDS,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      featureList: [
        "PFRA score calculator",
        "Air Force PT test calculator",
        "Air Force fitness assessment calculator",
        "AFSPECWAR/EOD score calculator",
        "Waist-to-height ratio scoring",
        "Push-ups and hand-release push-ups scoring",
        "Sit-ups, reverse crunch, and plank scoring",
        "2-mile run and HAMR scoring",
        "Prorated exemption support",
      ],
    });

    upsertJsonLd("pfra-webpage-schema", {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: PAGE_TITLE,
      url: SITE_URL,
      description: META_DESCRIPTION,
      about: [
        "USAF PFRA calculator",
        "Air Force PT test",
        "AFPT",
        "USAF PT",
        "Air Force fitness assessment",
        "USAF FA test",
        "AFSPECWAR fitness test",
        "EOD fitness test",
        "HAMR",
        "2-mile run",
      ],
      mainEntity: {
        "@type": "SoftwareApplication",
        name: "USAF PFRA Calculator",
        applicationCategory: "HealthApplication",
        operatingSystem: "Any",
      },
    });
  }, [META_DESCRIPTION, META_KEYWORDS, PAGE_TITLE, SITE_URL]);

  const pageBg = "#041A3A";
  const panelBg = "rgba(8, 18, 38, 0.76)";
  const panelBorder = "1px solid rgba(255,255,255,0.12)";
  const subtleText = "rgba(255,255,255,0.82)";
  const faintText = "rgba(255,255,255,0.62)";
  const accent = "#6EC1FF";

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: mobileMode ? "10px 11px" : "11px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.20)",
    outline: "none",
    fontSize: 14,
    background: "rgba(255,255,255,0.06)",
    color: "#FFFFFF",
  };

  const selectStyle: React.CSSProperties = { ...inputStyle };

  const cardStyle: React.CSSProperties = {
    background: panelBg,
    borderRadius: 14,
    padding: mobileMode ? 12 : 14,
    border: panelBorder,
    boxShadow: "0 10px 26px rgba(0,0,0,0.22)",
    backdropFilter: "blur(6px)",
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontWeight: 950,
    marginBottom: 10,
    color: "#FFFFFF",
    letterSpacing: 0.2,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  };

  const sectionTagStyle: React.CSSProperties = {
    fontSize: 10.5,
    fontWeight: 900,
    color: "rgba(255,255,255,0.70)",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.05)",
    padding: "3px 8px",
    borderRadius: 999,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 850,
    marginBottom: 6,
    color: subtleText,
  };

  const gridCols = mobileMode ? "1fr" : isNarrow ? "1fr 1fr" : "repeat(5, minmax(0, 1fr))";
  const mainCols = mobileMode ? "1fr" : isNarrow ? "1fr 1fr" : "1.15fr 1fr 1fr";



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
      <style>{`
        .af-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.94);
          font-weight: 900;
          letter-spacing: 0.2px;
          cursor: pointer;
          text-decoration: none;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        .af-btn:hover { background: rgba(255,255,255,0.10); }
        .af-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .af-btn--sm { padding: 8px 10px; border-radius: 10px; font-size: 12px; }
        .af-btn--pill { padding: 8px 10px; border-radius: 999px; font-size: 12px; }
        .af-select { color: #fff; background: rgba(255,255,255,0.06); }
        .af-select option { color: #fff; background: #061a39; }
        .af-section-anchor { scroll-margin-top: 16px; }
      `}</style>

      {mobileMode && showMobileTicker && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 9998,
            background: "rgba(4, 26, 58, 0.97)",
            borderBottom: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 10px 24px rgba(0,0,0,0.30)",
            padding: "calc(env(safe-area-inset-top, 0px) + 10px) 10px 8px",
            backdropFilter: "blur(8px)",
            boxSizing: "border-box",
          }}
        >
          <div style={{ maxWidth: 1160, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6 }}>
            {[
              { label: "WHtR", value: exemptWHtR ? "Exempt" : earnedWHtR.toFixed(1) },
              { label: "Str", value: exemptStrength ? "Exempt" : earnedStrength.toFixed(1) },
              { label: "Core", value: exemptCore ? "Exempt" : earnedCore.toFixed(1) },
              { label: "Cardio", value: exemptCardio ? "Exempt" : earnedCardio.toFixed(1) },
              { label: "Comp", value: total.toFixed(1) },
            ].map((item) => (
              <div key={item.label} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "8px 6px", textAlign: "center" }}>
                <div style={{ fontSize: 10.5, fontWeight: 900, color: faintText }}>{item.label}</div>
                <div style={{ fontSize: 15, fontWeight: 950, lineHeight: 1.1 }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <main
        style={{
          width: "100%",
          maxWidth: 1160,
          margin: "0 auto",
          paddingTop: mobileMode ? (showMobileTicker ? 76 : 12) : 16,
          paddingRight: mobileMode ? 12 : 16,
          paddingBottom: mobileMode ? 12 : 16,
          paddingLeft: mobileMode ? 12 : 16,
          boxSizing: "border-box",
        }}
      >

        <div
          style={{
            height: 4,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${accent} 0%, rgba(110,193,255,0.25) 55%, rgba(110,193,255,0.00) 100%)`,
            marginBottom: 12,
          }}
        />

        <header ref={introRef} className="af-section-anchor" style={{ ...cardStyle, background: "rgba(0,0,0,0.18)" }}>
          <div style={{ display: "grid", gridTemplateColumns: mobileMode ? "1fr" : "1.12fr 0.88fr", gap: 14, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.15, color: "rgba(255,255,255,0.72)" }}>USAF FITNESS</div>
              <h1 style={{ margin: "6px 0 8px", fontSize: mobileMode ? 28 : 34, lineHeight: 1.06 }}>USAF PFRA Calculator</h1>
              <p style={{ margin: 0, color: subtleText, lineHeight: 1.55, fontSize: 15 }}>
                Free Air Force fitness test calculator for PFRA scoring, AFSPECWAR/EOD standards, waist-to-height ratio,
                push-ups, hand-release push-ups, sit-ups, reverse crunch, plank, 2-mile run, and HAMR scoring.
              </p>
              <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button className="af-btn af-btn--pill" type="button" onClick={() => scrollToRef(downloadsRef)}>
                  View Official Guidance
                </button>
                <button className="af-btn af-btn--pill" type="button" onClick={() => scrollToRef(supportRef)}>
                  Support / Feedback
                </button>
              </div>
            </div>

            <aside style={{ ...cardStyle, padding: 12 }} aria-label="Version information">
              <div style={{ display: "grid", gap: 8, fontSize: 13.5, color: subtleText }}>
                <div>Version {APP_VERSION}</div>
                <div>Updated {APP_UPDATED}</div>
              </div>
            </aside>
          </div>
        </header>

        {showDiagnostic && (
          <section style={{ marginTop: 12, ...cardStyle }} aria-label="Diagnostic notice">
            <div style={{ fontWeight: 950, fontSize: 13.5 }}>Diagnostic window notice</div>
            <div style={{ marginTop: 6, color: faintText, fontSize: 12.5 }}>
              Active until <strong style={{ color: "#fff" }}>1 Jul 2026</strong>. Continue verifying official scoring,
              exemptions, and unit policy.
            </div>
          </section>
        )}

        <section ref={calculatorRef} className="af-section-anchor" style={{ marginTop: 12, ...cardStyle }} aria-labelledby="calculator-heading">
          <div style={sectionTitleStyle}>
            <h2 id="calculator-heading" style={{ margin: 0, fontSize: 20 }}>Air Force Fitness Score Calculator</h2>
            <span style={sectionTagStyle}>Calculator</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: mainCols, gap: 12 }}>
            <div style={{ display: "grid", gap: 12 }}>
              <section style={cardStyle} aria-labelledby="program-profile-heading">
                <div style={sectionTitleStyle}>
                  <h3 id="program-profile-heading" style={{ margin: 0, fontSize: 16 }}>Program & profile</h3>
                  <span style={sectionTagStyle}>Inputs</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: mobileMode ? "1fr" : "1fr 1fr", gap: 10 }}>
                  <div>
                    <div style={labelStyle}>Test program</div>
                    <select className="af-select" value={program} onChange={(e) => setProgram(e.target.value as TestProgram)} style={selectStyle}>
                      <option value="PFRA">PFRA (Standard)</option>
                      <option value="AFSPECWAR_EOD">AFSPECWAR / EOD</option>
                    </select>
                    <div style={{ marginTop: 8, fontSize: 11, color: faintText }}>
                      {isAFSPEC ? "Universal AFSPECWAR/EOD chart for all ages and genders" : "Age and gender based PFRA scoring"}
                    </div>
                  </div>

                  <div>
                    <div style={labelStyle}>Exact age</div>
                    <input value={age} onChange={(e) => setAge(e.target.value)} inputMode="numeric" placeholder="e.g., 27" style={inputStyle} />
                    <div style={{ marginTop: 8, fontSize: 11, color: faintText }}>
                      Age band: <strong style={{ color: "#fff" }}>{ageBand}</strong>
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
                    >
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                    </select>
                    {isAFSPEC && <div style={{ marginTop: 8, fontSize: 11, color: faintText }}>Not used for the universal AFSPECWAR/EOD chart</div>}
                  </div>

                  <div>
                    <div style={labelStyle}>Mobile layout</div>
                    <button className="af-btn" type="button" onClick={() => setMobileMode((v) => !v)} style={{ width: "100%" }}>
                      {mobileMode ? "Mobile Mode: ON" : "Mobile Mode: OFF"}
                    </button>
                  </div>
                </div>
              </section>

              <section style={{ ...cardStyle, opacity: exemptWHtR ? 0.65 : 1 }} aria-labelledby="whtr-heading">
                <div style={sectionTitleStyle}>
                  <h3 id="whtr-heading" style={{ margin: 0, fontSize: 16 }}>Waist-to-height ratio (0–20)</h3>
                  <span style={sectionTagStyle}>Body comp</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: mobileMode ? "1fr" : "1fr 1fr", gap: 10 }}>
                  <div>
                    <div style={labelStyle}>Height</div>
                    <input value={height} onChange={(e) => setHeight(e.target.value)} inputMode="decimal" placeholder="e.g., 68" style={inputStyle} disabled={exemptWHtR} />
                  </div>
                  <div>
                    <div style={labelStyle}>Waist</div>
                    <input value={waist} onChange={(e) => setWaist(e.target.value)} inputMode="decimal" placeholder="e.g., 38" style={inputStyle} disabled={exemptWHtR} />
                  </div>
                </div>
                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: mobileMode ? "1fr" : "repeat(3, 1fr)", gap: 8, fontSize: 12, color: faintText }}>
                  <div>Raw: <strong style={{ color: "#fff" }}>{whtrData.raw == null || exemptWHtR ? "—" : whtrData.raw.toFixed(4)}</strong></div>
                  <div>Rounded: <strong style={{ color: "#fff" }}>{whtrData.rounded == null || exemptWHtR ? "—" : whtrData.rounded.toFixed(2)}</strong></div>
                  <div>Points: <strong style={{ color: "#fff" }}>{earnedWHtR.toFixed(1)}</strong></div>
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: faintText }}>Use the same unit for height and waist.</div>
              </section>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <section style={{ ...cardStyle, opacity: exemptStrength ? 0.65 : 1 }} aria-labelledby="strength-heading">
                <div style={sectionTitleStyle}>
                  <h3 id="strength-heading" style={{ margin: 0, fontSize: 16 }}>Strength (0–15)</h3>
                  <span style={sectionTagStyle}>Muscular</span>
                </div>
                <div>
                  <div style={labelStyle}>Test</div>
                  <select className="af-select" value={strengthTest} onChange={(e) => setStrengthTest(e.target.value as StrengthTest)} style={selectStyle} disabled={exemptStrength}>
                    <option value="pushups">Push-ups</option>
                    <option value="hrpu">Hand-release push-ups</option>
                  </select>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={labelStyle}>{strengthTest === "pushups" ? "Push-ups (reps)" : "Hand-release push-ups (reps)"}</div>
                  <input
                    value={strengthTest === "pushups" ? pushupReps : hrpuReps}
                    onChange={(e) => (strengthTest === "pushups" ? setPushupReps(e.target.value) : setHrpuReps(e.target.value))}
                    inputMode="numeric"
                    placeholder="e.g., 45"
                    style={inputStyle}
                    disabled={exemptStrength}
                  />
                </div>
                <div style={{ marginTop: 10, fontSize: 13, color: subtleText }}>Points: <strong style={{ color: "#fff" }}>{earnedStrength.toFixed(1)}</strong></div>
              </section>

              <section style={{ ...cardStyle, opacity: exemptCore ? 0.65 : 1 }} aria-labelledby="core-heading">
                <div style={sectionTitleStyle}>
                  <h3 id="core-heading" style={{ margin: 0, fontSize: 16 }}>Core (0–15)</h3>
                  <span style={sectionTagStyle}>Stability</span>
                </div>
                <div>
                  <div style={labelStyle}>Test</div>
                  <select className="af-select" value={coreTest} onChange={(e) => setCoreTest(e.target.value as CoreTest)} style={selectStyle} disabled={exemptCore}>
                    <option value="situps">Sit-ups</option>
                    <option value="reverse_crunch">Cross-leg reverse crunch</option>
                    <option value="plank">Forearm plank (mm:ss)</option>
                  </select>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={labelStyle}>{coreTest === "situps" ? "Sit-ups (reps)" : coreTest === "reverse_crunch" ? "Reverse crunch (reps)" : "Plank (mm:ss)"}</div>
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
                </div>
                <div style={{ marginTop: 10, fontSize: 13, color: subtleText }}>Points: <strong style={{ color: "#fff" }}>{earnedCore.toFixed(1)}</strong></div>
              </section>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <section style={{ ...cardStyle, opacity: exemptCardio ? 0.65 : 1 }} aria-labelledby="cardio-heading">
                <div style={sectionTitleStyle}>
                  <h3 id="cardio-heading" style={{ margin: 0, fontSize: 16 }}>Cardio (0–50)</h3>
                  <span style={sectionTagStyle}>Aerobic</span>
                </div>
                <div>
                  <div style={labelStyle}>Test</div>
                  <select className="af-select" value={cardioTest} onChange={(e) => setCardioTest(e.target.value as CardioTest)} style={selectStyle} disabled={exemptCardio}>
                    <option value="2mile">2-mile run (mm:ss)</option>
                    <option value="hamr">20m HAMR (shuttles)</option>
                  </select>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={labelStyle}>{cardioTest === "2mile" ? "2-mile time (mm:ss)" : "HAMR shuttles (count)"}</div>
                  <input
                    value={cardioTest === "2mile" ? run2MileTime : hamrShuttles}
                    onChange={(e) => (cardioTest === "2mile" ? setRun2MileTime(e.target.value) : setHamrShuttles(e.target.value))}
                    inputMode={cardioTest === "2mile" ? "text" : "numeric"}
                    placeholder={cardioTest === "2mile" ? "e.g., 16:54" : "e.g., 60"}
                    style={inputStyle}
                    disabled={exemptCardio}
                  />
                </div>
                <div style={{ marginTop: 10, fontSize: 13, color: subtleText }}>Points: <strong style={{ color: "#fff" }}>{earnedCardio.toFixed(1)}</strong></div>
              </section>
            </div>
          </div>

          <section style={{ marginTop: 12, ...cardStyle }} aria-labelledby="exemptions-heading">
            <div style={sectionTitleStyle}>
              <h3 id="exemptions-heading" style={{ margin: 0, fontSize: 16 }}>Exemptions</h3>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
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
                  }}
                >
                  <input type="checkbox" checked={x.v} onChange={(e) => x.set(e.target.checked)} />
                  Exempt: {x.label}
                </label>
              ))}
            </div>
          </section>

          <section style={{ marginTop: 12 }} aria-labelledby="scores-heading">
            <div style={sectionTitleStyle}>
              <h3 id="scores-heading" style={{ margin: 0, fontSize: 18 }}>Current scores</h3>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 10 }}>
              {[
                {
                  label: "WHtR",
                  points: exemptWHtR ? "Exempt" : earnedWHtR.toFixed(1),
                  pct: whtrPct,
                  sub: exemptWHtR ? "Exempt" : whtrData.rounded == null ? "Enter height and waist" : `Rounded ${whtrData.rounded.toFixed(2)}`,
                  band: whtrBand,
                },
                {
                  label: "Strength",
                  points: exemptStrength ? "Exempt" : earnedStrength.toFixed(1),
                  pct: strengthPct,
                  sub: exemptStrength ? "Exempt" : strengthTest === "pushups" ? "Push-ups" : "HRPU",
                  band: strengthBand,
                },
                {
                  label: "Core",
                  points: exemptCore ? "Exempt" : earnedCore.toFixed(1),
                  pct: corePct,
                  sub: exemptCore ? "Exempt" : coreTest === "situps" ? "Sit-ups" : coreTest === "reverse_crunch" ? "Reverse crunch" : "Plank",
                  band: coreBand,
                },
                {
                  label: "Cardio",
                  points: exemptCardio ? "Exempt" : earnedCardio.toFixed(1),
                  pct: cardioPct,
                  sub: exemptCardio ? "Exempt" : cardioTest === "2mile" ? "2-mile run" : "HAMR",
                  band: cardioBand,
                },
              ].map((card) => (
                <div
                  key={card.label}
                  style={{
                    ...cardStyle,
                    background: card.band ? card.band.bg : "rgba(255,255,255,0.04)",
                    color: card.band ? card.band.fg : "#FFFFFF",
                    border: `1px solid ${card.band ? card.band.border : "rgba(255,255,255,0.12)"}`,
                    minHeight: 110,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.5, opacity: 0.88 }}>{card.label}</div>
                  <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 28, fontWeight: 950, lineHeight: 1 }}>{card.points}</div>
                    {card.pct != null ? <div style={{ fontSize: 15, fontWeight: 900 }}>{formatPct(card.pct)}</div> : null}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12.5, opacity: 0.92 }}>{card.sub}</div>
                </div>
              ))}

              <div
                style={{
                  ...cardStyle,
                  background: compositeBand.bg,
                  color: compositeBand.fg,
                  border: `1px solid ${compositeBand.border}`,
                  minHeight: 110,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.5, opacity: 0.88 }}>Composite</div>
                <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 30, fontWeight: 950, lineHeight: 1 }}>{total.toFixed(1)}</div>
                  <div style={{ fontSize: 15, fontWeight: 900 }}>{formatPct(total)}</div>
                </div>
                <div style={{ marginTop: 10, fontSize: 17, fontWeight: 950 }}>{compositeText}</div>
                <div style={{ marginTop: 6, fontSize: 12.5, opacity: 0.92 }}>Based on available components{availableMax < 100 ? ` • max ${availableMax.toFixed(0)}` : ""}</div>
              </div>
            </div>
          </section>
        </section>

        <section ref={downloadsRef} className="af-section-anchor" style={{ marginTop: 12, ...cardStyle }} aria-labelledby="downloads-heading">
          <div style={sectionTitleStyle}>
            <h2 id="downloads-heading" style={{ margin: 0, fontSize: 20 }}>Official guidance</h2>
            <span style={sectionTagStyle}>PDF</span>
          </div>
          <p style={{ marginTop: 0, marginBottom: 12, color: faintText, lineHeight: 1.55 }}>
            These reference files help users confirm scoring details against official source documents.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: isVeryNarrow ? "1fr" : isNarrow ? "1fr 1fr" : "repeat(3, minmax(220px, 1fr))", gap: 10 }}>
            {ATTACHMENTS.map((a) => (
              <AttachmentTile
                key={a.url}
                title={a.title}
                subtitle={a.subtitle}
                url={a.url}
                filename={a.filename}
                isVeryNarrow={isVeryNarrow}
                onDownloaded={(fn) => showToast(`✅ Downloaded: ${fn}`, "ok")}
                onDownloadFailed={(detail) => showToast(`Download failed. ${detail ? `(${detail})` : ""}`, "err")}
              />
            ))}
          </div>
        </section>

        <section style={{ marginTop: 12, ...cardStyle }} aria-labelledby="about-heading">
          <div style={sectionTitleStyle}>
            <h2 id="about-heading" style={{ margin: 0, fontSize: 20 }}>Overview</h2>
            <button className="af-btn af-btn--sm" type="button" onClick={() => setShowOverview((v) => !v)}>
              {showOverview ? "Hide" : "Show"}
            </button>
          </div>
          {showOverview && (
            <div style={{ display: "grid", gap: 10, color: subtleText, lineHeight: 1.6, fontSize: 14 }}>
              <p style={{ margin: 0 }}>
                This USAF PFRA calculator is built to help Airmen, candidates, and anyone searching for an Air Force PT score
                estimate quickly calculate waist-to-height ratio, strength, core, cardio, and composite performance in one place.
                It supports standard PFRA scoring as well as the AFSPECWAR / EOD option.
              </p>
              <p style={{ margin: 0 }}>
                The calculator supports waist-to-height ratio scoring, push-ups, hand-release push-ups, sit-ups, cross-leg reverse
                crunch, plank, 2-mile run, and HAMR scoring. It is designed for users who may also search for an Air Force PT test,
                AFPT, USAF PT, Air Force fitness assessment, or USAF FA test calculator.
              </p>
              <p style={{ margin: 0 }}>
                Official guidance links are included above so results can be compared directly with the source documents.
              </p>
            </div>
          )}
        </section>

        <section ref={supportRef} className="af-section-anchor" style={{ marginTop: 12, ...cardStyle }} aria-labelledby="support-heading">
          <div style={sectionTitleStyle}>
            <h2 id="support-heading" style={{ margin: 0, fontSize: 20 }}>Feedback and support</h2>
          </div>
          <p style={{ marginTop: 0, color: subtleText, lineHeight: 1.6 }}>
            This calculator took significant time to build, test, and maintain. The goal is to keep it free and useful. If it
            helped you, feedback and support are appreciated.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <a className="af-btn" href="mailto:jeffnmore@hotmail.com?subject=PFRA%20Calculator%20Feedback">Feedback</a>
            <button className="af-btn" type="button" onClick={() => setShowSupport((v) => !v)}>Buy me a coffee</button>
            <button className="af-btn" type="button" onClick={() => setShowSupport((v) => !v)}>Buy me a beer</button>
          </div>

          {showSupport && (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <div style={{ color: faintText, fontSize: 13.5 }}>
                Choose a payment option below. Replace the Cash App cashtag link in the code if needed.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <a className="af-btn" href={VENMO_URL} target="_blank" rel="noreferrer">Venmo</a>
                <a className="af-btn" href={CASH_APP_URL} target="_blank" rel="noreferrer">Cash App</a>
              </div>
            </div>
          )}
        </section>

        <footer style={{ marginTop: 14, paddingTop: 10, textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, flexWrap: "wrap" }}>
            <img src="/branding/usaf_wings_transparent_refined.png" alt="U.S. Air Force wings graphic" style={{ height: 34, width: "auto", opacity: 0.95 }} />
            <img src="/branding/us_air_force_text_transparent.png" alt="U.S. Air Force text logo" style={{ height: 15, width: "auto", opacity: 0.9 }} />
          </div>
          <div style={{ marginTop: 8, fontSize: 11.5, color: "rgba(255,255,255,0.60)" }}>PFRA Calculator • Powered by Fingers</div>
          <div style={{ marginTop: 6, fontSize: 10.8, color: "rgba(255,255,255,0.60)", lineHeight: 1.45 }}>
            Always verify scoring, exemptions, and program requirements against current official guidance and local unit policy.
          </div>
        </footer>

        <noscript>
          <div style={{ marginTop: 12, color: "#fff" }}>
            JavaScript is required for the interactive Air Force PFRA calculator, but the page still describes PFRA scoring,
            AFSPECWAR/EOD scoring, and the linked reference PDFs.
          </div>
        </noscript>
      </main>

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


