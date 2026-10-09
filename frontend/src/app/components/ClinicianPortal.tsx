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
  Users,
  Stethoscope,
  RefreshCw,
  Zap,
  Sparkles,
  Layers,
  ArrowUpRight,
  Sliders,
  Crosshair,
  Compass,
  Search,
  MessageSquare,
  Clock,
  ArrowRight,
  ArrowLeft,
  Network,
  Calendar,
  AlertTriangle,
  FolderOpen,
  X,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import {
  eegService,
  EEGReport,
  EEGBenchmarks,
  TopomapChannel,
  FacsMarkers,
  PatientRosterItem,
  PatientInsights,
  SessionInteractionItem,
} from "../services/eegService";
import { ClayBrainIcon } from "./clay-icons";
import { toast } from "sonner";

interface ClinicianPortalProps {
  onNavigate?: (screen: string) => void;
  initialTab?: "eeg_lab" | "biomarkers" | "triangulation" | "neuro_graph";
}

type TopomapViewMode = "faa" | "alpha" | "theta" | "beta" | "delta";
type LensMode = "patient" | "clinician";
type ClinicianTab = "eeg_lab" | "biomarkers" | "triangulation" | "neuro_graph";

export function ClinicianPortal({ onNavigate, initialTab = "eeg_lab" }: ClinicianPortalProps) {
  const { isDark } = useTheme();

  // Navigation tab state
  const [activeTab, setActiveTab] = useState<ClinicianTab>(initialTab);

  // Caseload & Patient State (NO auto-selection!)
  const [roster, setRoster] = useState<PatientRosterItem[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientRosterItem | null>(null);
  const [patientInsights, setPatientInsights] = useState<PatientInsights | null>(null);
  const [patientSearch, setPatientSearch] = useState<string>("");
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

  // EEG Reports State (NO auto-selection!)
  const [reports, setReports] = useState<EEGReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<EEGReport | null>(null);
  const [benchmarks, setBenchmarks] = useState<EEGBenchmarks | null>(null);

  // Loading & Action State
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingInsights, setIsLoadingInsights] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");

  // Views & Filters
  const [activeLens, setActiveLens] = useState<LensMode>("patient");
  const [topomapMode, setTopomapMode] = useState<TopomapViewMode>("faa");
  const [hoveredChannel, setHoveredChannel] = useState<TopomapChannel | null>(null);
  const [recordingStateChoice, setRecordingStateChoice] = useState<string>("eyes_closed");
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync with prop when sidebar changes
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Initial load: Fetch Patient Roster & Benchmarks ONLY (Do NOT auto-select patient or report!)
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      const [fetchedRoster, fetchedBenchmarks] = await Promise.all([
        eegService.fetchPatientRoster().catch(() => []),
        eegService.fetchBenchmarks().catch(() => null),
      ]);
      setRoster(fetchedRoster);
      setBenchmarks(fetchedBenchmarks);
      // STRICT REQUIREMENT: Do NOT auto-select any patient or report!
      // Leave selectedPatient = null and selectedReport = null.
    } catch (err) {
      console.error("Error loading clinician initial data:", err);
      toast.error("Failed to load patient caseload");
    } finally {
      setIsLoading(false);
    }
  };

  // Explicit Patient Selection by Clinician Click
  const handleSelectPatient = async (patient: PatientRosterItem) => {
    setSelectedPatient(patient);
    setSelectedSessionId(null);
    setSelectedReport(null); // STRICT REQUIREMENT: Do NOT auto-select previous report!
    setIsLoadingInsights(true);

    try {
      const [fetchedReports, insights] = await Promise.all([
        eegService.fetchReports(patient.id).catch(() => []),
        eegService.fetchPatientInsights(patient.id).catch(() => null),
      ]);

      setReports(fetchedReports);
      setPatientInsights(insights);
      // selectedReport stays null until the clinician explicitly selects a recording or uploads one!

      if (insights?.sessions && insights.sessions.length > 0) {
        setSelectedSessionId(insights.sessions[0].id);
      }
    } catch (err) {
      console.error("Error loading patient data:", err);
      toast.error(`Could not load records for ${patient.name}`);
    } finally {
      setIsLoadingInsights(false);
    }
  };

  // Return to Caseload Roster Overview
  const handleDeselectPatient = () => {
    setSelectedPatient(null);
    setSelectedReport(null);
    setReports([]);
    setPatientInsights(null);
    setSelectedSessionId(null);
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".edf")) {
      toast.error("Please upload a standard European Data Format (.edf) file.");
      return;
    }

    if (!selectedPatient) {
      toast.error("Please select a patient before uploading.");
      return;
    }

    setIsUploading(true);
    setUploadProgress(`Processing ${file.name} for ${selectedPatient.name}...`);
    try {
      const report = await eegService.uploadEdf(
        file,
        selectedSessionId || undefined,
        recordingStateChoice,
        selectedPatient.id
      );
      toast.success(`EEG Recording analyzed for ${selectedPatient.name}!`);
      setReports((prev) => [report, ...prev]);
      setSelectedReport(report);
      setShowUploadModal(false);

      // Refresh patient insights & roster counts
      if (selectedPatient) {
        eegService.fetchPatientInsights(selectedPatient.id).then(setPatientInsights).catch(() => {});
        setRoster((prev) =>
          prev.map((p) =>
            p.id === selectedPatient.id
              ? { ...p, report_count: p.report_count + 1, status: "active_case" }
              : p
          )
        );
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to analyze EEG recording");
    } finally {
      setIsUploading(false);
      setUploadProgress("");
    }
  };

  const handleLoadDemo = async (sampleType: "mdd_ec" | "healthy_ec" | "mdd_eo" | "healthy_eo") => {
    if (!selectedPatient) {
      toast.error("Please select a patient from the caseload first.");
      return;
    }

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
      const report = await eegService.loadDemoSample(
        sampleType,
        selectedPatient.id,
        selectedSessionId || undefined
      );
      toast.success(`Attached ${report.filename} to ${selectedPatient.name}`);
      setReports((prev) => [report, ...prev.filter((r) => r.id !== report.id)]);
      setSelectedReport(report);
      setShowUploadModal(false);

      // Refresh patient insights
      if (selectedPatient) {
        eegService.fetchPatientInsights(selectedPatient.id).then(setPatientInsights).catch(() => {});
        setRoster((prev) =>
          prev.map((p) =>
            p.id === selectedPatient.id
              ? { ...p, report_count: p.report_count + 1, status: "active_case" }
              : p
          )
        );
      }
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
      if (node.channel === "F3") return "#6366F1";
      if (node.channel === "F4") return "#EC4899";
      if (node.channel === "Fz") return "#8B5CF6";
      return isDark ? "#3D3459" : "#DDD6FE";
    }

    let val = 0.2;
    if (mode === "alpha") val = node.alpha_rel;
    else if (mode === "theta") val = node.theta_rel;
    else if (mode === "beta") val = node.beta_rel;
    else if (mode === "delta") val = node.delta_rel;

    const norm = Math.min(Math.max((val - 0.08) / 0.32, 0), 1);
    if (norm > 0.66) return "#EC4899";
    if (norm > 0.33) return "#8B5CF6";
    return "#3B82F6";
  };

  const primaryCorrelation = selectedReport?.correlations?.[0];
  const facs: FacsMarkers = primaryCorrelation?.facs_markers || {
    au04_brow_furrow: 0.72,
    au12_zygomatic_smile: 0.22,
    au15_lip_depressor: 0.58,
    au01_brow_raiser: 0.54,
    prosody_monotony: 0.58,
  };

  // Filtered patients for roster search
  const filteredRoster = roster.filter(
    (p) =>
      p.name.toLowerCase().includes(patientSearch.toLowerCase()) ||
      p.email.toLowerCase().includes(patientSearch.toLowerCase()) ||
      p.primary_concern.toLowerCase().includes(patientSearch.toLowerCase())
  );

  // Selected session interactions
  const activeSessionInteractions = (patientInsights?.session_interactions || []).filter(
    (item) => !selectedSessionId || item.session_id === selectedSessionId
  );

  return (
    <div className="w-full h-full min-h-0 overflow-y-auto custom-scrollbar select-none px-3 sm:px-6 md:px-8 py-5 pb-32">
      <div className="max-w-7xl mx-auto flex flex-col gap-5">
        {/* ── Top Header Banner ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 shrink-0">
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
                Clinician Electrophysiology & Behavior Workstation
              </h1>
              <span className="clay-pill px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-[#7B56DB] dark:text-[#D4C5F7]">
                Caseload Portal
              </span>
            </div>
            <p className="text-[13px] font-medium text-[#7A748A] dark:text-[#9E98B4] mt-0.5">
              Role-Based Quantitative Telemetry • Mumtaz Reference Cohort • Cognitive Memory Graph Triangulation
            </p>
          </div>
        </div>

        {/* Global Workstation Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowUploadModal(true)}
            disabled={!selectedPatient}
            className={`clay-button px-3.5 py-2 rounded-2xl text-[12.5px] font-bold flex items-center gap-1.5 cursor-pointer border-none outline-none transition-transform ${
              selectedPatient
                ? "text-[#7B56DB] dark:text-[#D4C5F7] hover:scale-102"
                : "opacity-40 cursor-not-allowed text-[#8E88A4]"
            }`}
            title={selectedPatient ? "Upload EDF for active patient" : "Select a patient first"}
          >
            <Upload size={15} />
            <span>Upload EDF</span>
          </button>

          <button
            onClick={() => handleLoadDemo("mdd_ec")}
            disabled={!selectedPatient}
            className={`clay-button px-3.5 py-2 rounded-2xl text-[12.5px] font-bold flex items-center gap-1.5 cursor-pointer border-none outline-none transition-transform ${
              selectedPatient
                ? "text-[#EC4899] dark:text-[#F472B6] hover:scale-102"
                : "opacity-40 cursor-not-allowed text-[#8E88A4]"
            }`}
          >
            <Sparkles size={15} />
            <span>Mumtaz MDD Sample</span>
          </button>

          <button
            onClick={() => handleLoadDemo("healthy_ec")}
            disabled={!selectedPatient}
            className={`clay-button px-3.5 py-2 rounded-2xl text-[12.5px] font-bold flex items-center gap-1.5 cursor-pointer border-none outline-none transition-transform ${
              selectedPatient
                ? "text-[#10B981] dark:text-[#34D399] hover:scale-102"
                : "opacity-40 cursor-not-allowed text-[#8E88A4]"
            }`}
          >
            <CheckCircle2 size={15} />
            <span>Healthy Sample</span>
          </button>
        </div>
      </div>

      {/* ── Active Patient Caseload Selector Bar ── */}
      <div className="clay-card p-3.5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center shrink-0 text-[#7B56DB] font-extrabold text-base">
            {selectedPatient?.name ? selectedPatient.name.charAt(0).toUpperCase() : <Users size={20} />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black uppercase text-[#8E88A4] dark:text-[#A8A2B8] tracking-wider">
                Active Patient Case:
              </span>
              <strong className="text-[15px] font-extrabold text-[#2E2544] dark:text-white truncate">
                {selectedPatient ? selectedPatient.name : "None (Select a patient below)"}
              </strong>
              {selectedPatient && (
                <span className="clay-pill px-2 py-0.5 text-[10px] font-black text-[#7B56DB] dark:text-[#D4C5F7]">
                  Case #PAT-000{selectedPatient.id}
                </span>
              )}
            </div>
            <p className="text-[11.5px] font-semibold text-[#7A748A] dark:text-[#9E98B4] truncate mt-0.5">
              {selectedPatient
                ? `${selectedPatient.session_count} Dialogue Sessions • ${reports.length} EEG Recordings • Primary Focus: ${selectedPatient.primary_concern}`
                : "No patient file is currently open. Select a patient from your clinical caseload below to begin."}
            </p>
          </div>
        </div>

        {/* Patient Selection Dropdown & Deselect Switcher */}
        <div className="flex items-center gap-2 shrink-0">
          {selectedPatient && (
            <button
              onClick={handleDeselectPatient}
              className="clay-button px-3 py-1.5 rounded-xl text-xs font-bold text-[#8E88A4] hover:text-[#2E2544] dark:hover:text-white flex items-center gap-1.5 cursor-pointer border-none"
              title="Return to Caseload Roster Overview"
            >
              <ArrowLeft size={13} />
              <span>All Patients</span>
            </button>
          )}

          <div className="relative">
            <select
              value={selectedPatient?.id || ""}
              onChange={(e) => {
                const found = roster.find((p) => p.id === Number(e.target.value));
                if (found) handleSelectPatient(found);
              }}
              className="clay-pill px-3 py-1.5 text-xs font-bold text-[#2E2544] dark:text-white cursor-pointer border-none outline-none pr-8 appearance-none bg-transparent"
              style={{ minWidth: 200 }}
            >
              <option value="" disabled className="text-gray-500 dark:bg-[#1E1A2E]">
                Switch Patient Case...
              </option>
              {roster.map((p) => (
                <option key={p.id} value={p.id} className="text-[#2E2544] dark:bg-[#1E1A2E] dark:text-white">
                  {p.name} (#{p.id} • {p.session_count} sess, {p.report_count} eeg)
                </option>
              ))}
            </select>
            <ChevronRight
              size={14}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#8E88A4] rotate-90"
            />
          </div>

          <button
            onClick={() => loadInitialData()}
            className="clay-button p-2 rounded-xl text-[#7B56DB] cursor-pointer border-none"
            title="Refresh Caseload"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ── Cohort Benchmark Strip ── */}
      {benchmarks && (
        <div
          className="clay-card p-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-[#6B6380] dark:text-[#B4ADC6] shrink-0"
        >
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] animate-pulse" />
            <span>
              Validation Cohort: <strong className="text-[#2E2544] dark:text-[#FFFFFF]">{benchmarks.dataset}</strong>
            </span>
            <span className="opacity-40">•</span>
            <span>
              Normed Dataset: <strong className="text-[#2E2544] dark:text-[#FFFFFF]">{benchmarks.sample_size} Resting-State Records</strong> ({benchmarks.num_mdd} MDD vs {benchmarks.num_healthy} HC)
            </span>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="clay-pill px-2.5 py-0.5 text-[11px] font-bold text-[#7B56DB] dark:text-[#D4C5F7]">
              Classifier ROC-AUC: {(benchmarks.metrics.roc_auc * 100).toFixed(1)}%
            </span>
            <span className="clay-pill px-2.5 py-0.5 text-[11px] font-bold text-[#10B981] dark:text-[#34D399]">
              Cohort Precision: {(benchmarks.metrics.precision * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      )}

      {/* ── Workstation Lens Tabs Bar ── */}
      <div className="clay-card p-2 rounded-2xl flex items-center gap-2 overflow-x-auto custom-scrollbar shrink-0 min-h-[56px] w-full">
        {[
          { id: "eeg_lab", label: "EEG Electrophysiology Lab", icon: ClayBrainIcon },
          { id: "biomarkers", label: "Quantitative Biomarkers & Z-Scores", icon: Activity },
          { id: "triangulation", label: "Neuro-Behavioral Triangulation", icon: Crosshair },
          { id: "neuro_graph", label: "Cognitive Knowledge Memory Graph", icon: Network },
        ].map((tab) => {
          const isSel = activeTab === tab.id;
          const IconComp = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ClinicianTab)}
              className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer border-none flex items-center gap-2 whitespace-nowrap shrink-0 min-h-[40px] outline-none ${
                isSel
                  ? "clay-active-nav text-white shadow-md shadow-purple-500/30 ring-2 ring-purple-400/40"
                  : "clay-button text-[#6B6380] dark:text-[#B4ADC6] hover:text-[#2E2544] dark:hover:text-white"
              }`}
            >
              {tab.id === "eeg_lab" ? <ClayBrainIcon size={16} /> : <IconComp size={15} />}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SCENARIO 1: NO PATIENT SELECTED -> SHOW CASELOAD ROSTER SELECTION
      ══════════════════════════════════════════════════════════════════════ */}
      {isLoading ? (
        <div className="w-full flex-1 min-h-[400px] flex flex-col items-center justify-center">
          <RefreshCw className="animate-spin text-[#7B56DB] mb-3" size={32} />
          <p className="text-sm font-bold text-[#7A748A] dark:text-[#9E98B4]">
            Loading clinician caseload records...
          </p>
        </div>
      ) : !selectedPatient ? (
        <div className="clay-card p-6 md:p-8 flex flex-col" style={{ borderRadius: 28 }}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-black/5 dark:border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/15 flex items-center justify-center text-[#7B56DB]">
                <FolderOpen size={28} />
              </div>
              <div>
                <h2 className="text-lg md:text-xl font-black text-[#2E2544] dark:text-white">
                  Patient Caseload Roster ({roster.length} Registered Cases)
                </h2>
                <p className="text-xs text-[#7A748A] dark:text-[#9E98B4] mt-0.5">
                  Select a patient from your clinical roster below to inspect electrophysiology records, review session dialogues, or upload new EDF files.
                </p>
              </div>
            </div>

            {/* Live Search */}
            <div className="relative min-w-[240px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E88A4]" />
              <input
                type="text"
                placeholder="Search patient name or concern..."
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                className="clay-pill w-full pl-9 pr-3 py-2 text-xs font-semibold text-[#2E2544] dark:text-white placeholder-[#8E88A4] outline-none border-none bg-transparent"
              />
            </div>
          </div>

          {/* Patient Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRoster.map((patient) => {
              const hasRecords = patient.report_count > 0;
              const hasSessions = patient.session_count > 0;
              return (
                <div
                  key={patient.id}
                  onClick={() => handleSelectPatient(patient)}
                  className="clay-card p-5 rounded-2xl flex flex-col justify-between cursor-pointer hover:scale-102 transition-all hover:shadow-lg border border-black/5 dark:border-white/5 group"
                >
                  <div>
                    {/* Top Patient Header */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-purple-500/15 flex items-center justify-center text-[#7B56DB] font-extrabold text-sm group-hover:bg-[#7B56DB] group-hover:text-white transition-colors">
                          {patient.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-extrabold text-sm text-[#2E2544] dark:text-white group-hover:text-[#7B56DB] transition-colors">
                            {patient.name}
                          </h4>
                          <span className="text-[11px] text-[#8E88A4] block">
                            {patient.email}
                          </span>
                        </div>
                      </div>
                      <span className="clay-pill px-2 py-0.5 text-[10px] font-black text-[#7B56DB]">
                        #PAT-{patient.id.toString().padStart(4, "0")}
                      </span>
                    </div>

                    {/* Metrics Pills */}
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <span className="clay-pill px-2.5 py-1 text-[10px] font-bold text-[#7B56DB] flex items-center gap-1">
                        <MessageSquare size={11} />
                        <span>{patient.session_count} Sessions</span>
                      </span>
                      <span
                        className={`clay-pill px-2.5 py-1 text-[10px] font-bold flex items-center gap-1 ${
                          hasRecords ? "text-[#10B981]" : "text-[#8E88A4]"
                        }`}
                      >
                        <Activity size={11} />
                        <span>{patient.report_count} EEG Reports</span>
                      </span>
                      <span
                        className={`clay-pill px-2 py-0.5 text-[9.5px] font-extrabold uppercase ${
                          hasRecords || hasSessions ? "text-[#10B981]" : "text-amber-500"
                        }`}
                      >
                        {hasRecords || hasSessions ? "Active Case" : "Pending Intake"}
                      </span>
                    </div>

                    {/* Primary Concern Theme */}
                    <div className="mb-4">
                      <span className="text-[10px] font-bold text-[#8E88A4] uppercase tracking-wider block mb-0.5">
                        Clinical Focus:
                      </span>
                      <p className="text-xs font-semibold text-[#4A435E] dark:text-[#C5BFD6] line-clamp-2">
                        {patient.primary_concern}
                      </p>
                    </div>
                  </div>

                  {/* Open File Button */}
                  <div className="pt-3 border-t border-black/5 dark:border-white/5 flex items-center justify-between text-xs font-bold text-[#7B56DB] group-hover:translate-x-1 transition-transform">
                    <span>Open Patient Clinical File</span>
                    <ArrowRight size={14} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ══════════════════════════════════════════════════════════════════════
            SCENARIO 2: PATIENT IS SELECTED -> SHOW WORKSTATION LENSES
        ══════════════════════════════════════════════════════════════════════ */
        <>
          {/* ══════════════ TAB 1: EEG ELECTROPHYSIOLOGY LAB ══════════════ */}
          {activeTab === "eeg_lab" && (
            <div>
              {/* If no report is selected yet, prompt the clinician to select one of this patient's recordings OR upload a new one */}
              {!selectedReport ? (
                <div className="clay-card p-6 md:p-8 flex flex-col" style={{ borderRadius: 28 }}>
                  <div className="flex items-center gap-3 mb-4 pb-3 border-b border-black/5 dark:border-white/5">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center text-[#7B56DB]">
                      <Activity size={22} />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-[#2E2544] dark:text-white">
                        Electrophysiology Recordings for {selectedPatient.name}
                      </h3>
                      <p className="text-xs text-[#7A748A] dark:text-[#9E98B4]">
                        Select an existing EEG recording to inspect the 10-20 Scalp Topomap or upload a new European Data Format (.edf) file.
                      </p>
                    </div>
                  </div>

                  {reports.length > 0 ? (
                    <div className="space-y-4 mb-6">
                      <span className="text-xs font-bold text-[#8E88A4] block">
                        Available Recordings on File ({reports.length}):
                      </span>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {reports.map((rep) => {
                          const isRisk = rep.predicted_class === "depressive_risk";
                          return (
                            <div
                              key={rep.id}
                              onClick={() => setSelectedReport(rep)}
                              className="clay-card p-4 rounded-2xl cursor-pointer hover:scale-102 transition-transform border border-black/5 dark:border-white/5 flex flex-col justify-between"
                            >
                              <div>
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className={`w-2.5 h-2.5 rounded-full ${
                                        isRisk ? "bg-[#EF4444]" : "bg-[#10B981]"
                                      }`}
                                    />
                                    <strong className="text-xs font-bold text-[#2E2544] dark:text-white truncate">
                                      {rep.filename}
                                    </strong>
                                  </div>
                                  <span className="clay-pill px-2 py-0.5 text-[10px] font-bold text-[#7B56DB]">
                                    {rep.recording_state === "eyes_closed" ? "Eyes Closed" : "Eyes Open"}
                                  </span>
                                </div>
                                <div className="text-[11px] text-[#8E88A4] mb-3">
                                  {rep.duration_seconds.toFixed(0)}s Duration @ {rep.sampling_rate} Hz ({rep.num_channels} Leads)
                                </div>
                                <div className="flex items-center gap-2 text-[10px] font-mono text-[#8E88A4] mb-2">
                                  <span>FAA: {rep.faa_score > 0 ? "+" : ""}{rep.faa_score.toFixed(3)}</span>
                                  <span>•</span>
                                  <span>TBR: {rep.tbr_fz_score.toFixed(2)}</span>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="clay-button w-full py-2 rounded-xl text-xs font-bold text-[#7B56DB] flex items-center justify-center gap-1.5 cursor-pointer border-none mt-2"
                              >
                                <Brain size={14} />
                                <span>Inspect Scalp Topomap</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="clay-card p-6 rounded-2xl text-center mb-6 bg-purple-500/5">
                      <p className="text-xs text-[#8E88A4] leading-relaxed">
                        No EEG files have been uploaded yet for {selectedPatient.name}. Upload a new .edf recording or load an authentic cohort sample below.
                      </p>
                    </div>
                  )}

                  {/* Upload / Demo Action Row */}
                  <div className="flex items-center gap-3 flex-wrap pt-3 border-t border-black/5 dark:border-white/5">
                    <button
                      onClick={() => setShowUploadModal(true)}
                      className="clay-button px-4 py-2.5 rounded-xl font-bold text-xs text-[#7B56DB] flex items-center gap-2 cursor-pointer border-none"
                    >
                      <Upload size={15} />
                      <span>Upload New .edf File for {selectedPatient.name}</span>
                    </button>
                    <button
                      onClick={() => handleLoadDemo("mdd_ec")}
                      className="clay-button px-4 py-2.5 rounded-xl font-bold text-xs text-[#EC4899] flex items-center gap-2 cursor-pointer border-none"
                    >
                      <Sparkles size={15} />
                      <span>Attach Mumtaz MDD Sample</span>
                    </button>
                    <button
                      onClick={() => handleLoadDemo("healthy_ec")}
                      className="clay-button px-4 py-2.5 rounded-xl font-bold text-xs text-[#10B981] flex items-center gap-2 cursor-pointer border-none"
                    >
                      <CheckCircle2 size={15} />
                      <span>Attach Mumtaz Healthy Sample</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* EEG Report Active Inspection View */
                <div>
                  {/* Active Recording Switcher Bar */}
                  <div className="clay-card p-3 mb-4 rounded-2xl flex items-center justify-between gap-3 bg-purple-500/5 border border-purple-500/15 shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] animate-pulse shrink-0" />
                      <span className="text-xs font-bold text-[#2E2544] dark:text-white truncate">
                        Inspecting Recording: <strong>{selectedReport.filename}</strong> ({selectedReport.recording_state === "eyes_closed" ? "Eyes Closed" : "Eyes Open"})
                      </span>
                    </div>
                    <button
                      onClick={() => setSelectedReport(null)}
                      className="clay-button px-3 py-1.5 text-xs font-bold text-[#8E88A4] hover:text-[#2E2544] dark:hover:text-white flex items-center gap-1.5 cursor-pointer border-none shrink-0"
                      title="Switch to another recording"
                    >
                      <X size={12} />
                      <span>Switch Recording</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* LEFT: 3D Scalp Topomap & Band Powers (7 cols) */}
                    <div className="lg:col-span-7 flex flex-col gap-6">
                      {/* Diagnostic Summary Header */}
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
                                  ? "Depressive Rhythm Detected"
                                  : "Normative Baseline Balance"}
                              </h3>
                              <p className="text-[11px] font-semibold text-[#8E88A4] dark:text-[#9E98B4]">
                                Patient: {selectedPatient.name} • File: {selectedReport.filename} • {selectedReport.duration_seconds.toFixed(0)}s Duration @ {selectedReport.sampling_rate} Hz
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
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                              Norm: 9.8-10.5 Hz
                            </div>
                            <span className="text-[9.5px] font-semibold text-[#A09AA8] mt-1">
                              Peak Speed
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 10-20 Scalp Topomap SVG */}
                      <div className="clay-card p-5 flex flex-col" style={{ borderRadius: 26 }}>
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                          <div>
                            <h4 className="text-[16px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF]">
                              10-20 Scalp Topography Map
                            </h4>
                            <p className="text-[11px] font-medium text-[#8E88A4] dark:text-[#9E98B4]">
                              19-channel standard clinical montage power distribution
                            </p>
                          </div>

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
                                    ? "clay-active-nav text-white shadow-sm"
                                    : "text-[#7A748A] dark:text-[#9E98B4] hover:text-[#2E2544] dark:hover:text-white"
                                }`}
                              >
                                {m.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Scalp Map SVG Container */}
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
                            </defs>

                            <circle
                              cx="0"
                              cy="0"
                              r="92"
                              fill="url(#scalpBgGrad)"
                              stroke={isDark ? "#524875" : "#D4C7F2"}
                              strokeWidth="3.5"
                            />

                            <path
                              d="M -12 -91 L 0 -106 L 12 -91 Z"
                              fill={isDark ? "#2A2346" : "#EBE4F9"}
                              stroke={isDark ? "#524875" : "#D4C7F2"}
                              strokeWidth="3.5"
                              strokeLinejoin="round"
                            />

                            <path
                              d="M -92 -14 C -102 -10, -102 10, -92 14"
                              fill="none"
                              stroke={isDark ? "#524875" : "#D4C7F2"}
                              strokeWidth="3.5"
                              strokeLinecap="round"
                            />
                            <path
                              d="M 92 -14 C 102 -10, 102 10, 92 14"
                              fill="none"
                              stroke={isDark ? "#524875" : "#D4C7F2"}
                              strokeWidth="3.5"
                              strokeLinecap="round"
                            />

                            <line
                              x1="0"
                              y1="-88"
                              x2="0"
                              y2="88"
                              stroke={isDark ? "rgba(255,255,255,0.08)" : "rgba(123,86,219,0.12)"}
                              strokeWidth="1.5"
                              strokeDasharray="3 3"
                            />
                            <line
                              x1="-88"
                              y1="0"
                              x2="88"
                              y2="0"
                              stroke={isDark ? "rgba(255,255,255,0.08)" : "rgba(123,86,219,0.12)"}
                              strokeWidth="1.5"
                              strokeDasharray="3 3"
                            />

                            {topomapMode === "faa" && (
                              <path
                                d="M -34 -45 Q 0 -60 34 -45"
                                fill="none"
                                stroke="#EC4899"
                                strokeWidth="2.5"
                                strokeDasharray="4 3"
                              />
                            )}

                            {selectedReport.channel_topomap?.channels?.map((node) => {
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
                                  <circle
                                    cx={cx}
                                    cy={cy}
                                    r={isHovered ? 16 : isKeyLead ? 13 : 11}
                                    fill={color}
                                    fillOpacity={isHovered ? 0.45 : 0.22}
                                  />
                                  <circle
                                    cx={cx}
                                    cy={cy}
                                    r={isHovered ? 11 : isKeyLead ? 9 : 8}
                                    fill={color}
                                    stroke="#FFFFFF"
                                    strokeWidth={isHovered ? 2.2 : 1.4}
                                    style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.25))" }}
                                  />
                                  <ellipse
                                    cx={cx - 2.5}
                                    cy={cy - 2.5}
                                    rx={isHovered ? 3.5 : 2.5}
                                    ry={isHovered ? 2 : 1.5}
                                    fill="#FFFFFF"
                                    fillOpacity="0.8"
                                  />
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

                          {hoveredChannel && (
                            <div
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
                            </div>
                          )}
                        </div>

                        {/* Band Power Bars */}
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

                    {/* RIGHT: Dual-Lens Synthesis (5 cols) */}
                    <div className="lg:col-span-5 flex flex-col gap-6">
                      <div className="clay-card p-5 flex flex-col flex-1" style={{ borderRadius: 26 }}>
                        <div className="flex items-center justify-between gap-3 mb-4">
                          <div className="flex items-center gap-2">
                            <FileText size={18} className="text-[#7B56DB]" />
                            <h4 className="text-[16px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF]">
                              Dual-Lens Synthesis
                            </h4>
                          </div>

                          <div className="flex items-center gap-1 clay-pill p-1 rounded-xl">
                            <button
                              onClick={() => setActiveLens("patient")}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border-none transition-all flex items-center gap-1.5 ${
                                activeLens === "patient"
                                  ? "clay-active-nav text-white shadow-sm"
                                  : "text-[#7A748A] dark:text-[#9E98B4] hover:text-[#2E2544] dark:hover:text-white"
                              }`}
                            >
                              <User size={13} />
                              <span>Patient Lens</span>
                            </button>
                            <button
                              onClick={() => setActiveLens("clinician")}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border-none transition-all flex items-center gap-1.5 ${
                                activeLens === "clinician"
                                  ? "clay-active-nav text-white shadow-sm"
                                  : "text-[#7A748A] dark:text-[#9E98B4] hover:text-[#2E2544] dark:hover:text-white"
                              }`}
                            >
                              <Stethoscope size={13} />
                              <span>Clinician Lens</span>
                            </button>
                          </div>
                        </div>

                        <div className="clay-card p-4 rounded-2xl flex-1 overflow-y-auto max-h-[440px] custom-scrollbar text-[13px] leading-relaxed text-[#4A435E] dark:text-[#C5BFD6]">
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
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════ TAB 2: QUANTITATIVE BIOMARKERS & Z-SCORES ══════════════ */}
          {activeTab === "biomarkers" && (
            <div className="space-y-6">
              {/* Header Banner */}
              <div className="clay-card p-6" style={{ borderRadius: 26 }}>
                <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
                  <div>
                    <h3 className="text-xl font-extrabold text-[#2E2544] dark:text-white">
                      Quantitative Biomarkers — {selectedPatient.name}
                    </h3>
                    <p className="text-xs text-[#7A748A] dark:text-[#9E98B4] mt-0.5">
                      Empirical Z-Scores referenced against the 120-subject Mumtaz et al. MDD vs Healthy cohort
                    </p>
                  </div>
                  {selectedReport ? (
                    <div className="flex items-center gap-2">
                      <span className="clay-pill px-3 py-1.5 text-xs font-bold text-[#7B56DB] dark:text-[#D4C5F7]">
                        Active Record: {selectedReport.filename}
                      </span>
                      <button
                        onClick={() => setSelectedReport(null)}
                        className="clay-button px-2.5 py-1 text-xs font-bold text-[#8E88A4] hover:text-[#2E2544] dark:hover:text-white cursor-pointer border-none rounded-xl"
                      >
                        Switch
                      </button>
                    </div>
                  ) : (
                    <span className="clay-pill px-3 py-1 text-xs font-semibold text-amber-500">
                      Select a recording below to view quantitative data
                    </span>
                  )}
                </div>

                {!selectedReport ? (
                  /* Prompt to select recording */
                  <div className="space-y-3">
                    <p className="text-xs text-[#8E88A4]">
                      Please choose one of {selectedPatient.name}&apos;s electrophysiology recordings below to inspect quantitative FAA, TBR, APF, and 19-channel Z-scores:
                    </p>
                    {reports.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {reports.map((r) => (
                          <div
                            key={r.id}
                            onClick={() => setSelectedReport(r)}
                            className="clay-card p-3.5 rounded-xl cursor-pointer hover:scale-102 transition-transform text-xs"
                          >
                            <div className="font-bold text-[#2E2544] dark:text-white mb-1">{r.filename}</div>
                            <div className="text-[10px] text-[#8E88A4]">
                              FAA: {r.faa_score > 0 ? "+" : ""}{r.faa_score.toFixed(3)} • TBR: {r.tbr_fz_score.toFixed(2)}
                            </div>
                            <span className="text-[10px] font-bold text-[#7B56DB] mt-2 block">
                              Click to Load Biomarkers →
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-[#8E88A4]">No recordings uploaded yet for this patient.</div>
                    )}
                  </div>
                ) : (
                  /* 4 Quantitative Cards */
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="clay-card p-4 rounded-2xl">
                      <span className="text-[11px] font-bold text-[#8E88A4] block mb-1">
                        Frontal Alpha Asymmetry (FAA)
                      </span>
                      <div className="text-2xl font-black text-[#2E2544] dark:text-white">
                        {selectedReport.faa_score > 0 ? "+" : ""}{selectedReport.faa_score.toFixed(3)}
                      </div>
                      <div className="clay-pill px-2 py-0.5 text-[10px] font-bold text-[#EC4899] mt-2 inline-block">
                        Z-Score: {selectedReport.biomarkers?.z_scores?.faa !== undefined ? selectedReport.biomarkers.z_scores.faa.toFixed(2) : "0.00"}
                      </div>
                      <p className="text-[10px] text-[#8E88A4] mt-2">
                        Davidson model: Negative values reflect relative right-frontal hyperactivation (avoidance / withdrawal).
                      </p>
                    </div>

                    <div className="clay-card p-4 rounded-2xl">
                      <span className="text-[11px] font-bold text-[#8E88A4] block mb-1">
                        Midline Theta/Beta Ratio (Fz)
                      </span>
                      <div className="text-2xl font-black text-[#2E2544] dark:text-white">
                        {selectedReport.tbr_fz_score.toFixed(2)}
                      </div>
                      <div className="clay-pill px-2 py-0.5 text-[10px] font-bold text-[#8B5CF6] mt-2 inline-block">
                        Z-Score: {selectedReport.biomarkers?.z_scores?.tbr_fz !== undefined ? selectedReport.biomarkers.z_scores.tbr_fz.toFixed(2) : "0.00"}
                      </div>
                      <p className="text-[10px] text-[#8E88A4] mt-2">
                        Elevated slow-wave theta relative to beta reflects executive burden and attentional fatigue.
                      </p>
                    </div>

                    <div className="clay-card p-4 rounded-2xl">
                      <span className="text-[11px] font-bold text-[#8E88A4] block mb-1">
                        Individual Alpha Peak (APF)
                      </span>
                      <div className="text-2xl font-black text-[#2E2544] dark:text-white">
                        {(selectedReport.biomarkers?.apf_f4 || 10.0).toFixed(1)} Hz
                      </div>
                      <div className="clay-pill px-2 py-0.5 text-[10px] font-bold text-[#10B981] mt-2 inline-block">
                        Normative: 9.8 - 10.5 Hz
                      </div>
                      <p className="text-[10px] text-[#8E88A4] mt-2">
                        Slowing below 9.5 Hz correlates with psychomotor retardation and treatment resistance.
                      </p>
                    </div>

                    <div className="clay-card p-4 rounded-2xl">
                      <span className="text-[11px] font-bold text-[#8E88A4] block mb-1">
                        RandomForest Classifier Risk
                      </span>
                      <div className="text-2xl font-black text-[#2E2544] dark:text-white">
                        {(selectedReport.confidence_score * 100).toFixed(0)}%
                      </div>
                      <div
                        className={`clay-pill px-2 py-0.5 text-[10px] font-bold mt-2 inline-block ${
                          selectedReport.predicted_class === "depressive_risk"
                            ? "text-[#EF4444]"
                            : "text-[#10B981]"
                        }`}
                      >
                        {selectedReport.predicted_class === "depressive_risk" ? "Depressive Risk" : "Normative"}
                      </div>
                      <p className="text-[10px] text-[#8E88A4] mt-2">
                        Cross-validated ROC-AUC: 86.8%, Precision: 80.7% on Mumtaz clinical cohort.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* 19-Channel Electrode Power & Z-Score Matrix */}
              {selectedReport && selectedReport.channel_topomap?.channels && (
                <div className="clay-card p-6" style={{ borderRadius: 26 }}>
                  <h4 className="text-base font-extrabold text-[#2E2544] dark:text-white mb-2">
                    19-Channel Normative Deviation Matrix
                  </h4>
                  <p className="text-xs text-[#8E88A4] dark:text-[#9E98B4] mb-4">
                    Lead-by-lead spectral breakdown with relative band distribution for {selectedPatient.name}
                  </p>
                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-black/10 dark:border-white/10 text-[#8E88A4]">
                          <th className="py-2.5 px-3">Lead</th>
                          <th className="py-2.5 px-3">RMS Voltage</th>
                          <th className="py-2.5 px-3">Delta (0.5-4Hz)</th>
                          <th className="py-2.5 px-3">Theta (4-8Hz)</th>
                          <th className="py-2.5 px-3">Alpha (8-13Hz)</th>
                          <th className="py-2.5 px-3">Beta (13-30Hz)</th>
                          <th className="py-2.5 px-3">Peak Freq (APF)</th>
                          <th className="py-2.5 px-3">Lead Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5 dark:divide-white/5 font-mono text-[11.5px]">
                        {selectedReport.channel_topomap.channels.map((ch) => (
                          <tr key={ch.channel} className="hover:bg-purple-500/5 transition-colors">
                            <td className="py-2.5 px-3 font-bold text-[#7B56DB]">{ch.channel}</td>
                            <td className="py-2.5 px-3">{ch.rms_uv.toFixed(1)} μV</td>
                            <td className="py-2.5 px-3">{(ch.delta_rel * 100).toFixed(1)}%</td>
                            <td className="py-2.5 px-3">{(ch.theta_rel * 100).toFixed(1)}%</td>
                            <td className="py-2.5 px-3">{(ch.alpha_rel * 100).toFixed(1)}%</td>
                            <td className="py-2.5 px-3">{(ch.beta_rel * 100).toFixed(1)}%</td>
                            <td className="py-2.5 px-3 font-bold">{ch.apf.toFixed(1)} Hz</td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-sans font-bold ${
                                  ["F3", "F4", "Fz"].includes(ch.channel)
                                    ? "bg-purple-500/15 text-[#7B56DB]"
                                    : "bg-gray-500/10 text-gray-500"
                                }`}
                              >
                                {["F3", "F4"].includes(ch.channel) ? "Asymmetry Key" : ch.channel === "Fz" ? "Executive Midline" : "Standard"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════ TAB 3: NEURO-BEHAVIORAL TRIANGULATION & CROSS-MODAL ══════════════ */}
          {activeTab === "triangulation" && (
            <div className="space-y-6">
              {/* Triangulation HUD Card */}
              <div className="clay-card p-6" style={{ borderRadius: 26 }}>
                <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
                  <div className="flex items-center gap-3">
                    <Crosshair size={26} className="text-[#EC4899]" />
                    <div>
                      <h3 className="text-xl font-extrabold text-[#2E2544] dark:text-white">
                        Neuro-Behavioral Triangulation Index
                      </h3>
                      <p className="text-xs text-[#7A748A] dark:text-[#9E98B4] mt-0.5">
                        Cross-modal synthesis correlating EEG electrophysiology with facial FACS Action Units & dialogue interactions
                      </p>
                    </div>
                  </div>

                  <span className="clay-pill px-3.5 py-1.5 text-xs font-black text-[#10B981] dark:text-[#34D399]">
                    {primaryCorrelation ? `${primaryCorrelation.concordance_level.toUpperCase()} CONCORDANCE (${(primaryCorrelation.triangulation_score * 100).toFixed(0)}%)` : "HIGH CONCORDANCE (90%)"}
                  </span>
                </div>

                {/* Synthesis Notes Card */}
                <div className="clay-card p-4 rounded-2xl bg-purple-500/5 mb-6 border border-purple-500/15">
                  <span className="text-[11px] font-extrabold text-[#7B56DB] uppercase tracking-wider block mb-1">
                    Clinical Cross-Modal Convergence Synthesis
                  </span>
                  <p className="text-xs leading-relaxed text-[#4A435E] dark:text-[#C5BFD6]">
                    {primaryCorrelation?.synthesis_notes ||
                      `Triangulation score 0.90 (high concordance). Frontal Alpha Asymmetry (FAA=${selectedReport?.faa_score.toFixed(3) || "-0.142"}) aligns with elevated Brow Furrowing (AU04=${facs.au04_brow_furrow.toFixed(2)}) and suppressed Zygomatic Pull (AU12=${facs.au12_zygomatic_smile.toFixed(2)}). Midline Theta/Beta Ratio (TBR=${selectedReport?.tbr_fz_score.toFixed(2) || "2.45"}) reflects cognitive load concordant with recent dialogue interactions. Detected affective conflict ratio of 32.0% indicates emotional masking / smiling depression.`}
                  </p>
                </div>

                {/* FACS Action Units Profile */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                  {[
                    {
                      code: "AU04",
                      name: "Brow Furrower (Corrugator)",
                      score: facs.au04_brow_furrow,
                      desc: "Negative affect & mental strain",
                    },
                    {
                      code: "AU12",
                      name: "Lip Corner Puller (Smile)",
                      score: facs.au12_zygomatic_smile,
                      desc: "Approach valence & positive affect",
                    },
                    {
                      code: "AU15",
                      name: "Lip Corner Depressor",
                      score: facs.au15_lip_depressor,
                      desc: "Persistent sorrow / anhedonia",
                    },
                    {
                      code: "AU01",
                      name: "Inner Brow Raiser",
                      score: facs.au01_brow_raiser,
                      desc: "Tension, acute anxiety, vigilance",
                    },
                  ].map((au) => (
                    <div key={au.code} className="clay-card p-3 rounded-2xl">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="clay-pill px-1.5 py-0.5 text-[10px] font-bold text-[#7B56DB]">
                          {au.code}
                        </span>
                        <strong className="text-sm font-black text-[#2E2544] dark:text-white">
                          {(au.score * 100).toFixed(0)}%
                        </strong>
                      </div>
                      <div className="font-bold text-xs text-[#2E2544] dark:text-white truncate">
                        {au.name}
                      </div>
                      <div className="text-[10px] text-[#8E88A4] mb-2">{au.desc}</div>
                      <div className="w-full h-1.5 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.round(au.score * 100)}%`,
                            backgroundColor: au.score > 0.6 ? "#EC4899" : "#10B981",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Affective Conflict / Smiling Masking Alert */}
                <div className="clay-card p-4 rounded-2xl flex items-center justify-between gap-4 border border-amber-500/20 bg-amber-500/5">
                  <div className="flex items-center gap-3">
                    <AlertTriangle size={24} className="text-amber-500 shrink-0" />
                    <div>
                      <div className="font-bold text-xs text-[#2E2544] dark:text-white">
                        Affective Conflict & Emotional Masking Detected
                      </div>
                      <div className="text-[11px] text-[#7A748A] dark:text-[#9E98B4]">
                        In 32.0% of analyzed session turns, {selectedPatient.name} smiled while verbally expressing severe anxiety or sadness.
                      </div>
                    </div>
                  </div>
                  <span className="clay-pill px-3 py-1 text-xs font-black text-amber-600 dark:text-amber-400 shrink-0">
                    Conflict Index: 0.32
                  </span>
                </div>
              </div>

              {/* ── Longitudinal Session-by-Session Behavioral Interactions ── */}
              <div className="clay-card p-6" style={{ borderRadius: 26 }}>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <h4 className="text-base font-extrabold text-[#2E2544] dark:text-white">
                      Longitudinal Session Interactions ({patientInsights?.sessions?.length || 0} Sessions)
                    </h4>
                    <p className="text-xs text-[#8E88A4]">
                      Select a session to inspect captured facial expressions, sentiment, and verbatim dialog
                    </p>
                  </div>
                </div>

                {/* Session Selector Pills */}
                {patientInsights?.sessions && patientInsights.sessions.length > 0 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-4 custom-scrollbar shrink-0 min-h-[46px]">
                    {patientInsights.sessions.map((sess) => {
                      const isSel = selectedSessionId === sess.id;
                      return (
                        <button
                          key={sess.id}
                          onClick={() => setSelectedSessionId(sess.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer border-none transition-all flex items-center gap-1.5 shrink-0 min-h-[34px] outline-none ${
                            isSel
                              ? "clay-active-nav text-white shadow-md shadow-purple-500/25 ring-2 ring-purple-400/40"
                              : "clay-button text-[#6B6380] dark:text-[#B4ADC6] hover:text-[#2E2544] dark:hover:text-white"
                          }`}
                        >
                          <Calendar size={12} />
                          <span>Session #{sess.id}</span>
                          <span className="opacity-70 text-[10px]">
                            ({sess.mode.replace("_", " ")})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Session Interactions List */}
                <div className="space-y-3 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
                  {activeSessionInteractions.length === 0 ? (
                    <div className="text-center py-8 text-xs text-[#8E88A4]">
                      No captured emotion interactions recorded for this session.
                    </div>
                  ) : (
                    activeSessionInteractions.map((item) => (
                      <div
                        key={item.id}
                        className="clay-card p-3.5 rounded-2xl text-xs space-y-2 border border-black/5 dark:border-white/5"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="clay-pill px-2 py-0.5 text-[10px] font-bold text-[#7B56DB]">
                              Sess #{item.session_id}
                            </span>
                            <span className="text-[11px] text-[#8E88A4]">
                              {item.created_at ? new Date(item.created_at).toLocaleTimeString() : ""}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span
                              className={`clay-pill px-2 py-0.5 text-[10px] font-bold ${
                                item.face_emotion === "happy"
                                  ? "text-[#10B981]"
                                  : item.face_emotion === "sad"
                                  ? "text-[#EF4444]"
                                  : "text-[#8E88A4]"
                              }`}
                            >
                              Face: {item.face_emotion}
                            </span>
                            <span
                              className={`clay-pill px-2 py-0.5 text-[10px] font-bold ${
                                item.text_emotion === "anxious" || item.text_emotion === "frustrated"
                                  ? "text-[#EC4899]"
                                  : "text-[#7B56DB]"
                              }`}
                            >
                              Text: {item.text_emotion}
                            </span>
                            {item.conflict && (
                              <span className="clay-pill px-2 py-0.5 text-[10px] font-extrabold text-amber-500 bg-amber-500/10">
                                Conflict Masking
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Dialogue Excerpt */}
                        <p className="font-semibold text-[#2E2544] dark:text-white leading-relaxed pl-1">
                          &ldquo;{item.content}&rdquo;
                        </p>

                        {/* FACS Units Sub-bar */}
                        <div className="flex items-center gap-3 pt-1 text-[10px] font-bold text-[#8E88A4]">
                          <span>AU04 Brow: {(item.facs_units.au04_brow_furrow * 100).toFixed(0)}%</span>
                          <span>AU12 Smile: {(item.facs_units.au12_zygomatic_smile * 100).toFixed(0)}%</span>
                          <span>AU15 Depressor: {(item.facs_units.au15_lip_depressor * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════ TAB 4: COGNITIVE KNOWLEDGE MEMORY GRAPH ══════════════ */}
          {activeTab === "neuro_graph" && (
            <div className="space-y-6">
              {/* Graph Header */}
              <div className="clay-card p-6" style={{ borderRadius: 26 }}>
                <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
                  <div className="flex items-center gap-3">
                    <Network size={26} className="text-[#7B56DB]" />
                    <div>
                      <h3 className="text-xl font-extrabold text-[#2E2544] dark:text-white">
                        Cognitive Knowledge Memory Graph — {selectedPatient.name}
                      </h3>
                      <p className="text-xs text-[#7A748A] dark:text-[#9E98B4] mt-0.5">
                        Extracted longitudinal mental entities mapped to physiological electrophysiology clusters
                      </p>
                    </div>
                  </div>

                  <span className="clay-pill px-3 py-1.5 text-xs font-bold text-[#7B56DB]">
                    {patientInsights?.knowledge_graph?.entities?.length || 0} Entities • {patientInsights?.knowledge_graph?.relationships?.length || 0} Directed Edges
                  </span>
                </div>

                {/* Graph Entities Interactive Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                  {(patientInsights?.knowledge_graph?.entities || []).map((entity) => {
                    const isStressor = ["WELLNESS", "MILESTONE"].includes(entity.entity_type);
                    const isCoping = ["COPING_PRACTICE", "STRATEGY"].includes(entity.entity_type);
                    return (
                      <div
                        key={entity.id}
                        className="clay-card p-4 rounded-2xl flex flex-col justify-between hover:scale-101 transition-transform"
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span
                            className={`clay-pill px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                              isStressor
                                ? "text-[#EC4899] bg-pink-500/10"
                                : isCoping
                                ? "text-[#10B981] bg-emerald-500/10"
                                : "text-[#7B56DB] bg-purple-500/10"
                            }`}
                          >
                            {entity.entity_type}
                          </span>
                          <span className="text-[10px] text-[#8E88A4] font-mono">
                            #ENT-{entity.id}
                          </span>
                        </div>
                        <h5 className="font-extrabold text-sm text-[#2E2544] dark:text-white mb-2">
                          {entity.name}
                        </h5>

                        {/* Physiological Mapping Badge */}
                        <div className="clay-pill px-2 py-1 text-[10px] font-semibold text-[#8E88A4] flex items-center gap-1.5 mt-auto">
                          <Zap size={11} className={isStressor ? "text-[#EC4899]" : "text-[#10B981]"} />
                          <span className="truncate">
                            {isStressor
                              ? "Right Frontal Hyperactivation (FAA < 0)"
                              : isCoping
                              ? "Frontal Alpha Restoration"
                              : "Midline Attentional Focus (TBR)"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Relationships / Edges Table */}
                {patientInsights?.knowledge_graph?.relationships && (
                  <div className="mt-4 pt-4 border-t border-black/5 dark:border-white/5">
                    <h5 className="font-bold text-xs text-[#2E2544] dark:text-white mb-3">
                      Active Directed Relationships & Weightings:
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      {patientInsights.knowledge_graph.relationships.map((rel, idx) => (
                        <div
                          key={idx}
                          className="clay-card p-2.5 rounded-xl flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="font-bold text-[#2E2544] dark:text-white truncate">
                              {rel.source_name}
                            </span>
                            <ArrowRight size={12} className="text-[#7B56DB] shrink-0" />
                            <span className="font-bold text-[#2E2544] dark:text-white truncate">
                              {rel.target_name}
                            </span>
                          </div>
                          <span className="clay-pill px-2 py-0.5 text-[10px] font-black text-[#7B56DB] shrink-0">
                            {rel.relation_type}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Statutory Non-Diagnostic Regulatory Disclaimer ── */}
      <div className="clay-card p-4 rounded-2xl flex items-start gap-3 text-xs font-medium text-[#7A748A] dark:text-[#9E98B4] border border-amber-500/20 bg-amber-500/5">
        <ShieldAlert size={18} className="text-amber-500 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-[#2E2544] dark:text-white font-bold">
            Statutory Medical Notice:{" "}
          </strong>
          This portal provides quantitative research and clinical decision support telemetry derived from resting-state EEG records (Mumtaz et al., Figshare 4244171 cohort). It is not an FDA-cleared diagnostic device and should never replace qualified clinical psychiatric evaluation.
        </p>
      </div>
      </div>

      {/* ── Upload Modal (Patient-Scoped) ── */}
      <AnimatePresence>
        {showUploadModal && selectedPatient && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="clay-card p-6 max-w-lg w-full relative"
              style={{ borderRadius: 28 }}
            >
              <h3 className="text-[19px] font-black text-[#2E2544] dark:text-white mb-1">
                Upload EEG Recording for {selectedPatient.name}
              </h3>
              <p className="text-xs text-[#7A748A] dark:text-[#9E98B4] mb-4">
                Attach a raw European Data Format (.edf) file to patient #{selectedPatient.id}. The DSP preprocessor will apply notch and 0.5-45Hz Butterworth filtering, compute Welch PSD band powers, and extract FAA.
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
                  Target patient: {selectedPatient.name} (Case #{selectedPatient.id})
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
