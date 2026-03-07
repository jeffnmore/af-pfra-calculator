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

function scoreBucket(score: number): { bg: string; fg: string } {
  if (score < 75) return { bg: "#a61b1b", fg: "#ffffff" };
  if (score < 80) return { bg: "#d97a00", fg: "#ffffff" };
  if (score < 90) return { bg: "#d6b000", fg: "#111111" };
  return { bg: "#157a2c", fg: "#ffffff" };
}

function percentOf(points: number, max: number, exempt: boolean): number | null {
  if (exempt) return null;
  if (max <= 0) return 0;
  return (points / max) * 100;
}

function fmtPercent(value: number | null): string {
  if (value == null) return "Exempt";
  return `${value.toFixed(1)}%`;
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

function QrImage(props: { title: string; candidates: string[] }) {
  const { title, candidates } = props;
  const [idx, setIdx] = useState(0);
  const src = candidates[idx];
  const hasSrc = idx < candidates.length;

  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 14,
        background: "rgba(255,255,255,0.04)",
        padding: 14,
        display: "grid",
        gap: 10,
        justifyItems: "center",
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 14 }}>{title}</div>
      {hasSrc ? (
        <img
          src={src}
          alt={`${title} QR code`}
          onError={() => setIdx((v) => v + 1)}
          style={{ width: "100%", maxWidth: 220, aspectRatio: "1 / 1", objectFit: "contain", background: "#fff", borderRadius: 12, padding: 10 }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            maxWidth: 220,
            aspectRatio: "1 / 1",
            background: "rgba(255,255,255,0.03)",
            border: "1px dashed rgba(255,255,255,0.22)",
            borderRadius: 12,
            display: "grid",
            placeItems: "center",
            textAlign: "center",
            fontSize: 12,
            color: "rgba(255,255,255,0.7)",
            padding: 14,
          }}
        >
          QR image not found. Put the image in /public/branding or /public/attachments.
        </div>
      )}
    </div>
  );
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
        padding: 14,
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.04)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minHeight: 96,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontWeight: 900, fontSize: 14, lineHeight: 1.25 }}>{title}</div>
        {subtitle ? <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>{subtitle}</div> : null}
      </div>
      <div style={{ marginTop: "auto", display: "grid", gridTemplateColumns: isVeryNarrow ? "1fr" : "1fr 1fr", gap: 8 }}>
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

function MetricCard(props: {
  title: string;
  value: string;
  subValue: string;
  bucketScore: number;
}) {
  const { title, value, subValue, bucketScore } = props;
  const bucket = scoreBucket(bucketScore);
  return (
    <div
      style={{
        background: bucket.bg,
        color: bucket.fg,
        borderRadius: 16,
        padding: 14,
        minHeight: 96,
        display: "grid",
        gap: 6,
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 10px 24px rgba(0,0,0,0.22)",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.9, letterSpacing: 0.4 }}>{title}</div>
      <div style={{ fontSize: 26, fontWeight: 950, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12.5, fontWeight: 800, opacity: 0.95 }}>{subValue}</div>
    </div>
  );
}

export default function App() {
  const APP_VERSION = "1.3.0";
  const APP_UPDATED = "2026-03-07";
  const SITE_URL = "https://usafpfracalculator.com";
  const PAGE_TITLE = "USAF PFRA Calculator | Air Force PT Test, AFPT & Fitness Assessment Score Calculator";
  const META_DESCRIPTION =
    "Free USAF PFRA calculator for Air Force PT test and fitness assessment scoring. Estimate AFPT and USAF FA test points for waist-to-height ratio, push-ups, hand-release push-ups, sit-ups, reverse crunch, plank, 2-mile run, HAMR, PFRA totals, and AFSPECWAR/EOD scores.";
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
    { title: "PFRA Scoring Charts", subtitle: "Includes AFSPECWAR/EOD page", url: "/attachments/PFRA_Scoring_Charts.pdf", filename: "PFRA_Scoring_Charts.pdf" },
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

  const [showOverview, setShowOverview] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [toast, setToast] = useState<{ message: string; kind: "ok" | "err" } | null>(null);
  const [vw, setVw] = useState<number>(() => (typeof window !== "undefined" ? window.innerWidth : 1200));
  const [showTicker, setShowTicker] = useState(false);

  function showToastMessage(message: string, kind: "ok" | "err" = "ok") {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 2600);
  }

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    const onScroll = () => setShowTicker(window.scrollY > 110);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    onResize();
    onScroll();
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const isNarrow = vw < 980;
  const isVeryNarrow = vw < 680;
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
  }, [ageBand, exemptStrength, gender, hrpuReps, isAFSPEC, pushupReps, strengthTest]);

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
  }, [ageBand, coreTest, exemptCore, gender, isAFSPEC, plankTime, reverseCrunchReps, situpReps]);

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
  }, [ageBand, cardioTest, exemptCardio, gender, hamrShuttles, isAFSPEC, run2MileTime]);

  const maxWHtR = 20;
  const maxStrength = 15;
  const maxCore = 15;
  const maxCardio = 50;

  const earnedWHtR = exemptWHtR ? 0 : whtrPoints;
  const earnedStrength = strengthPoints;
  const earnedCore = corePoints;
  const earnedCardio = cardioPoints;
  const earnedTotal = earnedWHtR + earnedStrength + earnedCore + earnedCardio;
  const availableMax = (exemptWHtR ? 0 : maxWHtR) + (exemptStrength ? 0 : maxStrength) + (exemptCore ? 0 : maxCore) + (exemptCardio ? 0 : maxCardio);
  const totalPercent = availableMax > 0 ? (earnedTotal / availableMax) * 100 : 0;

  const whtrPercent = percentOf(earnedWHtR, maxWHtR, exemptWHtR);
  const strengthPercent = percentOf(earnedStrength, maxStrength, exemptStrength);
  const corePercent = percentOf(earnedCore, maxCore, exemptCore);
  const cardioPercent = percentOf(earnedCardio, maxCardio, exemptCardio);

  useEffect(() => {
    document.title = PAGE_TITLE;
    document.documentElement.lang = "en";
    upsertMetaTag({ name: "description", content: META_DESCRIPTION });
    upsertMetaTag({ name: "keywords", content: META_KEYWORDS });
    upsertMetaTag({ name: "robots", content: "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" });
    upsertMetaTag({ name: "theme-color", content: "#041A3A" });
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
      alternateName: ["Air Force PT test calculator", "AFPT calculator", "USAF FA test calculator"],
      url: SITE_URL,
      applicationCategory: "HealthApplication",
      operatingSystem: "Any",
      description: META_DESCRIPTION,
      keywords: META_KEYWORDS,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    });
  }, [META_DESCRIPTION, META_KEYWORDS, PAGE_TITLE, SITE_URL]);

  const pageBg = "#041A3A";
  const panelBg = "rgba(8, 18, 38, 0.80)";
  const panelBorder = "1px solid rgba(255,255,255,0.12)";
  const subtleText = "rgba(255,255,255,0.82)";
  const faintText = "rgba(255,255,255,0.62)";

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "11px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.18)",
    outline: "none",
    fontSize: 14,
    background: "rgba(255,255,255,0.06)",
    color: "#FFFFFF",
  };

  const selectStyle: React.CSSProperties = { ...inputStyle };

  const cardStyle: React.CSSProperties = {
    background: panelBg,
    borderRadius: 16,
    padding: isVeryNarrow ? 12 : 14,
    border: panelBorder,
    boxShadow: "0 10px 26px rgba(0,0,0,0.22)",
    backdropFilter: "blur(6px)",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 850,
    marginBottom: 6,
    color: subtleText,
  };

  const summaryGrid = isVeryNarrow ? "1fr 1fr" : isNarrow ? "repeat(3, 1fr)" : "repeat(5, minmax(0, 1fr))";
  const mainCols = isVeryNarrow ? "1fr" : isNarrow ? "1fr 1fr" : "1.12fr 1fr 1fr";

  const supportText =
    "This calculator took substantial time to build, test, revise, and maintain. I plan to keep it free for Airmen and anyone who needs it. If it saved you time or helped you prepare, you can support future updates below.";

  return (
    <div style={{ minHeight: "100vh", background: pageBg, color: "#FFFFFF" }}>
      <style>{`
        * { box-sizing: border-box; }
        .af-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.95);
          font-weight: 900;
          letter-spacing: 0.2px;
          cursor: pointer;
          text-decoration: none;
        }
        .af-btn:hover { background: rgba(255,255,255,0.11); }
        .af-btn--sm { padding: 8px 10px; border-radius: 10px; font-size: 12px; }
        .af-select option { color: #fff; background: #061a39; }
      `}</style>

      {isVeryNarrow && showTicker && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 4000,
            background: "rgba(4, 26, 58, 0.97)",
            borderBottom: "1px solid rgba(255,255,255,0.14)",
            boxShadow: "0 10px 24px rgba(0,0,0,0.34)",
            paddingTop: "max(8px, env(safe-area-inset-top))",
          }}
        >
          <div style={{ maxWidth: 1160, margin: "0 auto", padding: "10px 10px 12px" }}>
            <div style={{ fontSize: 18, fontWeight: 950, lineHeight: 1.05, marginBottom: 8 }}>USAF PFRA Calculator</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6 }}>
              {[
                { label: "WHtR", value: earnedWHtR.toFixed(1), pct: fmtPercent(whtrPercent), bucket: whtrPercent ?? 100 },
                { label: "STR", value: earnedStrength.toFixed(1), pct: fmtPercent(strengthPercent), bucket: strengthPercent ?? 100 },
                { label: "CORE", value: earnedCore.toFixed(1), pct: fmtPercent(corePercent), bucket: corePercent ?? 100 },
                { label: "CARD", value: earnedCardio.toFixed(1), pct: fmtPercent(cardioPercent), bucket: cardioPercent ?? 100 },
                { label: "COMP", value: totalPercent.toFixed(1), pct: `${earnedTotal.toFixed(1)} pts`, bucket: totalPercent },
              ].map((item) => {
                const bucket = scoreBucket(item.bucket);
                return (
                  <div key={item.label} style={{ background: bucket.bg, color: bucket.fg, borderRadius: 12, padding: "8px 6px", textAlign: "center" }}>
                    <div style={{ fontSize: 10, fontWeight: 900 }}>{item.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 950, lineHeight: 1.1 }}>{item.value}</div>
                    <div style={{ fontSize: 9.5, fontWeight: 800 }}>{item.pct}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <main style={{ width: "100%", maxWidth: 1160, margin: "0 auto", padding: isVeryNarrow ? "12px" : "16px", paddingTop: isVeryNarrow && showTicker ? 118 : undefined }}>
        <header style={{ ...cardStyle, background: "rgba(0,0,0,0.18)" }}>
          <div style={{ display: "grid", gridTemplateColumns: isVeryNarrow ? "1fr" : "1.2fr 0.8fr", gap: 14, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.1, color: faintText }}>USAF FITNESS</div>
              <h1 style={{ margin: "6px 0 8px", fontSize: isVeryNarrow ? 30 : 36, lineHeight: 1.04 }}>USAF PFRA Calculator</h1>
              <p style={{ margin: 0, color: subtleText, lineHeight: 1.55, fontSize: 15 }}>
                Free Air Force fitness calculator for PFRA scoring, waist-to-height ratio, push-ups, hand-release push-ups,
                sit-ups, reverse crunch, plank, 2-mile run, HAMR, and AFSPECWAR / EOD scoring.
              </p>
              <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                <a className="af-btn" href="mailto:jeffnmore@hotmail.com?subject=PFRA%20Calculator%20Feedback&body=Question%20or%20feedback%20for%20the%20USAF%20PFRA%20Calculator:%0D%0A%0D%0A">
                  Feedback
                </a>
                <button className="af-btn" type="button" onClick={() => setShowOverview((v) => !v)}>
                  {showOverview ? "Hide Overview" : "Overview"}
                </button>
                <button className="af-btn" type="button" onClick={() => setShowSupport(true)}>
                  Support This Free App
                </button>
              </div>
            </div>

            <div style={{ ...cardStyle, background: "rgba(255,255,255,0.04)" }}>
              <div style={{ display: "grid", gap: 8, fontSize: 13.5, color: subtleText }}>
                <div>WHtR 20 + Strength 15 + Core 15 + Cardio 50 = 100</div>
                <div>{isAFSPEC ? "Universal AFSPECWAR / EOD chart" : "PFRA scoring by age and gender"}</div>
                <div>Version {APP_VERSION} • Updated {APP_UPDATED}</div>
              </div>
            </div>
          </div>
        </header>

        <section style={{ marginTop: 12, display: "grid", gridTemplateColumns: summaryGrid, gap: 10 }}>
          <MetricCard title="WHtR" value={earnedWHtR.toFixed(1)} subValue={`${fmtPercent(whtrPercent)}${exemptWHtR ? "" : ` • ${earnedWHtR.toFixed(1)}/${maxWHtR}`}`} bucketScore={whtrPercent ?? 100} />
          <MetricCard title="Strength" value={earnedStrength.toFixed(1)} subValue={`${fmtPercent(strengthPercent)}${exemptStrength ? "" : ` • ${earnedStrength.toFixed(1)}/${maxStrength}`}`} bucketScore={strengthPercent ?? 100} />
          <MetricCard title="Core" value={earnedCore.toFixed(1)} subValue={`${fmtPercent(corePercent)}${exemptCore ? "" : ` • ${earnedCore.toFixed(1)}/${maxCore}`}`} bucketScore={corePercent ?? 100} />
          <MetricCard title="Cardio" value={earnedCardio.toFixed(1)} subValue={`${fmtPercent(cardioPercent)}${exemptCardio ? "" : ` • ${earnedCardio.toFixed(1)}/${maxCardio}`}`} bucketScore={cardioPercent ?? 100} />
          <MetricCard title="Composite" value={totalPercent.toFixed(1)} subValue={`${earnedTotal.toFixed(1)} pts • ${availableMax.toFixed(0)} max`} bucketScore={totalPercent} />
        </section>

        <section style={{ marginTop: 12, ...cardStyle }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 22 }}>Air Force Fitness Score Calculator</h2>
          <div style={{ display: "grid", gridTemplateColumns: mainCols, gap: 12 }}>
            <div style={{ display: "grid", gap: 12 }}>
              <section style={cardStyle}>
                <h3 style={{ margin: "0 0 10px", fontSize: 17 }}>Program and profile</h3>
                <div style={{ display: "grid", gridTemplateColumns: isVeryNarrow ? "1fr" : "1fr 1fr", gap: 10 }}>
                  <div>
                    <div style={labelStyle}>Test program</div>
                    <select className="af-select" value={program} onChange={(e) => setProgram(e.target.value as TestProgram)} style={selectStyle}>
                      <option value="PFRA">PFRA (Standard)</option>
                      <option value="AFSPECWAR_EOD">AFSPECWAR / EOD</option>
                    </select>
                  </div>
                  <div>
                    <div style={labelStyle}>Exact age</div>
                    <input value={age} onChange={(e) => setAge(e.target.value)} inputMode="numeric" placeholder="e.g., 27" style={inputStyle} />
                  </div>
                  <div>
                    <div style={labelStyle}>Gender</div>
                    <select className="af-select" value={gender} onChange={(e) => setGender(e.target.value as Gender)} style={selectStyle} disabled={isAFSPEC}>
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                    </select>
                  </div>
                  <div>
                    <div style={labelStyle}>Age band</div>
                    <div style={{ ...inputStyle, display: "flex", alignItems: "center", minHeight: 45 }}>{ageBand}</div>
                  </div>
                </div>
              </section>

              <section style={{ ...cardStyle, opacity: exemptWHtR ? 0.7 : 1 }}>
                <h3 style={{ margin: "0 0 10px", fontSize: 17 }}>Waist-to-height ratio (0–20)</h3>
                <div style={{ display: "grid", gridTemplateColumns: isVeryNarrow ? "1fr" : "1fr 1fr", gap: 10 }}>
                  <div>
                    <div style={labelStyle}>Height</div>
                    <input value={height} onChange={(e) => setHeight(e.target.value)} inputMode="decimal" placeholder="e.g., 68" style={inputStyle} disabled={exemptWHtR} />
                  </div>
                  <div>
                    <div style={labelStyle}>Waist</div>
                    <input value={waist} onChange={(e) => setWaist(e.target.value)} inputMode="decimal" placeholder="e.g., 38" style={inputStyle} disabled={exemptWHtR} />
                  </div>
                </div>
                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: isVeryNarrow ? "1fr" : "repeat(4, 1fr)", gap: 8, fontSize: 12.5, color: faintText }}>
                  <div>Raw: <strong style={{ color: "#fff" }}>{whtrData.raw == null || exemptWHtR ? "—" : whtrData.raw.toFixed(4)}</strong></div>
                  <div>Rounded: <strong style={{ color: "#fff" }}>{whtrData.rounded == null || exemptWHtR ? "—" : whtrData.rounded.toFixed(2)}</strong></div>
                  <div>Points: <strong style={{ color: "#fff" }}>{earnedWHtR.toFixed(1)}</strong></div>
                  <div>Percent: <strong style={{ color: "#fff" }}>{fmtPercent(whtrPercent)}</strong></div>
                </div>
                <div style={{ marginTop: 8, fontSize: 11.5, color: faintText }}>Use the same unit for height and waist.</div>
              </section>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <section style={{ ...cardStyle, opacity: exemptStrength ? 0.7 : 1 }}>
                <h3 style={{ margin: "0 0 10px", fontSize: 17 }}>Strength (0–15)</h3>
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
                <div style={{ marginTop: 10, color: subtleText, fontSize: 13.5 }}>
                  Points: <strong style={{ color: "#fff" }}>{earnedStrength.toFixed(1)}</strong> • {fmtPercent(strengthPercent)}
                </div>
              </section>

              <section style={{ ...cardStyle, opacity: exemptCore ? 0.7 : 1 }}>
                <h3 style={{ margin: "0 0 10px", fontSize: 17 }}>Core (0–15)</h3>
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
                <div style={{ marginTop: 10, color: subtleText, fontSize: 13.5 }}>
                  Points: <strong style={{ color: "#fff" }}>{earnedCore.toFixed(1)}</strong> • {fmtPercent(corePercent)}
                </div>
              </section>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <section style={{ ...cardStyle, opacity: exemptCardio ? 0.7 : 1 }}>
                <h3 style={{ margin: "0 0 10px", fontSize: 17 }}>Cardio (0–50)</h3>
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
                <div style={{ marginTop: 10, color: subtleText, fontSize: 13.5 }}>
                  Points: <strong style={{ color: "#fff" }}>{earnedCardio.toFixed(1)}</strong> • {fmtPercent(cardioPercent)}
                </div>
              </section>

              <section style={cardStyle}>
                <h3 style={{ margin: "0 0 10px", fontSize: 17 }}>Exemptions</h3>
                <div style={{ display: "grid", gap: 8 }}>
                  {[
                    { label: "WHtR (0–20)", v: exemptWHtR, set: setExemptWHtR },
                    { label: "Strength (0–15)", v: exemptStrength, set: setExemptStrength },
                    { label: "Core (0–15)", v: exemptCore, set: setExemptCore },
                    { label: "Cardio (0–50)", v: exemptCardio, set: setExemptCardio },
                  ].map((x) => (
                    <label key={x.label} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: subtleText }}>
                      <input type="checkbox" checked={x.v} onChange={(e) => x.set(e.target.checked)} />
                      Exempt: {x.label}
                    </label>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </section>

        <section style={{ marginTop: 12, ...cardStyle }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 20 }}>Official references</h2>
          <div style={{ display: "grid", gridTemplateColumns: isVeryNarrow ? "1fr" : isNarrow ? "1fr 1fr" : "repeat(3, minmax(220px, 1fr))", gap: 10 }}>
            {ATTACHMENTS.map((a) => (
              <AttachmentTile
                key={a.url}
                title={a.title}
                subtitle={a.subtitle}
                url={a.url}
                filename={a.filename}
                isVeryNarrow={isVeryNarrow}
                onDownloaded={(fn) => showToastMessage(`Downloaded: ${fn}`, "ok")}
                onDownloadFailed={(detail) => showToastMessage(`Download failed${detail ? ` (${detail})` : ""}`, "err")}
              />
            ))}
          </div>
        </section>

        <section style={{ marginTop: 12, ...cardStyle }}>
          <button className="af-btn" type="button" onClick={() => setShowOverview((v) => !v)}>
            {showOverview ? "Hide Overview" : "Overview"}
          </button>
          {showOverview && (
            <div style={{ marginTop: 12, display: "grid", gap: 10, color: subtleText, lineHeight: 1.65, fontSize: 14 }}>
              <p style={{ margin: 0 }}>
                This calculator is designed for people searching for a <strong style={{ color: "#fff" }}>USAF PFRA calculator</strong>,
                <strong style={{ color: "#fff" }}> Air Force fitness calculator</strong>, <strong style={{ color: "#fff" }}>Air Force PT test calculator</strong>,
                <strong style={{ color: "#fff" }}> AFPT calculator</strong>, <strong style={{ color: "#fff" }}>USAF PT calculator</strong>, or
                <strong style={{ color: "#fff" }}> USAF FA test calculator</strong>. It estimates points for waist-to-height ratio, strength,
                core, cardio, prorated exemptions, and total composite score.
              </p>
              <p style={{ margin: 0 }}>
                It also supports <strong style={{ color: "#fff" }}>AFSPECWAR / EOD scoring</strong> using the universal chart, which makes it useful for users comparing
                PFRA scoring charts, AFSPECWAR fitness test standards, EOD fitness test references, 2-mile run scoring, and HAMR shuttle scoring in one place.
              </p>
              <p style={{ margin: 0 }}>
                The calculator is meant to be a fast estimate tool. Official reference documents are included above so users can compare calculator results with source guidance quickly.
              </p>
            </div>
          )}
        </section>

        <section style={{ marginTop: 12, ...cardStyle }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 20 }}>Support this free calculator</h2>
          <p style={{ margin: "0 0 12px", color: subtleText, lineHeight: 1.6 }}>{supportText}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button className="af-btn" type="button" onClick={() => setShowSupport(true)}>Buy me a coffee</button>
            <button className="af-btn" type="button" onClick={() => setShowSupport(true)}>Buy me a beer</button>
            <a className="af-btn" href="mailto:jeffnmore@hotmail.com?subject=PFRA%20Calculator%20Feedback&body=Question%20or%20feedback%20for%20the%20USAF%20PFRA%20Calculator:%0D%0A%0D%0A">Feedback</a>
          </div>
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

      {showSupport && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.62)",
            zIndex: 5000,
            display: "grid",
            placeItems: "center",
            padding: 14,
          }}
          onClick={() => setShowSupport(false)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 760,
              borderRadius: 18,
              background: "#082245",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 20px 40px rgba(0,0,0,0.35)",
              padding: 16,
              display: "grid",
              gap: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 950 }}>Support this free calculator</div>
                <div style={{ marginTop: 4, color: subtleText, lineHeight: 1.5 }}>{supportText}</div>
              </div>
              <button className="af-btn af-btn--sm" type="button" onClick={() => setShowSupport(false)}>Close</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isVeryNarrow ? "1fr" : "1fr 1fr", gap: 12 }}>
              <QrImage title="Cash App" candidates={[
                "/branding/cashapp-qr.jpg",
                "/branding/cash-app-qr.jpg",
                "/branding/cashapp.jpg",
                "/attachments/cashapp-qr.jpg",
                "/attachments/cash-app-qr.jpg",
                "/attachments/cashapp.jpg",
              ]} />
              <QrImage title="Venmo" candidates={[
                "/branding/venmo-qr.jpg",
                "/branding/venmo.jpg",
                "/attachments/venmo-qr.jpg",
                "/attachments/venmo.jpg",
              ]} />
            </div>
            <div style={{ fontSize: 12, color: faintText }}>
              Scan either code above to support future updates. If the images do not appear, place the QR files in <strong style={{ color: "#fff" }}>/public/branding</strong> or <strong style={{ color: "#fff" }}>/public/attachments</strong>.
            </div>
          </div>
        </div>
      )}

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
