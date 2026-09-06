import { motion } from "motion/react";
import { Shield, Eye, Lock, Database, ArrowLeft, CheckCircle } from "lucide-react";

interface PrivacyPolicyScreenProps {
  onBack?: () => void;
}

export function PrivacyPolicyScreen({ onBack }: PrivacyPolicyScreenProps) {
  return (
    <div className="w-full h-full min-h-0 overflow-y-auto custom-scrollbar px-3 sm:px-6 py-4 pb-28 select-none">
      <div style={{ maxWidth: 840, margin: "0 auto" }}>
        {/* Back navigation */}
        {onBack && (
          <button
            onClick={onBack}
            className="clay-pill px-3 py-1.5 flex items-center gap-2 text-xs font-bold text-[#7B59DC] mb-4 cursor-pointer border-none outline-none"
          >
            <ArrowLeft size={14} />
            Back
          </button>
        )}

        {/* Header */}
        <div className="flex items-center gap-3.5 mb-6">
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 18,
              background: "linear-gradient(135deg, #A78BFA, #7C3AED)",
              display: "grid",
              placeItems: "center",
              boxShadow: "0 6px 16px rgba(124, 58, 237, 0.3)",
              flexShrink: 0,
            }}
          >
            <Shield size={26} color="#FFFFFF" />
          </div>
          <div>
            <h1 className="text-[24px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF] m-0 tracking-tight">
              Privacy Policy & Data Rights
            </h1>
            <p className="text-[12px] text-[#7A748A] dark:text-[#9E98B4] mt-0.5 m-0 font-medium">
              Aura AI 2.0 • Digital Personal Data Protection (DPDP Act 2023) Compliance Notice
            </p>
          </div>
        </div>

        {/* Section Cards */}
        <div className="flex flex-col gap-4">
          {/* Consumer Wellness Notice */}
          <div className="clay-card p-5 sm:p-6 border-l-4 border-l-[#10B981]">
            <div className="flex items-center gap-2 text-[#10B981] font-bold text-[13px] mb-2">
              <CheckCircle size={16} />
              Consumer Wellness & Non-Clinical Disclaimer
            </div>
            <p className="text-[12.5px] text-[#4B4B60] dark:text-[#D8D2E8] leading-relaxed m-0 font-medium">
              Aura AI is an artificial intelligence emotional support and cognitive companion designed for personal wellbeing, stress tracking, and self-reflection. <strong>Aura AI is not a licensed healthcare provider, medical device, or substitute for clinical medical diagnosis or psychiatric emergency services.</strong> If you are experiencing thoughts of self-harm or medical emergency, please call your local emergency hotline or 988 immediately.
            </p>
          </div>

          {/* Biometrics & Video Ingestion */}
          <div className="clay-card p-5 sm:p-6">
            <div className="flex items-center gap-2 text-[#7C3AED] dark:text-[#A78BFA] font-bold text-[14px] mb-2">
              <Eye size={17} />
              1. Video & Facial Biometric Processing
            </div>
            <p className="text-[12.5px] text-[#4B4B60] dark:text-[#D8D2E8] leading-relaxed mb-2 font-medium">
              During Face-to-Face consultations, camera video frames are processed at 2 frames per second. 
              Our vision engine extracts 478 3D spatial facial landmarks and Facial Action Coding System (FACS) action units (such as smile intensity AU12 and brow furrow AU04).
            </p>
            <ul className="text-[12px] text-[#7A748A] dark:text-[#9E98B4] list-disc list-inside flex flex-col gap-1 font-medium">
              <li><strong>Zero Permanent Video Storage:</strong> Video streams are processed in ephemeral memory and discarded immediately after landmark classification. Raw camera video is never recorded or saved to disk.</li>
              <li><strong>Instant Hardware Teardown:</strong> When you conclude a consultation session, all webcam video tracks and microphone hardware are terminated immediately at the browser level.</li>
            </ul>
          </div>

          {/* Audio & Conversations */}
          <div className="clay-card p-5 sm:p-6">
            <div className="flex items-center gap-2 text-[#7C3AED] dark:text-[#A78BFA] font-bold text-[14px] mb-2">
              <Lock size={17} />
              2. Voice & Conversational Data
            </div>
            <p className="text-[12.5px] text-[#4B4B60] dark:text-[#D8D2E8] leading-relaxed mb-2 font-medium">
              Spoken conversation is transcribed into text in real time using local speech APIs. Your dialogue is analyzed to recognize emotional themes and provide supportive reframes.
            </p>
            <p className="text-[12px] text-[#7A748A] dark:text-[#9E98B4] leading-relaxed m-0 font-medium">
              Audio is transmitted encrypted via WSS (WebSocket Secure) with Acoustic Echo Cancellation. You can choose to consult purely via text Chat mode at any time without activating the camera or microphone.
            </p>
          </div>

          {/* Storage & Memory */}
          <div className="clay-card p-5 sm:p-6">
            <div className="flex items-center gap-2 text-[#7C3AED] dark:text-[#A78BFA] font-bold text-[14px] mb-2">
              <Database size={17} />
              3. Memory Retention & Your Right to Deletion
            </div>
            <p className="text-[12.5px] text-[#4B4B60] dark:text-[#D8D2E8] leading-relaxed mb-2 font-medium">
              Under India's Digital Personal Data Protection (DPDP) Act 2023, you retain absolute ownership and control over your personal data:
            </p>
            <ul className="text-[12px] text-[#7A748A] dark:text-[#9E98B4] list-disc list-inside flex flex-col gap-1 font-medium">
              <li><strong>Right to Inspect:</strong> You can view all saved episodic memories, extracted goals, and affective milestones anytime in the <strong>Memory Screen</strong>.</li>
              <li><strong>Right to Erase:</strong> You can delete individual memories or clear entire conversation logs with 1 click.</li>
              <li><strong>Right to Withdraw Consent:</strong> You can deactivate your account or opt out of biometric sensing by toggling permissions off.</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-[11px] text-[#9E98AA]">
          Last revised: September 2026 • Aura AI Security & Compliance Governance Team
        </div>
      </div>
    </div>
  );
}
