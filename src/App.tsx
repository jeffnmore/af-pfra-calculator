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

function parseNumber(value: string): number | null {
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

function timeToSeconds(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  const parts = s.split(":");
  if (parts.length !== 2) return null;
  const mm = Number(parts[0]);
  const ss = Number(parts[1]);
  if (!Number.isFinite(mm) || !Number.isFinite(ss) || mm < 0 || ss < 0 || ss >= 60) return null;
  return mm * 60 + ss;
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

function getZone(percent: number): { bg: string; border: string; text: string } {
  if (percent >= 90) return { bg: "rgba(10,122,47,0.35)", border: "rgba(78, 220, 120, 0.55)", text: "#ffffff" };
  if (percent >= 80) return { bg: "rgba(242,194,0,0.30)", border: "rgba(255,222,89,0.55)", text: "#ffffff" };
  if (percent >= 75) return { bg: "rgba(255,149,0,0.28)", border: "rgba(255,179,71,0.55)", text: "#ffffff" };
  return { bg: "rgba(176,0,32,0.34)", border: "rgba(255,95,123,0.55)", text: "#ffffff" };
}

function compositeLabel(percent: number): string {
  if (percent >= 90) return "Excellent";
  if (percent >= 75) return "Satisfactory";
  return "Unsatisfactory";
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
      const sec = timeToSeconds(row.plankMin);
      if (sec != null && value >= sec) return row.pts;
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

function percentString(points: number, maxPoints: number): string {
  if (maxPoints <= 0) return "0.0%";
  return `${((points / maxPoints) * 100).toFixed(1)}%`;
}

function ScoreCard(props: {
  title: string;
  subtitle: string;
  points: number;
  maxPoints: number;
  percentValue: number;
  extra?: React.ReactNode;
  minHeight?: number;
}) {
  const zone = getZone(props.percentValue);
  return (
    <div
      style={{
        borderRadius: 16,
        padding: 14,
        background: zone.bg,
        border: `1px solid ${zone.border}`,
        boxShadow: "0 8px 22px rgba(0,0,0,0.18)",
        minHeight: props.minHeight ?? 112,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.7, opacity: 0.9 }}>{props.title}</div>
      <div style={{ fontSize: 30, fontWeight: 950, lineHeight: 1 }}>{props.points.toFixed(1)}</div>
      <div style={{ fontSize: 14, fontWeight: 850 }}>{percentString(props.points, props.maxPoints)}</div>
      <div style={{ fontSize: 12, opacity: 0.88 }}>{props.subtitle}</div>
      {props.extra ? <div style={{ marginTop: 4 }}>{props.extra}</div> : null}
    </div>
  );
}

export default function App() {
  const APP_VERSION = "1.3.0";
  const APP_UPDATED = "2026-03-08";
  const SITE_URL = "https://usafpfracalculator.com";
  const PAGE_TITLE = "Air Force PT Test Calculator | USAF Physical Fitness Readiness Assessment (PFRA)";
  const META_DESCRIPTION =
    "Air Force PT Test Calculator for the USAF Physical Fitness Readiness Assessment (PFRA). Estimate composite and component scores for waist-to-height ratio, strength, core, cardio, HAMR shuttle run, and 2-mile run results.";

  const VENMO_URL = "https://account.venmo.com/u/Fingers-HMAN";
  const CASH_APP_URL = "https://cash.app/$FingersHMAN";

  const attachments = [
    { title: "Warfighter’s Fitness Playbook", subtitle: "2.0 • Feb 2026", url: "/attachments/Playbook.pdf" },
    { title: "PFRA Scoring Charts", subtitle: "Includes AFSPECWAR / EOD page", url: "/attachments/PFRA_Scoring_Charts.pdf" },
    { title: "DAFMAN 36-2905 IC", subtitle: "22 Jan 2026", url: "/attachments/DAFMAN.pdf" },
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
  const [showInfo, setShowInfo] = useState(false);
  const [showDonateModal, setShowDonateModal] = useState(false);
  const [donateLabel, setDonateLabel] = useState<"Coffee" | "Beer">("Coffee");
  const [viewportTop, setViewportTop] = useState(0);

  const [vw, setVw] = useState<number>(() => (typeof window !== "undefined" ? window.innerWidth : 1200));
  const [mobileMode, setMobileMode] = useState<boolean>(() => (typeof window !== "undefined" ? window.innerWidth < 680 : false));

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (vw < 680) setMobileMode(true);
  }, [vw]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    const updateViewportTop = () => {
      setViewportTop(vv.offsetTop || 0);
    };

    updateViewportTop();
    vv.addEventListener("resize", updateViewportTop);
    vv.addEventListener("scroll", updateViewportTop);
    window.addEventListener("focusin", updateViewportTop);
    window.addEventListener("focusout", updateViewportTop);

    return () => {
      vv.removeEventListener("resize", updateViewportTop);
      vv.removeEventListener("scroll", updateViewportTop);
      window.removeEventListener("focusin", updateViewportTop);
      window.removeEventListener("focusout", updateViewportTop);
    };
  }, []);

  const officialRef = useRef<HTMLElement | null>(null);
  const supportRef = useRef<HTMLElement | null>(null);
  const scrollToRef = (ref: React.RefObject<HTMLElement | null>) => {
    const el = ref.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 16;
    window.scrollTo({ top, behavior: "smooth" });
  };

  const isNarrow = vw < 980;
  const isVeryNarrow = vw < 680;
  const isAFSPEC = program === "AFSPECWAR_EOD";
  const ageBand = useMemo(() => {
    const exactAge = parseNumber(age);
    return exactAge == null ? "Under 25" : getAgeBand(exactAge);
  }, [age]);

  const whtrData = useMemo(() => {
    const h = parseNumber(height);
    const w = parseNumber(waist);
    if (h == null || w == null || h <= 0) return { raw: null as number | null, rounded: null as number | null };
    const raw = w / h;
    return { raw, rounded: Math.round(raw * 100) / 100 };
  }, [height, waist]);

  const whtrPoints = useMemo(() => {
    const r = whtrData.rounded;
    if (r == null) return 0;
    if (r >= (whtr as any).fail.min) return 0;
    for (const threshold of (whtr as any).thresholds) {
      if (r <= threshold.max) return threshold.points;
    }
    return 0;
  }, [whtrData]);

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

  const availableMax = useMemo(() => {
    let total = 0;
    if (!exemptWHtR) total += maxWHtR;
    if (!exemptStrength) total += maxStrength;
    if (!exemptCore) total += maxCore;
    if (!exemptCardio) total += maxCardio;
    return total;
  }, [exemptWHtR, exemptStrength, exemptCore, exemptCardio]);

  const earnedTotal = earnedWHtR + earnedStrength + earnedCore + earnedCardio;
  const compositePercent = availableMax > 0 ? (earnedTotal / availableMax) * 100 : 0;
  const compositeZone = getZone(compositePercent);

  const whtrPercent = exemptWHtR ? 0 : (earnedWHtR / maxWHtR) * 100;
  const strengthPercent = exemptStrength ? 0 : (earnedStrength / maxStrength) * 100;
  const corePercent = exemptCore ? 0 : (earnedCore / maxCore) * 100;
  const cardioPercent = exemptCardio ? 0 : (earnedCardio / maxCardio) * 100;

  useEffect(() => {
    document.title = PAGE_TITLE;
    document.documentElement.lang = "en";
    upsertMetaTag({ name: "description", content: META_DESCRIPTION });
    upsertMetaTag({ name: "robots", content: "index, follow" });
    upsertMetaTag({ property: "og:title", content: PAGE_TITLE });
    upsertMetaTag({ property: "og:description", content: META_DESCRIPTION });
    upsertMetaTag({ property: "og:type", content: "website" });
    upsertMetaTag({ property: "og:url", content: SITE_URL });
    upsertLinkTag("canonical", SITE_URL);
    upsertJsonLd("pfra-webapp-schema", {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "USAF PFRA Calculator",
      alternateName: [
        "Air Force PT Test Calculator",
        "USAF Physical Fitness Readiness Assessment Calculator",
        "Air Force fitness assessment calculator",
      ],
      url: SITE_URL,
      applicationCategory: "HealthApplication",
      operatingSystem: "Any",
      description: META_DESCRIPTION,
    });
  }, []);

  const pageBg = "#041A3A";
  const panelBg = "rgba(8, 18, 38, 0.78)";
  const panelBorder = "1px solid rgba(255,255,255,0.12)";
  const subtleText = "rgba(255,255,255,0.82)";
  const faintText = "rgba(255,255,255,0.62)";

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: mobileMode ? "10px 11px" : "11px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.20)",
    outline: "none",
    fontSize: 14,
    background: "rgba(255,255,255,0.06)",
    color: "#FFFFFF",
    boxSizing: "border-box",
  };

  const selectStyle: React.CSSProperties = { ...inputStyle };
  const cardStyle: React.CSSProperties = {
    background: panelBg,
    borderRadius: 16,
    padding: mobileMode ? 12 : 14,
    border: panelBorder,
    boxShadow: "0 10px 26px rgba(0,0,0,0.22)",
    backdropFilter: "blur(6px)",
  };
  const sectionTitleStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
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
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 850, marginBottom: 6, color: subtleText };

  const mainGrid = mobileMode ? "1fr" : isNarrow ? "1fr 1fr" : "1.1fr 1fr 1fr";
  const scoreGrid = mobileMode ? "1fr" : isNarrow ? "1fr 1fr" : "repeat(5, minmax(0, 1fr))";
  const ribbonHeight = mobileMode ? 88 : 0;

  const supportButton = (label: string, onClick: () => void) => (
    <button className="af-btn" type="button" onClick={onClick}>
      {label}
    </button>
  );

  return (
    <div style={{ minHeight: "100vh", background: pageBg, color: "#FFFFFF" }}>
      <style>{`
        * { box-sizing: border-box; }
        html, body, #root { width: 100%; max-width: 100%; overflow-x: hidden; }
        body { margin: 0; }
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
        .af-select { color: #fff; background: rgba(255,255,255,0.06); }
        .af-select option { color: #fff; background: #061a39; }
      `}</style>

      {mobileMode ? (
        <div
          style={{
            position: "fixed",
            top: viewportTop,
            left: 0,
            right: 0,
            width: "100vw",
            maxWidth: "100vw",
            zIndex: 9999,
            background: "rgba(4,26,58,0.97)",
            borderBottom: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
            transform: "translateZ(0)",
            WebkitTransform: "translateZ(0)",
          }}
        >
          <div
            style={{
              maxWidth: 1160,
              margin: "0 auto",
              padding: "calc(env(safe-area-inset-top, 0px) + 8px) 12px 10px",
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
              gap: 6,
            }}
          >
            {[
              { title: "WHtR", points: earnedWHtR, max: maxWHtR, percent: whtrPercent },
              { title: "STR", points: earnedStrength, max: maxStrength, percent: strengthPercent },
              { title: "CORE", points: earnedCore, max: maxCore, percent: corePercent },
              { title: "CARD", points: earnedCardio, max: maxCardio, percent: cardioPercent },
              { title: "COMP", points: compositePercent, max: 100, percent: compositePercent, asPercent: true },
            ].map((item) => {
              const zone = getZone(item.percent);
              return (
                <div
                  key={item.title}
                  style={{
                    background: zone.bg,
                    border: `1px solid ${zone.border}`,
                    borderRadius: 12,
                    padding: "6px 4px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.4 }}>{item.title}</div>
                  <div style={{ fontSize: 16, fontWeight: 950, lineHeight: 1.05 }}>
                    {"asPercent" in item && item.asPercent ? `${item.points.toFixed(1)}%` : item.points.toFixed(1)}
                  </div>
                  <div style={{ fontSize: 9.5, opacity: 0.9 }}>
                    {"asPercent" in item && item.asPercent ? compositeLabel(compositePercent) : percentString(item.points, item.max)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <main
        style={{
          width: "100%",
          maxWidth: 1160,
          margin: "0 auto",
          paddingTop: mobileMode ? ribbonHeight + 12 : 16,
          paddingRight: mobileMode ? 12 : 16,
          paddingBottom: 20,
          paddingLeft: mobileMode ? 12 : 16,
        }}
      >
        <header style={{ ...cardStyle, background: "rgba(0,0,0,0.18)" }}>
          <div style={{ display: "grid", gridTemplateColumns: mobileMode ? "1fr" : "1.25fr 0.75fr", gap: 14, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.15, color: "rgba(255,255,255,0.72)" }}>USAF FITNESS</div>
              <h1 style={{ margin: "6px 0 8px", fontSize: mobileMode ? 28 : 34, lineHeight: 1.06 }}>
                USAF PFRA Calculator
              </h1>
              <div style={{ color: faintText, fontSize: 13.5, display: "flex", flexWrap: "wrap", gap: 10 }}>
                <span>Version {APP_VERSION}</span>
                <span>Updated {APP_UPDATED}</span>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: mobileMode ? "flex-start" : "flex-end" }}>
              <button className="af-btn" type="button" onClick={() => scrollToRef(officialRef)}>
                View Official Guidance
              </button>
              <button className="af-btn" type="button" onClick={() => scrollToRef(supportRef)}>
                Support / Feedback
              </button>
            </div>
          </div>
        </header>

        <section style={{ marginTop: 12, ...cardStyle }}>
          <div style={sectionTitleStyle}>
            <h2 style={{ margin: 0, fontSize: 20 }}>Air Force Fitness Score Calculator</h2>
            <span style={sectionTagStyle}>Calculator</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: mainGrid, gap: 12 }}>
            <div style={{ display: "grid", gap: 12 }}>
              <section style={cardStyle}>
                <div style={sectionTitleStyle}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Program &amp; profile</h3>
                  <span style={sectionTagStyle}>Inputs</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: mobileMode ? "1fr" : "1fr 1fr", gap: 10 }}>
                  <div>
                    <div style={labelStyle}>Test program</div>
                    <select className="af-select" value={program} onChange={(e) => setProgram(e.target.value as TestProgram)} style={selectStyle}>
                      <option value="PFRA">PFRA (Standard)</option>
                      <option value="AFSPECWAR_EOD">AFSPECWAR / EOD</option>
                    </select>
                  </div>
                  <div>
                    <div style={labelStyle}>Display mode</div>
                    <button className="af-btn" type="button" onClick={() => setMobileMode((v) => !v)}>
                      {mobileMode ? "Mobile Mode: ON" : "Mobile Mode: OFF"}
                    </button>
                  </div>
                  <div>
                    <div style={labelStyle}>Exact age</div>
                    <input value={age} onChange={(e) => setAge(e.target.value)} inputMode="numeric" placeholder="e.g., 32" style={inputStyle} />
                    <div style={{ marginTop: 6, fontSize: 11, color: faintText }}>Age band: {ageBand}</div>
                  </div>
                  <div>
                    <div style={labelStyle}>Gender</div>
                    <select className="af-select" value={gender} onChange={(e) => setGender(e.target.value as Gender)} style={selectStyle} disabled={isAFSPEC}>
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                    </select>
                    <div style={{ marginTop: 6, fontSize: 11, color: faintText }}>
                      {isAFSPEC ? "AFSPECWAR / EOD uses one standard for all ages and genders." : "PFRA uses age and gender based scoring."}
                    </div>
                  </div>
                </div>
              </section>

              <section style={cardStyle}>
                <div style={sectionTitleStyle}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Body composition (0–20)</h3>
                  <span style={sectionTagStyle}>WHtR</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: mobileMode ? "1fr" : "1fr 1fr", gap: 10 }}>
                  <div>
                    <div style={labelStyle}>Height (inches)</div>
                    <input value={height} onChange={(e) => setHeight(e.target.value)} inputMode="decimal" placeholder="e.g., 70" style={inputStyle} disabled={exemptWHtR} />
                  </div>
                  <div>
                    <div style={labelStyle}>Waist (inches)</div>
                    <input value={waist} onChange={(e) => setWaist(e.target.value)} inputMode="decimal" placeholder="e.g., 33" style={inputStyle} disabled={exemptWHtR} />
                  </div>
                </div>
                <div style={{ marginTop: 10, color: subtleText, fontSize: 13 }}>
                  Ratio: <strong style={{ color: "#fff" }}>{whtrData.rounded == null ? "—" : whtrData.rounded.toFixed(2)}</strong>
                </div>
              </section>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <section style={cardStyle}>
                <div style={sectionTitleStyle}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Strength (0–15)</h3>
                  <span style={sectionTagStyle}>Upper body</span>
                </div>
                <div>
                  <div style={labelStyle}>Test</div>
                  <select className="af-select" value={strengthTest} onChange={(e) => setStrengthTest(e.target.value as StrengthTest)} style={selectStyle} disabled={exemptStrength}>
                    <option value="pushups">Push-ups</option>
                    <option value="hrpu">Hand-release push-ups</option>
                  </select>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={labelStyle}>{strengthTest === "pushups" ? "Push-up reps" : "HRPU reps"}</div>
                  <input
                    value={strengthTest === "pushups" ? pushupReps : hrpuReps}
                    onChange={(e) => (strengthTest === "pushups" ? setPushupReps(e.target.value) : setHrpuReps(e.target.value))}
                    inputMode="numeric"
                    placeholder="e.g., 42"
                    style={inputStyle}
                    disabled={exemptStrength}
                  />
                </div>
              </section>

              <section style={cardStyle}>
                <div style={sectionTitleStyle}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Core (0–15)</h3>
                  <span style={sectionTagStyle}>Midline</span>
                </div>
                <div>
                  <div style={labelStyle}>Test</div>
                  <select className="af-select" value={coreTest} onChange={(e) => setCoreTest(e.target.value as CoreTest)} style={selectStyle} disabled={exemptCore}>
                    <option value="situps">Sit-ups</option>
                    <option value="reverse_crunch">Reverse crunch</option>
                    <option value="plank">Plank</option>
                  </select>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={labelStyle}>
                    {coreTest === "situps" ? "Sit-up reps" : coreTest === "reverse_crunch" ? "Reverse crunch reps" : "Plank time (mm:ss)"}
                  </div>
                  <input
                    value={coreTest === "situps" ? situpReps : coreTest === "reverse_crunch" ? reverseCrunchReps : plankTime}
                    onChange={(e) => {
                      if (coreTest === "situps") setSitupReps(e.target.value);
                      else if (coreTest === "reverse_crunch") setReverseCrunchReps(e.target.value);
                      else setPlankTime(e.target.value);
                    }}
                    inputMode={coreTest === "plank" ? "text" : "numeric"}
                    placeholder={coreTest === "plank" ? "e.g., 2:30" : "e.g., 40"}
                    style={inputStyle}
                    disabled={exemptCore}
                  />
                </div>
              </section>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <section style={cardStyle}>
                <div style={sectionTitleStyle}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Cardio (0–50)</h3>
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
                  <div style={labelStyle}>{cardioTest === "2mile" ? "2-mile time (mm:ss)" : "HAMR shuttles"}</div>
                  <input
                    value={cardioTest === "2mile" ? run2MileTime : hamrShuttles}
                    onChange={(e) => (cardioTest === "2mile" ? setRun2MileTime(e.target.value) : setHamrShuttles(e.target.value))}
                    inputMode={cardioTest === "2mile" ? "text" : "numeric"}
                    placeholder={cardioTest === "2mile" ? "e.g., 16:54" : "e.g., 60"}
                    style={inputStyle}
                    disabled={exemptCardio}
                  />
                </div>
              </section>

              <section style={cardStyle}>
                <div style={sectionTitleStyle}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Exemptions</h3>
                  <span style={sectionTagStyle}>Prorated</span>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {[
                    { label: "WHtR (0–20)", value: exemptWHtR, setter: setExemptWHtR },
                    { label: "Strength (0–15)", value: exemptStrength, setter: setExemptStrength },
                    { label: "Core (0–15)", value: exemptCore, setter: setExemptCore },
                    { label: "Cardio (0–50)", value: exemptCardio, setter: setExemptCardio },
                  ].map((item) => (
                    <label
                      key={item.label}
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
                      <input type="checkbox" checked={item.value} onChange={(e) => item.setter(e.target.checked)} />
                      Exempt: {item.label}
                    </label>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </section>

        <section style={{ marginTop: 12, display: "grid", gridTemplateColumns: scoreGrid, gap: 10 }} aria-label="Component and composite scores">
          <ScoreCard title="WHtR" subtitle={exemptWHtR ? "Exempt" : whtrData.rounded == null ? "Enter waist and height" : `Rounded ${whtrData.rounded.toFixed(2)}`} points={earnedWHtR} maxPoints={maxWHtR} percentValue={whtrPercent} />
          <ScoreCard title="Strength" subtitle={exemptStrength ? "Exempt" : strengthTest === "pushups" ? "Push-ups" : "Hand-release push-ups"} points={earnedStrength} maxPoints={maxStrength} percentValue={strengthPercent} />
          <ScoreCard title="Core" subtitle={exemptCore ? "Exempt" : coreTest === "situps" ? "Sit-ups" : coreTest === "reverse_crunch" ? "Reverse crunch" : "Plank"} points={earnedCore} maxPoints={maxCore} percentValue={corePercent} />
          <ScoreCard title="Cardio" subtitle={exemptCardio ? "Exempt" : cardioTest === "2mile" ? "2-mile run" : "20m HAMR"} points={earnedCardio} maxPoints={maxCardio} percentValue={cardioPercent} />

          <div
            style={{
              borderRadius: 16,
              padding: 14,
              background: compositeZone.bg,
              border: `1px solid ${compositeZone.border}`,
              boxShadow: "0 8px 22px rgba(0,0,0,0.18)",
              minHeight: 112,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.7, opacity: 0.9 }}>Composite</div>
            <div style={{ fontSize: 30, fontWeight: 950, lineHeight: 1 }}>{compositePercent.toFixed(1)}%</div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>{compositeLabel(compositePercent)}</div>
            <div style={{ fontSize: 12, opacity: 0.88 }}>
              {earnedTotal.toFixed(1)} of {availableMax.toFixed(1)} available points
            </div>
          </div>
        </section>

        <section ref={officialRef} style={{ marginTop: 12, ...cardStyle }}>
          <div style={sectionTitleStyle}>
            <h2 style={{ margin: 0, fontSize: 20 }}>Official Guidance</h2>
            <span style={sectionTagStyle}>PDF</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isVeryNarrow ? "1fr" : isNarrow ? "1fr 1fr" : "repeat(3, minmax(220px, 1fr))", gap: 10 }}>
            {attachments.map((item) => (
              <div key={item.url} style={{ ...cardStyle, padding: 12, minHeight: 108 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontWeight: 950, letterSpacing: 0.2, fontSize: 13, lineHeight: 1.2 }}>{item.title}</div>
                  <div style={{ fontSize: 11, color: faintText }}>{item.subtitle}</div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <a className="af-btn" href={item.url} target="_blank" rel="noreferrer">
                    Open PDF
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section ref={supportRef} style={{ marginTop: 12, ...cardStyle }}>
          <div style={sectionTitleStyle}>
            <h2 style={{ margin: 0, fontSize: 20 }}>Support / Feedback</h2>
            <span style={sectionTagStyle}>Contact</span>
          </div>
          <p style={{ marginTop: 0, color: subtleText, lineHeight: 1.6 }}>
            This calculator took substantial time to build, test, and maintain. The goal is to keep it free for users.
            If it helped you, you can send feedback or support future updates below.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {supportButton("Send Feedback", () => {
              window.location.href = "mailto:jeffnmore@hotmail.com?subject=PFRA%20Calculator%20Feedback";
            })}
            {supportButton("Buy Me a Coffee", () => {
              setDonateLabel("Coffee");
              setShowDonateModal(true);
            })}
            {supportButton("Buy Me a Beer", () => {
              setDonateLabel("Beer");
              setShowDonateModal(true);
            })}
          </div>
          <div style={{ marginTop: 10, fontSize: 11.5, color: faintText }}>
            Choose Venmo or Cash App after tapping either support button. Update the Cash App button by replacing <code style={{ color: "#fff" }}>YourCashtag</code> in <code style={{ color: "#fff" }}>CASH_APP_URL</code>.
          </div>
        </section>

        <section style={{ marginTop: 12, ...cardStyle }}>
          <div style={sectionTitleStyle}>
            <h2 style={{ margin: 0, fontSize: 20 }}>Info</h2>
            <button className="af-btn" type="button" onClick={() => setShowInfo((v) => !v)}>
              {showInfo ? "Hide Info" : "Info"}
            </button>
          </div>
          {showInfo ? (
            <div style={{ display: "grid", gap: 10, color: subtleText, lineHeight: 1.6, fontSize: 14 }}>
              <p style={{ margin: 0 }}>
                Use this Air Force PT Test Calculator to estimate a USAF Physical Fitness Readiness Assessment score,
                including waist-to-height ratio, strength, core, cardio, HAMR shuttle run, and 2-mile run results.
              </p>
              <p style={{ margin: 0 }}>
                This page is also relevant for people searching for an Air Force fitness assessment, USAF PT score,
                AF PT test score, PFRA calculator, AFSPECWAR fitness test score, or EOD fitness test scoring reference.
              </p>
              <p style={{ margin: 0 }}>
                The calculator is designed to help users estimate component points and composite results quickly before
                checking official Air Force guidance and scoring charts.
              </p>
            </div>
          ) : null}
        </section>
        {showDonateModal ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Choose payment method for ${donateLabel}`}
            onClick={() => setShowDonateModal(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 10001,
              background: "rgba(0,0,0,0.58)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: 420,
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "linear-gradient(180deg, rgba(7,27,58,0.98) 0%, rgba(4,19,42,0.98) 100%)",
                boxShadow: "0 18px 40px rgba(0,0,0,0.38)",
                padding: 18,
                display: "grid",
                gap: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: faintText, fontWeight: 900, letterSpacing: 0.7 }}>SUPPORT</div>
                  <div style={{ fontSize: 22, fontWeight: 950 }}>Buy Me a {donateLabel}</div>
                </div>
                <button className="af-btn" type="button" onClick={() => setShowDonateModal(false)}>
                  Close
                </button>
              </div>

              <div style={{ color: subtleText, lineHeight: 1.55, fontSize: 14 }}>
                Choose a payment method below. On mobile, each button should open the selected service directly.
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button
                  className="af-btn"
                  type="button"
                  onClick={() => window.open(VENMO_URL, "_blank", "noopener,noreferrer")}
                  style={{ minHeight: 54 }}
                >
                  Venmo
                </button>
                <button
                  className="af-btn"
                  type="button"
                  onClick={() => window.open(CASH_APP_URL, "_blank", "noopener,noreferrer")}
                  style={{ minHeight: 54 }}
                >
                  Cash App
                </button>
              </div>

              <div style={{ display: "grid", gap: 6, fontSize: 12, color: faintText }}>
                <div>Venmo opens your profile page: <span style={{ color: "#fff" }}>Fingers-HMAN</span></div>
                <div>Cash App opens your cashtag link. Replace the placeholder cashtag before deploying.</div>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
