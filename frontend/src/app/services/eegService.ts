/**
 * Aura AI — EEG & Neuro-Behavioral Analytics Service.
 * Connects frontend UI to /api/v1/eeg endpoints.
 */

import { authService } from "./authService";

export interface TopomapChannel {
  channel: string;
  x: number;
  y: number;
  z: number;
  rms_uv: number;
  alpha_rel: number;
  theta_rel: number;
  beta_rel: number;
  delta_rel: number;
  gamma_rel: number;
  apf: number;
}

export interface AsymmetryPair {
  pair: string;
  region: string;
  score: number;
  normative_z: number;
}

export interface FacsMarkers {
  au04_brow_furrow: number;
  au12_zygomatic_smile: number;
  au15_lip_depressor: number;
  au01_brow_raiser: number;
  prosody_monotony: number;
}

export interface EEGCorrelation {
  id: number;
  eeg_report_id: number;
  triangulation_score: number;
  concordance_level: "high" | "moderate" | "low" | "discordant";
  facs_markers: FacsMarkers;
  graph_entities: Array<{
    name: string;
    type: string;
    biomarker_link: string;
    concordance: string;
  }>;
  synthesis_notes: string;
  created_at: string;
}

export interface EEGReport {
  id: number;
  user_id: number;
  session_id?: number | null;
  filename: string;
  sampling_rate: number;
  duration_seconds: number;
  num_channels: number;
  recording_state: string;
  predicted_class: "depressive_risk" | "normative";
  confidence_score: number;
  faa_score: number;
  tbr_fz_score: number;
  band_powers: {
    global: {
      delta: number;
      theta: number;
      alpha: number;
      beta: number;
      gamma: number;
    };
    regional: {
      frontal_alpha: number;
      frontal_theta: number;
      frontal_beta: number;
      central_alpha: number;
      central_beta: number;
      parietal_alpha: number;
      occipital_alpha: number;
    };
    channels: Record<string, any>;
  };
  channel_topomap: {
    channels: TopomapChannel[];
    asymmetry_pairs: AsymmetryPair[];
  };
  biomarkers: {
    faa: number;
    tbr_fz: number;
    tbr_cz: number;
    fm_theta_rel: number;
    apf_f3: number;
    apf_f4: number;
    z_scores: Record<string, number>;
  };
  patient_summary: string;
  clinician_summary: string;
  disclaimer: string;
  created_at: string;
  correlations: EEGCorrelation[];
}

export interface EEGBenchmarks {
  dataset: string;
  sample_size: number;
  num_mdd: number;
  num_healthy: number;
  metrics: {
    roc_auc: number;
    accuracy: number;
    sensitivity: number;
    precision: number;
    f1_score: number;
  };
  top_features: Array<{ feature: string; importance: number }>;
}

const getApiBase = () => {
  return "/api/v1/eeg";
};

export const eegService = {
  async fetchReports(): Promise<EEGReport[]> {
    const res = await fetch(`${getApiBase()}/reports`, {
      headers: {
        ...authService.getAuthHeaders(),
      },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch EEG reports (${res.status})`);
    }
    const data = await res.json();
    return data.reports || [];
  },

  async getReportDetail(reportId: number): Promise<EEGReport> {
    const res = await fetch(`${getApiBase()}/reports/${reportId}`, {
      headers: {
        ...authService.getAuthHeaders(),
      },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch EEG report #${reportId}`);
    }
    return res.json();
  },

  async uploadEdf(
    file: File,
    sessionId?: number,
    recordingState: string = "eyes_closed"
  ): Promise<EEGReport> {
    const formData = new FormData();
    formData.append("file", file);
    if (sessionId) {
      formData.append("session_id", String(sessionId));
    }
    formData.append("recording_state", recordingState);

    const token = authService.getToken();
    const res = await fetch(`${getApiBase()}/upload`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Upload failed" }));
      throw new Error(err.detail || "Failed to process EEG upload");
    }

    const data = await res.json();
    return data.report;
  },

  async loadDemoSample(
    sampleType: "mdd_ec" | "healthy_ec" | "mdd_eo" | "healthy_eo" = "mdd_ec"
  ): Promise<EEGReport> {
    const formData = new FormData();
    formData.append("sample_type", sampleType);

    const token = authService.getToken();
    const res = await fetch(`${getApiBase()}/demo-sample`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to load demo" }));
      throw new Error(err.detail || "Failed to load demo dataset sample");
    }

    const data = await res.json();
    return data.report;
  },

  async fetchBenchmarks(): Promise<EEGBenchmarks | null> {
    try {
      const res = await fetch(`${getApiBase()}/benchmarks`);
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },
};
