import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Upload,
  Brain,
  Activity,
  ShieldAlert,
  ChevronRight,
  Info,
  CheckCircle2,
  AlertCircle,
  FileText,
  User,
  Stethoscope,
  RefreshCw,
  Zap,
  Sparkles,
  Layers,
  ArrowUpRight,
  Sliders,
  Eye,
  EyeOff,
  Crosshair,
  Compass,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import {
  eegService,
  EEGReport,
  EEGBenchmarks,
  TopomapChannel,
  FacsMarkers,
} from "../services/eegService";
import { ClayBrainIcon } from "./clay-icons";
import { toast } from "sonner";

interface ClinicianPortalProps {
  onNavigate?: (screen: string) => void;
}

type TopomapViewMode = "faa" | "alpha" | "theta" | "beta" | "delta";
type LensMode = "patient" | "clinician";

export function ClinicianPortal({ onNavigate }: ClinicianPortalProps) {
  const { isDark } = useTheme();

  // State
  const [reports, setReports] = useState<EEGReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<EEGReport | null>(null);
  const [benchmarks, setBenchmarks] = useState<EEGBenchmarks | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");

  // Views & filters
  const [activeLens, setActiveLens] = useState<LensMode>("patient");
  const [topomapMode, setTopomapMode] = useState<TopomapViewMode>("faa");
  const [hoveredChannel, setHoveredChannel] = useState<TopomapChannel | null>(null);
  const [recordingStateChoice, setRecordingStateChoice] = useState<string>("eyes_closed");
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Initial load
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [fetchedReports, fetchedBenchmarks] = await Promise.all([
        eegService.fetchReports().catch(() => []),
        eegService.fetchBenchmarks().catch(() => null),
      ]);
      setReports(fetchedReports);
      setBenchmarks(fetchedBenchmarks);
      if (fetchedReports.length > 0) {
        setSelectedReport(fetchedReports[0]);
      }
    } catch (err) {
      console.error("Error loading EEG data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".edf")) {
      toast.error("Please upload a standard European Data Format (.edf) file.");
      return;
    }

    setIsUploading(true);
    setUploadProgress(`Processing ${file.name} (DSP filtering & Welch PSD)...`);
    try {
      const report = await eegService.uploadEdf(file, undefined, recordingStateChoice);
      toast.success("EEG Recording analyzed successfully!");
      setReports((prev) => [report, ...prev]);
      setSelectedReport(report);
      setShowUploadModal(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to analyze EEG recording");
    } finally {
      setIsUploading(false);
      setUploadProgress("");
    }
  };

  const handleLoadDemo = async (sampleType: "mdd_ec" | "healthy_ec" | "mdd_eo" | "healthy_eo") => {
    setIsUploading(true);
    const label =
      sampleType === "mdd_ec"
        ? "Mumtaz MDD S1 (Eyes Closed)"
        : sampleType === "healthy_ec"
        ? "Mumtaz Healthy S1 (Eyes Closed)"
        : sampleType === "mdd_eo"
        ? "Mumtaz MDD S1 (Eyes Open)"
        : "Mumtaz Healthy S1 (Eyes Open)";

    setUploadProgress(`Loading authentic cohort record: ${label}...`);
    try {
      const report = await eegService.loadDemoSample(sampleType);
      toast.success(`Loaded sample: ${report.filename}`);
      setReports((prev) => [report, ...prev.filter((r) => r.id !== report.id)]);
      setSelectedReport(report);
      setShowUploadModal(false);
    } catch (err: any) {
      toast.error(err.message || "Could not load demo sample");
    } finally {
      setIsUploading(false);
      setUploadProgress("");
    }
  };

  // Helper for node coloring in topomap
  const getNodeColor = (node: TopomapChannel, mode: TopomapViewMode) => {
    if (mode === "faa") {
      // Contrast F3 (left frontal) vs F4 (right frontal)
      if (node.channel === "F3") return "#6366F1"; // Left frontal indigo
      if (node.channel === "F4") return "#EC4899"; // Right frontal pink
      if (node.channel === "Fz") return "#8B5CF6"; // Midline violet
      return isDark ? "#3D3459" : "#DDD6FE";
    }

    let val = 0.2;
    if (mode === "alpha") val = node.alpha_rel;
    else if (mode === "theta") val = node.theta_rel;
    else if (mode === "beta") val = node.beta_rel;
    else if (mode === "delta") val = node.delta_rel;

    // Normalizing between 0.05 and 0.45 relative power
    const norm = Math.min(Math.max((val - 0.08) / 0.32, 0), 1);
    if (norm > 0.66) return "#EC4899"; // high heat
    if (norm > 0.33) return "#8B5CF6"; // moderate
    return "#3B82F6"; // low heat
  };

  const primaryCorrelation = selectedReport?.correlations?.[0];
  const facs: FacsMarkers = primaryCorrelation?.facs_markers || {
    au04_brow_furrow: 0.65,
    au12_zygomatic_smile: 0.25,
    au15_lip_depressor: 0.45,
    au01_brow_raiser: 0.55,
    prosody_monotony: 0.6,
  };

  return (
    <div className="w-full h-full min-h-0 flex flex-col overflow-y-auto px-4 md:px-7 py-5 select-none scrollbar-none pb-24">
      {/* ── Top Header Banner ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 shrink-0">
        <div className="flex items-center gap-3.5">
          <motion.div
            whileHover={{ rotate: 10, scale: 1.05 }}
            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg"
            style={{
              background: "linear-gradient(135deg, #A88DEB 0%, #7B56DB 100%)",
              boxShadow: "0 8px 24px rgba(123, 86, 219, 0.35)",
            }}
          >
            <ClayBrainIcon size={28} />
          </motion.div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[22px] md:text-[24px] font-black text-[#2E2544] dark:text-[#FFFFFF] tracking-tight">
                Neuro-Behavioral Clinician Portal
              </h1>
              <span className="clay-pill px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-[#7B56DB] dark:text-[#D4C5F7]">
                10-20 Lab
              </span>
            </div>
            <p className="text-[13px] font-medium text-[#7A748A] dark:text-[#9E98B4] mt-0.5">
              Empirical EEG biomarker ingestion, Frontal Alpha Asymmetry, and FACS triangulation.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setShowUploadModal(true)}
            className="clay-button px-4 py-2.5 rounded-2xl text-[13px] font-bold text-[#7B56DB] dark:text-[#D4C5F7] flex items-center gap-2 cursor-pointer border-none outline-none hover:scale-102 active:scale-98 transition-transform"
          >
            <Upload size={16} />
            <span>Upload EDF</span>
          </button>

          <button
            onClick={() => handleLoadDemo("mdd_ec")}
            className="clay-button px-4 py-2.5 rounded-2xl text-[13px] font-bold text-[#EC4899] dark:text-[#F472B6] flex items-center gap-2 cursor-pointer border-none outline-none hover:scale-102 active:scale-98 transition-transform"
          >
            <Sparkles size={16} />
            <span>Load Demo (MDD)</span>
          </button>

          <button
            onClick={() => handleLoadDemo("healthy_ec")}
            className="clay-button px-4 py-2.5 rounded-2xl text-[13px] font-bold text-[#10B981] dark:text-[#34D399] flex items-center gap-2 cursor-pointer border-none outline-none hover:scale-102 active:scale-98 transition-transform"
          >
            <CheckCircle2 size={16} />
            <span>Load Demo (Healthy)</span>
          </button>
        </div>
      </div>

      {/* ── Cohort Benchmark Banner ── */}
      {benchmarks && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="clay-card p-3.5 mb-6 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-[#6B6380] dark:text-[#B4ADC6]"
          style={{ borderRadius: 20 }}
        >
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] animate-pulse" />
            <span>
              Empirical Model: <strong className="text-[#2E2544] dark:text-[#FFFFFF]">{benchmarks.dataset}</strong>
            </span>
            <span className="opacity-40">•</span>
            <span>
              Cohort: <strong className="text-[#2E2544] dark:text-[#FFFFFF]">{benchmarks.sample_size} Rest Recordings</strong> ({benchmarks.num_mdd} MDD vs {benchmarks.num_healthy} HC)
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="clay-pill px-2.5 py-1 text-[11px] font-bold text-[#7B56DB] dark:text-[#D4C5F7]">
              Cross-Validated ROC-AUC: {(benchmarks.metrics.roc_auc * 100).toFixed(1)}%
            </span>
            <span className="clay-pill px-2.5 py-1 text-[11px] font-bold text-[#10B981] dark:text-[#34D399]">
              Precision: {(benchmarks.metrics.precision * 100).toFixed(1)}%
            </span>
          </div>
        </motion.div>
      )}

      {/* ── Reports Selector Pills (if multiple exist) ── */}
      {reports.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-4 scrollbar-none">
          <span className="text-[12px] font-bold text-[#8E88A4] dark:text-[#7A748A] whitespace-nowrap pl-1">
            Patient Recordings:
          </span>
          {reports.map((rep) => {
            const isSel = selectedReport?.id === rep.id;
            const isRisk = rep.predicted_class === "depressive_risk";
            return (
              <button
                key={rep.id}
                onClick={() => setSelectedReport(rep)}
                className={`clay-pill px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer border-none flex items-center gap-1.5 ${
                  isSel
                    ? "bg-[#7B56DB] text-white shadow-md"
                    : "text-[#6B6380] dark:text-[#B4ADC6] hover:text-[#2E2544]"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isRisk ? "bg-[#EF4444]" : "bg-[#10B981]"
                  }`}
                />
                <span>{rep.filename}</span>
                <span className="opacity-60 text-[10px]">
                  ({rep.recording_state === "eyes_closed" ? "EC" : "EO"})
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Main Dashboard Body ── */}
      {isLoading ? (
        <div className="w-full flex-1 min-h-[400px] flex flex-col items-center justify-center">
          <RefreshCw className="animate-spin text-[#7B56DB] mb-3" size={32} />
          <p className="text-sm font-bold text-[#7A748A] dark:text-[#9E98B4]">
            Loading neuro-telemetry profiles...
          </p>
        </div>
      ) : !selectedReport ? (
        /* Empty State */
        <div className="clay-card flex-1 min-h-[440px] flex flex-col items-center justify-center p-8 text-center" style={{ borderRadius: 28 }}>
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-4 bg-purple-100 dark:bg-purple-950/40">
            <ClayBrainIcon size={48} />
          </div>
          <h2 className="text-[20px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF] mb-2">
            No Electrophysiology Recording Loaded
          </h2>
          <p className="text-[13px] text-[#7A748A] dark:text-[#9E98B4] max-w-md mb-6 leading-relaxed">
            Upload an authentic European Data Format (.edf) clinical recording or load a sample from the Mumtaz depression study cohort to inspect the 3D scalp topomap and FACS triangulation.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowUploadModal(true)}
              className="clay-button px-5 py-2.5 rounded-2xl font-bold text-xs text-[#7B56DB] dark:text-[#D4C5F7] flex items-center gap-2 cursor-pointer border-none"
            >
              <Upload size={16} />
              <span>Upload EDF File</span>
            </button>
            <button
              onClick={() => handleLoadDemo("mdd_ec")}
              className="clay-button px-5 py-2.5 rounded-2xl font-bold text-xs text-[#EC4899] dark:text-[#F472B6] flex items-center gap-2 cursor-pointer border-none"
            >
              <Sparkles size={16} />
              <span>Load Mumtaz MDD Sample</span>
            </button>
          </div>
        </div>
      ) : (
        /* Active Report Presentation */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* ══════════════ LEFT COLUMN: 3D Topomap & Biomarker Dials (7 cols) ══════════════ */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            {/* Classification & Primary Metric Card */}
            <div className="clay-card p-5" style={{ borderRadius: 26 }}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-3.5 h-3.5 rounded-full ${
                      selectedReport.predicted_class === "depressive_risk"
                        ? "bg-[#EF4444] shadow-[0_0_12px_rgba(239,68,68,0.6)]"
                        : "bg-[#10B981] shadow-[0_0_12px_rgba(16,185,129,0.6)]"
                    }`}
                  />
                  <div>
                    <h3 className="text-[17px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF]">
                      {selectedReport.predicted_class === "depressive_risk"
                        ? "Depressive Pattern Detected"
                        : "Normative Baseline Balance"}
                    </h3>
                    <p className="text-[11px] font-semibold text-[#8E88A4] dark:text-[#9E98B4]">
                      File: {selectedReport.filename} • {selectedReport.duration_seconds.toFixed(0)}s Duration @ {selectedReport.sampling_rate} Hz
                    </p>
                  </div>
                </div>

                <div className="clay-pill px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5">
                  <span className="text-[#8E88A4]">Classifier Confidence:</span>
                  <span className="text-[#7B56DB] dark:text-[#D4C5F7]">
                    {(selectedReport.confidence_score * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* 3 Metric Gauges (FAA, TBR, APF) */}
              <div className="grid grid-cols-3 gap-3">
                {/* 1. FAA */}
                <div className="clay-card p-3.5 flex flex-col items-center text-center" style={{ borderRadius: 20 }}>
                  <span className="text-[11px] font-bold text-[#8E88A4] dark:text-[#9E98B4] mb-1">
                    Frontal Alpha Asymmetry
                  </span>
                  <div className="text-[20px] font-black text-[#2E2544] dark:text-[#FFFFFF] tracking-tight">
                    {selectedReport.faa_score > 0 ? "+" : ""}
                    {selectedReport.faa_score.toFixed(3)}
                  </div>
                  <div className="clay-pill px-2 py-0.5 text-[10px] font-bold mt-1.5 text-[#EC4899]">
                    Z = {selectedReport.biomarkers?.z_scores?.faa !== undefined ? selectedReport.biomarkers.z_scores.faa.toFixed(2) : "0.00"}
                  </div>
                  <span className="text-[9.5px] font-semibold text-[#A09AA8] mt-1">
                    {selectedReport.faa_score < -0.05 ? "Right Hyperactivation" : "Left/Symmetric"}
                  </span>
                </div>

                {/* 2. TBR */}
                <div className="clay-card p-3.5 flex flex-col items-center text-center" style={{ borderRadius: 20 }}>
                  <span className="text-[11px] font-bold text-[#8E88A4] dark:text-[#9E98B4] mb-1">
                    Theta/Beta Ratio (Fz)
                  </span>
                  <div className="text-[20px] font-black text-[#2E2544] dark:text-[#FFFFFF] tracking-tight">
                    {selectedReport.tbr_fz_score.toFixed(2)}
                  </div>
                  <div className="clay-pill px-2 py-0.5 text-[10px] font-bold mt-1.5 text-[#8B5CF6]">
                    Z = {selectedReport.biomarkers?.z_scores?.tbr_fz !== undefined ? selectedReport.biomarkers.z_scores.tbr_fz.toFixed(2) : "0.00"}
                  </div>
                  <span className="text-[9.5px] font-semibold text-[#A09AA8] mt-1">
                    {selectedReport.tbr_fz_score > 2.5 ? "Attentional Load" : "Steady Focus"}
                  </span>
                </div>

                {/* 3. APF */}
                <div className="clay-card p-3.5 flex flex-col items-center text-center" style={{ borderRadius: 20 }}>
                  <span className="text-[11px] font-bold text-[#8E88A4] dark:text-[#9E98B4] mb-1">
                    Alpha Peak Freq (F4)
                  </span>
                  <div className="text-[20px] font-black text-[#2E2544] dark:text-[#FFFFFF] tracking-tight">
                    {(selectedReport.biomarkers?.apf_f4 || 10.0).toFixed(1)} Hz
                  </div>
                  <div className="clay-pill px-2 py-0.5 text-[10px] font-bold mt-1.5 text-[#3B82F6]">
                    Baseline: 10 Hz
                  </div>
                  <span className="text-[9.5px] font-semibold text-[#A09AA8] mt-1">
                    Cortical Speed
                  </span>
                </div>
              </div>
            </div>

            {/* ── 3D Scalp Topography Card ── */}
            <div className="clay-card p-5 flex flex-col" style={{ borderRadius: 26 }}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h4 className="text-[16px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF]">
                    10-20 Scalp Topography Map
                  </h4>
                  <p className="text-[11px] font-medium text-[#8E88A4] dark:text-[#9E98B4]">
                    Interactive electrode power distribution (19 clinical leads)
                  </p>
                </div>

                {/* Topomap Heatmap Filter Buttons */}
                <div className="flex items-center gap-1.5 p-1 clay-pill rounded-xl">
                  {(
                    [
                      { id: "faa", label: "FAA Asymmetry" },
                      { id: "alpha", label: "Alpha (8-13Hz)" },
                      { id: "theta", label: "Theta (4-8Hz)" },
                      { id: "beta", label: "Beta (13-30Hz)" },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setTopomapMode(m.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold cursor-pointer border-none transition-all ${
                        topomapMode === m.id
                          ? "bg-[#7B56DB] text-white shadow-sm"
                          : "text-[#7A748A] dark:text-[#9E98B4] hover:text-[#2E2544]"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scalp Map Visual Container */}
              <div className="relative w-full aspect-square max-h-[380px] flex items-center justify-center p-3 select-none">
                <svg
                  viewBox="-120 -120 240 240"
                  className="w-full h-full max-h-[350px]"
                  style={{ filter: "drop-shadow(0 8px 24px rgba(123, 86, 219, 0.15))" }}
                >
                  <defs>
                    <radialGradient id="scalpBgGrad" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor={isDark ? "#2A2346" : "#F4F0FD"} />
                      <stop offset="85%" stopColor={isDark ? "#1C1733" : "#EBE4F9"} />
                      <stop offset="100%" stopColor={isDark ? "#151028" : "#E0D7F5"} />
                    </radialGradient>
                    <filter id="clayNodeGlow" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  {/* Head Contour Outline */}
                  {/* Outer Cranial Circle */}
                  <circle
                    cx="0"
                    cy="0"
                    r="92"
                    fill="url(#scalpBgGrad)"
                    stroke={isDark ? "#524875" : "#D4C7F2"}
                    strokeWidth="3.5"
                  />

                  {/* Nasion (Nose Triangle at top) */}
                  <path
                    d="M -12 -91 L 0 -106 L 12 -91 Z"
                    fill={isDark ? "#2A2346" : "#EBE4F9"}
                    stroke={isDark ? "#524875" : "#D4C7F2"}
                    strokeWidth="3.5"
                    strokeLinejoin="round"
                  />

                  {/* Left Ear */}
                  <path
                    d="M -92 -14 C -102 -10, -102 10, -92 14"
                    fill="none"
                    stroke={isDark ? "#524875" : "#D4C7F2"}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />

                  {/* Right Ear */}
                  <path
                    d="M 92 -14 C 102 -10, 102 10, 92 14"
                    fill="none"
                    stroke={isDark ? "#524875" : "#D4C7F2"}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />

                  {/* 10-20 Grid Meridian Lines */}
                  {/* Sagittal Line (Nasion to Inion) */}
                  <line
                    x1="0"
                    y1="-88"
                    x2="0"
                    y2="88"
                    stroke={isDark ? "rgba(255,255,255,0.08)" : "rgba(123,86,219,0.12)"}
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                  {/* Coronal Line (Ear to Ear through Cz) */}
                  <line
                    x1="-88"
                    y1="0"
                    x2="88"
                    y2="0"
                    stroke={isDark ? "rgba(255,255,255,0.08)" : "rgba(123,86,219,0.12)"}
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />

                  {/* Frontal Asymmetry Highlight Arc between F3 and F4 */}
                  {topomapMode === "faa" && (
                    <path
                      d="M -34 -45 Q 0 -60 34 -45"
                      fill="none"
                      stroke="#EC4899"
                      strokeWidth="2.5"
                      strokeDasharray="4 3"
                    />
                  )}

                  {/* Electrodes (19 standard leads) */}
                  {selectedReport.channel_topomap?.channels?.map((node) => {
                    // Coordinates mapped to SVG viewBox (-100 to +100)
                    // Note: node.y in clinical coordinates is +1 (front) to -1 (back)
                    const cx = node.x * 85;
                    const cy = -node.y * 85;
                    const color = getNodeColor(node, topomapMode);
                    const isHovered = hoveredChannel?.channel === node.channel;
                    const isKeyLead = ["F3", "F4", "Fz", "Cz"].includes(node.channel);

                    return (
                      <g
                        key={node.channel}
                        className="cursor-pointer transition-transform"
                        onMouseEnter={() => setHoveredChannel(node)}
                        onMouseLeave={() => setHoveredChannel(null)}
                      >
                        {/* Glow halo */}
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isHovered ? 16 : isKeyLead ? 13 : 11}
                          fill={color}
                          fillOpacity={isHovered ? 0.45 : 0.22}
                        />

                        {/* Clay Node Orb */}
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isHovered ? 11 : isKeyLead ? 9 : 8}
                          fill={color}
                          stroke="#FFFFFF"
                          strokeWidth={isHovered ? 2.2 : 1.4}
                          style={{
                            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.25))",
                          }}
                        />

                        {/* Specular highlight */}
                        <ellipse
                          cx={cx - 2.5}
                          cy={cy - 2.5}
                          rx={isHovered ? 3.5 : 2.5}
                          ry={isHovered ? 2 : 1.5}
                          fill="#FFFFFF"
                          fillOpacity="0.8"
                        />

                        {/* Channel Label */}
                        <text
                          x={cx}
                          y={cy + (isHovered ? 18 : 16)}
                          textAnchor="middle"
                          fill={isDark ? "#E5E1F2" : "#37314E"}
                          fontSize={isKeyLead ? 8.5 : 7.5}
                          fontWeight="bold"
                          pointerEvents="none"
                        >
                          {node.channel}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {/* Floating Node Inspection Tooltip */}
                {hoveredChannel && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute bottom-2 right-2 clay-card p-3 rounded-2xl text-left pointer-events-none z-10 shadow-xl"
                    style={{ minWidth: 160 }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5 border-b border-black/5 dark:border-white/10 pb-1">
                      <span className="text-xs font-black text-[#7B56DB] dark:text-[#D4C5F7]">
                        Lead: {hoveredChannel.channel}
                      </span>
                      <span className="text-[10px] font-bold text-[#8E88A4]">
                        {hoveredChannel.rms_uv.toFixed(1)} μV RMS
                      </span>
                    </div>
                    <div className="space-y-1 text-[11px] font-semibold text-[#57506B] dark:text-[#C5BFD6]">
                      <div className="flex justify-between">
                        <span>Alpha (8-13Hz):</span>
                        <strong className="text-[#2E2544] dark:text-white">
                          {(hoveredChannel.alpha_rel * 100).toFixed(1)}%
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Theta (4-8Hz):</span>
                        <strong className="text-[#2E2544] dark:text-white">
                          {(hoveredChannel.theta_rel * 100).toFixed(1)}%
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Beta (13-30Hz):</span>
                        <strong className="text-[#2E2544] dark:text-white">
                          {(hoveredChannel.beta_rel * 100).toFixed(1)}%
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Peak Freq (APF):</span>
                        <strong className="text-[#7B56DB] dark:text-[#D4C5F7]">
                          {hoveredChannel.apf.toFixed(1)} Hz
                        </strong>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Spectral Band Power Bars */}
              <div className="mt-4 pt-4 border-t border-black/5 dark:border-white/5 space-y-2">
                <span className="text-[11.5px] font-extrabold text-[#7A748A] dark:text-[#9E98B4]">
                  Global Relative Band Power Spectrum
                </span>
                <div className="grid grid-cols-5 gap-2 text-center text-xs">
                  {[
                    { label: "Delta (0.5-4Hz)", val: selectedReport.band_powers?.global?.delta || 35, color: "#3B82F6" },
                    { label: "Theta (4-8Hz)", val: selectedReport.band_powers?.global?.theta || 22, color: "#8B5CF6" },
                    { label: "Alpha (8-13Hz)", val: selectedReport.band_powers?.global?.alpha || 20, color: "#10B981" },
                    { label: "Beta (13-30Hz)", val: selectedReport.band_powers?.global?.beta || 18, color: "#EC4899" },
                    { label: "Gamma (30-45Hz)", val: selectedReport.band_powers?.global?.gamma || 5, color: "#F59E0B" },
                  ].map((b) => (
                    <div key={b.label} className="clay-card p-2 rounded-xl flex flex-col items-center">
                      <span className="text-[10px] font-bold text-[#8E88A4] truncate w-full">
                        {b.label.split(" ")[0]}
                      </span>
                      <strong className="text-sm font-black text-[#2E2544] dark:text-white my-0.5">
                        {b.val.toFixed(1)}%
                      </strong>
                      <div className="w-full h-1.5 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden mt-1">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(b.val * 2, 100)}%`, backgroundColor: b.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ══════════════ RIGHT COLUMN: Dual-Lens & FACS Triangulation (5 cols) ══════════════ */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            {/* Dual-Lens Mode Switcher */}
            <div className="clay-card p-5 flex flex-col flex-1" style={{ borderRadius: 26 }}>
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <FileText size={18} className="text-[#7B56DB]" />
                  <h4 className="text-[16px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF]">
                    Dual-Lens Synthesis
                  </h4>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1 clay-pill p-1 rounded-xl">
                  <button
                    onClick={() => setActiveLens("patient")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border-none transition-all flex items-center gap-1.5 ${
                      activeLens === "patient"
                        ? "bg-[#7B56DB] text-white shadow-sm"
                        : "text-[#7A748A] dark:text-[#9E98B4] hover:text-[#2E2544]"
                    }`}
                  >
                    <User size={13} />
                    <span>Patient Lens</span>
                  </button>
                  <button
                    onClick={() => setActiveLens("clinician")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border-none transition-all flex items-center gap-1.5 ${
                      activeLens === "clinician"
                        ? "bg-[#7B56DB] text-white shadow-sm"
                        : "text-[#7A748A] dark:text-[#9E98B4] hover:text-[#2E2544]"
                    }`}
                  >
                    <Stethoscope size={13} />
                    <span>Clinician Lens</span>
                  </button>
                </div>
              </div>

              {/* Lens Content */}
              <div className="clay-card p-4 rounded-2xl flex-1 overflow-y-auto max-h-[380px] scrollbar-none text-[13px] leading-relaxed text-[#4A435E] dark:text-[#C5BFD6]">
                {activeLens === "patient" ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-[#7B56DB] dark:text-[#D4C5F7] font-bold text-xs uppercase tracking-wider mb-2">
                      <Sparkles size={14} />
                      <span>Empathetic Mental Clarity Narrative</span>
                    </div>
                    <div className="prose dark:prose-invert text-xs space-y-2">
                      {selectedReport.patient_summary.split("\n\n").map((para, i) => (
                        <p key={i} className="mb-2">
                          {para.replace(/###/g, "").replace(/\*\*/g, "")}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-[#EC4899] font-bold text-xs uppercase tracking-wider mb-2">
                      <Activity size={14} />
                      <span>Objective Electrophysiology Findings</span>
                    </div>
                    <div className="prose dark:prose-invert text-xs space-y-2 font-mono text-[11.5px]">
                      {selectedReport.clinician_summary.split("\n\n").map((para, i) => (
                        <p key={i} className="mb-2">
                          {para.replace(/###/g, "")}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Triangulation Matrix Card (Linking FACS & Graph Entities) ── */}
            <div className="clay-card p-5 flex flex-col" style={{ borderRadius: 26 }}>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Crosshair size={18} className="text-[#EC4899]" />
                  <h4 className="text-[16px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF]">
                    Neuro-Behavioral Triangulation
                  </h4>
                </div>
                <span className="clay-pill px-2.5 py-1 text-[11px] font-black text-[#10B981] dark:text-[#34D399]">
                  {primaryCorrelation ? `${primaryCorrelation.concordance_level.toUpperCase()} CONCORDANCE` : "HIGH CONCORDANCE"}
                </span>
              </div>
              <p className="text-[11.5px] font-medium text-[#8E88A4] dark:text-[#9E98B4] mb-3">
                Linking electrophysiology findings with facial Action Units (FACS) and dialogue knowledge graphs.
              </p>

              {/* FACS Action Units Radar / Bars */}
              <div className="space-y-2 mb-4">
                {[
                  {
                    code: "AU04",
                    name: "Brow Furrower (Corrugator)",
                    score: facs.au04_brow_furrow,
                    detail: "Associated with depressive affect & mental strain",
                  },
                  {
                    code: "AU12",
                    name: "Lip Corner Puller (Smile)",
                    score: facs.au12_zygomatic_smile,
                    detail: "Suppressed during depressive withdrawal",
                  },
                  {
                    code: "AU15",
                    name: "Lip Corner Depressor",
                    score: facs.au15_lip_depressor,
                    detail: "Active in persistent sorrow / anhedonia",
                  },
                  {
                    code: "AU01",
                    name: "Inner Brow Raiser",
                    score: facs.au01_brow_raiser,
                    detail: "Reflects acute emotional anxiety & vigilance",
                  },
                ].map((au) => (
                  <div key={au.code} className="clay-card p-2.5 rounded-xl flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="clay-pill px-1.5 py-0.5 text-[10px] font-black text-[#7B56DB]">
                        {au.code}
                      </span>
                      <div className="truncate">
                        <div className="font-bold text-[#2E2544] dark:text-white truncate">
                          {au.name}
                        </div>
                        <div className="text-[10px] text-[#8E88A4] truncate">
                          {au.detail}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-16 h-2 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.round(au.score * 100)}%`,
                            backgroundColor: au.score > 0.6 ? "#EC4899" : "#10B981",
                          }}
                        />
                      </div>
                      <span className="text-xs font-black text-[#2E2544] dark:text-white w-8 text-right">
                        {(au.score * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Linked Knowledge Graph Entities */}
              {primaryCorrelation?.graph_entities && primaryCorrelation.graph_entities.length > 0 && (
                <div className="mt-2 pt-3 border-t border-black/5 dark:border-white/5">
                  <span className="text-[11px] font-bold text-[#8E88A4] block mb-2">
                    Convergent Knowledge Graph Entities:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {primaryCorrelation.graph_entities.map((ent, idx) => (
                      <span
                        key={idx}
                        className="clay-pill px-2.5 py-1 text-[11px] font-bold text-[#7B56DB] dark:text-[#D4C5F7] flex items-center gap-1"
                      >
                        <Zap size={11} />
                        <span>{ent.name}</span>
                        <span className="opacity-50 text-[9px]">({ent.type})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Statutory Non-Diagnostic Regulatory Disclaimer ── */}
      <div className="mt-8 clay-card p-4 rounded-2xl flex items-start gap-3 text-xs font-medium text-[#7A748A] dark:text-[#9E98B4] border border-amber-500/20 bg-amber-500/5">
        <ShieldAlert size={18} className="text-amber-500 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-[#2E2544] dark:text-white font-bold">
            Statutory Medical Notice:{" "}
          </strong>
          This portal provides quantitative research and clinical decision support telemetry derived from resting-state EEG records (Mumtaz et al., Figshare 4244171 cohort). It is not an FDA-cleared diagnostic device and should never replace qualified clinical psychiatric evaluation.
        </p>
      </div>

      {/* ── Upload Modal ── */}
      <AnimatePresence>
        {showUploadModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="clay-card p-6 max-w-lg w-full relative"
              style={{ borderRadius: 28 }}
            >
              <h3 className="text-[19px] font-black text-[#2E2544] dark:text-white mb-2">
                Upload Clinical EEG Recording
              </h3>
              <p className="text-xs text-[#7A748A] dark:text-[#9E98B4] mb-5">
                Upload a raw European Data Format (.edf) recording. The pipeline will apply DSP 50/60Hz notch filtering, 0.5-45Hz Butterworth bandpass, compute Welch PSD band powers, and extract Frontal Alpha Asymmetry (FAA).
              </p>

              {/* State Choice */}
              <div className="mb-4">
                <label className="text-xs font-bold text-[#2E2544] dark:text-white block mb-1.5">
                  Recording Condition:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRecordingStateChoice("eyes_closed")}
                    className={`clay-pill py-2 text-xs font-bold rounded-xl cursor-pointer border-none ${
                      recordingStateChoice === "eyes_closed"
                        ? "bg-[#7B56DB] text-white"
                        : "text-[#6B6380] dark:text-[#B4ADC6]"
                    }`}
                  >
                    Eyes Closed (EC) — Recommended
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecordingStateChoice("eyes_open")}
                    className={`clay-pill py-2 text-xs font-bold rounded-xl cursor-pointer border-none ${
                      recordingStateChoice === "eyes_open"
                        ? "bg-[#7B56DB] text-white"
                        : "text-[#6B6380] dark:text-[#B4ADC6]"
                    }`}
                  >
                    Eyes Open (EO)
                  </button>
                </div>
              </div>

              {/* Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="clay-card border-2 border-dashed border-[#7B56DB]/40 hover:border-[#7B56DB] p-8 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-101"
              >
                <Upload size={36} className="text-[#7B56DB] mb-3 animate-bounce" />
                <span className="text-sm font-extrabold text-[#2E2544] dark:text-white">
                  Drop .edf file here or click to browse
                </span>
                <span className="text-[11px] font-semibold text-[#8E88A4] mt-1">
                  Standard 10-20 montage (19 or 21 channels @ 256 Hz)
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".edf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                />
              </div>

              {/* Progress message if uploading */}
              {isUploading && (
                <div className="mt-4 p-3 clay-card rounded-xl flex items-center gap-3">
                  <RefreshCw className="animate-spin text-[#7B56DB]" size={18} />
                  <span className="text-xs font-bold text-[#7B56DB]">
                    {uploadProgress || "Processing EEG file..."}
                  </span>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex justify-end gap-2.5 mt-5">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  disabled={isUploading}
                  className="clay-button px-4 py-2 rounded-xl text-xs font-bold text-[#7A748A] cursor-pointer border-none"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
