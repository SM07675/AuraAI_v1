import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRM, VRMUtils } from "@pixiv/three-vrm";
import { audioEngine } from "../services/audioEngine";

interface HolographicAuraAvatarProps {
  isSpeaking?: boolean;
  isListening?: boolean;
  isThinking?: boolean;
  userEmotion?: string;
  onReady?: () => void;
  className?: string;
}

export function HolographicAuraAvatar({
  isSpeaking = false,
  isListening = false,
  isThinking = false,
  userEmotion = "calm",
  onReady,
  className = "",
}: HolographicAuraAvatarProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [introStep, setIntroStep] = useState<number>(0); // 0: initial, 1: ring, 2: scan, 3: ready

  const propsRef = useRef({ isSpeaking, isListening, isThinking, userEmotion });
  propsRef.current = { isSpeaking, isListening, isThinking, userEmotion };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let width = container.clientWidth || 600;
    let height = container.clientHeight || 700;

    // ── 1. Three.js Scene & Camera ───────────────────────────────────────────
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(30.0, width / height, 0.1, 20.0);
    // Position camera for upper-body/waist-up portrait view
    camera.position.set(0.0, 1.34, 1.45);
    camera.lookAt(0.0, 1.25, 0.0);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // ── 2. Cinematic Hologram Lighting Graph ─────────────────────────────────
    // Soft Ambient Indigo/Cyan Base
    const ambientLight = new THREE.AmbientLight(0x223366, 1.2);
    scene.add(ambientLight);

    // Luminous Front Keylight (Soft Electric Violet)
    const keyLight = new THREE.DirectionalLight(0x9d72ff, 2.0);
    keyLight.position.set(0.5, 2.0, 1.5);
    scene.add(keyLight);

    // Cyan Rim / Backlight for Holographic Silhouette Edge
    const rimLight = new THREE.DirectionalLight(0x22d3ee, 3.2);
    rimLight.position.set(-1.0, 1.8, -1.2);
    scene.add(rimLight);

    // Vertical Uplight from Floor Projection Ring
    const upLight = new THREE.PointLight(0x38bdf8, 2.4, 3.0);
    upLight.position.set(0.0, 0.2, 0.0);
    scene.add(upLight);

    // ── 3. Projection Floor Ring & Ground Particles ──────────────────────────
    const ringGeo = new THREE.RingGeometry(0.35, 0.52, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
    });
    const floorRing = new THREE.Mesh(ringGeo, ringMat);
    floorRing.rotation.x = Math.PI / 2;
    floorRing.position.set(0.0, 0.02, 0.0);
    scene.add(floorRing);

    // Inner glowing projection core
    const innerRingGeo = new THREE.RingGeometry(0.05, 0.28, 48);
    const innerRingMat = new THREE.MeshBasicMaterial({
      color: 0x8b5cf6,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
    });
    const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
    innerRing.rotation.x = Math.PI / 2;
    innerRing.position.set(0.0, 0.015, 0.0);
    scene.add(innerRing);

    // Holographic Vertical Particle Stream
    const particleCount = 45;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3 + 0] = (Math.random() - 0.5) * 0.8;
      particlePositions[i * 3 + 1] = Math.random() * 1.8;
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
    }
    particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.016,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
    });
    const particleSystem = new THREE.Points(particleGeo, particleMat);
    scene.add(particleSystem);

    // ── 4. Load VRM Model with Holographic Material Adaptation ──────────────
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    let currentVrm: VRM | null = null;
    let materializationStartTime = 0;
    const modelUrl = "/models/aura_avatar.vrm";

    loader.load(
      modelUrl,
      (gltf) => {
        const vrm = gltf.userData.vrm as VRM;
        if (!vrm) return;
        currentVrm = vrm;
        vrmRef.current = vrm;

        // Rotate to face camera
        vrm.scene.rotation.y = Math.PI;
        vrm.scene.position.set(0.0, 0.0, 0.0);
        scene.add(vrm.scene);

        // VRM0 / VRM1 coordinate optimization
        VRMUtils.removeUnnecessaryVertices(vrm.scene);
        VRMUtils.combineSkeletons(vrm.scene);

        // Apply Hologram Shader Enhancement to VRM Materials while preserving facial blendshapes
        vrm.scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            mesh.castShadow = false;
            mesh.receiveShadow = false;

            if (mesh.material) {
              const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              materials.forEach((mat) => {
                mat.transparent = true;
                mat.depthWrite = true;
                // Additive holographic rim & soft transparency
                if ("opacity" in mat) {
                  mat.opacity = 0.92;
                }
              });
            }
          }
        });

        setIsLoaded(true);
        setIntroStep(1);
        materializationStartTime = performance.now();

        // Staggered materialization sequence
        setTimeout(() => setIntroStep(2), 500);
        setTimeout(() => {
          setIntroStep(3);
          if (onReady) onReady();
        }, 1600);
      },
      (progress) => {
        if (progress.total > 0) {
          setLoadProgress(Math.round((progress.loaded / progress.total) * 100));
        }
      },
      (error) => {
        console.error("[HOLOGRAPHIC AVATAR] Failed to load VRM model:", error);
      }
    );

    // ── 5. Mouse Parallax Gaze Tracking ──────────────────────────────────────
    let targetGazeX = 0;
    let targetGazeY = 0;
    let currentGazeX = 0;
    let currentGazeY = 0;

    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      // Strongly constrain gaze tracking so Aura looks naturally at user/camera
      targetGazeX = Math.max(-0.25, Math.min(0.25, x * 0.18));
      targetGazeY = Math.max(-0.15, Math.min(0.15, -y * 0.12));
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    // ── 6. Life Animation Loop, Blinking & Lip-Sync ───────────────────────────
    let animId: number;
    let clock = new THREE.Clock();

    // Natural Blinking State
    let nextBlinkTime = 2.0;
    let blinkPhase = "open"; // 'closing' | 'opening' | 'open'
    let blinkTimer = 0;
    let isDoubleBlink = false;

    // Smoothed viseme values
    let smoothedAa = 0;
    let smoothedIh = 0;
    let smoothedOu = 0;
    let smoothedEe = 0;
    let smoothedOh = 0;

    const animate = () => {
      const delta = clock.getDelta();
      const elapsedTime = clock.getElapsedTime();

      // Rotate Floor Hologram Ring
      floorRing.rotation.z += delta * 0.45;
      innerRing.rotation.z -= delta * 0.35;

      // Animate vertical light particles
      const positions = particleGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        positions[i * 3 + 1] += delta * 0.28;
        if (positions[i * 3 + 1] > 1.8) {
          positions[i * 3 + 1] = 0.05;
        }
      }
      particleGeo.attributes.position.needsUpdate = true;

      // Smooth gaze tracking towards camera/user
      currentGazeX += (targetGazeX - currentGazeX) * 0.05;
      currentGazeY += (targetGazeY - currentGazeY) * 0.05;

      if (currentVrm) {
        // VRM update loop (physics, spring bones)
        currentVrm.update(delta);

        const expManager = currentVrm.expressionManager;

        // ── A. Natural Life Animation (Breathing & Head Tilt) ───────────────
        const spine = currentVrm.humanoid?.getNormalizedBoneNode("spine");
        const head = currentVrm.humanoid?.getNormalizedBoneNode("head");
        const neck = currentVrm.humanoid?.getNormalizedBoneNode("neck");

        // Subtle calm breathing cycle
        const breath = Math.sin(elapsedTime * 1.5) * 0.015;
        if (spine) {
          spine.rotation.x = breath;
        }

        // Natural micro head stabilization and slight interactive tilt
        if (head) {
          const microTilt = Math.sin(elapsedTime * 0.7) * 0.02;
          const thinkingTilt = propsRef.current.isThinking ? 0.08 : 0;
          head.rotation.y = -currentGazeX + microTilt;
          head.rotation.x = -currentGazeY + breath * 0.5 + thinkingTilt;
          head.rotation.z = Math.sin(elapsedTime * 0.5) * 0.015;
        }

        if (neck) {
          neck.rotation.y = -currentGazeX * 0.4;
        }

        // ── B. Natural Eye Blinking System ──────────────────────────────────
        // (Randomized 2.5 - 6s delay, fast close, slower open, occasional double-blink)
        blinkTimer += delta;

        if (blinkPhase === "open") {
          if (blinkTimer >= nextBlinkTime) {
            blinkPhase = "closing";
            blinkTimer = 0;
          }
        } else if (blinkPhase === "closing") {
          // Fast close (~70ms)
          const closeWeight = Math.min(1.0, blinkTimer / 0.07);
          expManager?.setValue("blink", closeWeight);

          if (closeWeight >= 1.0) {
            blinkPhase = "opening";
            blinkTimer = 0;
          }
        } else if (blinkPhase === "opening") {
          // Slower open (~130ms)
          const openWeight = Math.max(0.0, 1.0 - blinkTimer / 0.13);
          expManager?.setValue("blink", openWeight);

          if (openWeight <= 0.0) {
            expManager?.setValue("blink", 0.0);
            blinkPhase = "open";
            blinkTimer = 0;

            // 20% probability of an immediate natural double-blink
            if (!isDoubleBlink && Math.random() < 0.22) {
              isDoubleBlink = true;
              nextBlinkTime = 0.14; // Quick follow-up blink
            } else {
              isDoubleBlink = false;
              // Random interval between 2.5 and 5.8 seconds
              nextBlinkTime = 2.5 + Math.random() * 3.3;
            }
          }
        }

        // ── C. Real-Time Audio-Based Lip-Sync ───────────────────────────────
        // (Connected directly to actual TTS audio output formants)
        const visemes = audioEngine.getTtsVisemes();

        if (visemes.rms > 0.01) {
          // Smooth blendshapes to avoid mechanical jitter
          smoothedAa += (visemes.aa - smoothedAa) * 0.45;
          smoothedIh += (visemes.ih - smoothedIh) * 0.45;
          smoothedOu += (visemes.ou - smoothedOu) * 0.45;
          smoothedEe += (visemes.ee - smoothedEe) * 0.45;
          smoothedOh += (visemes.oh - smoothedOh) * 0.45;

          expManager?.setValue("aa", smoothedAa);
          expManager?.setValue("ih", smoothedIh);
          expManager?.setValue("ou", smoothedOu);
          expManager?.setValue("ee", smoothedEe);
          expManager?.setValue("oh", smoothedOh);
        } else {
          // Immediate reset when playback ceases or upon user interrupt
          smoothedAa = 0;
          smoothedIh = 0;
          smoothedOu = 0;
          smoothedEe = 0;
          smoothedOh = 0;

          expManager?.setValue("aa", 0);
          expManager?.setValue("ih", 0);
          expManager?.setValue("ou", 0);
          expManager?.setValue("ee", 0);
          expManager?.setValue("oh", 0);
        }

        // ── D. Subtle Facial Micro-Expressions ──────────────────────────────
        if (propsRef.current.isThinking) {
          expManager?.setValue("relaxed", 0.1);
          expManager?.setValue("lookUp", 0.15);
        } else if (propsRef.current.isListening) {
          expManager?.setValue("relaxed", 0.25);
          expManager?.setValue("happy", 0.1);
          expManager?.setValue("lookUp", 0);
        } else {
          expManager?.setValue("relaxed", 0.15);
          expManager?.setValue("happy", 0.05);
          expManager?.setValue("lookUp", 0);
        }
      }

      renderer.render(scene, camera);
      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);

    // Resize Handler
    const handleResize = () => {
      if (!container) return;
      width = container.clientWidth || 600;
      height = container.clientHeight || 700;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener("resize", handleResize);

    // ── 7. Full Cleanup & Resource Disposal ──────────────────────────────────
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pointermove", handlePointerMove);
      cancelAnimationFrame(animId);

      if (currentVrm) {
        VRMUtils.deepDispose(currentVrm.scene);
      }

      ringGeo.dispose();
      ringMat.dispose();
      innerRingGeo.dispose();
      innerRingMat.dispose();
      particleGeo.dispose();
      particleMat.dispose();

      renderer.dispose();
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full flex items-center justify-center select-none overflow-hidden ${className}`}
      role="img"
      aria-label="Holographic Aura 3D Companion"
    >
      {/* ── Holographic Materialization Overlay Sequence ── */}
      {!isLoaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-[#070914]/80 backdrop-blur-md">
          {/* Animated Projection Floor Ring */}
          <div className="w-24 h-24 rounded-full border-2 border-cyan-400/40 border-t-cyan-400 animate-spin mb-4 shadow-[0_0_24px_rgba(56,189,248,0.5)]" />
          <p className="text-sm font-semibold text-cyan-200 tracking-wide">
            Synthesizing Hologram Presence... {loadProgress}%
          </p>
          <span className="text-xs text-slate-400 mt-1">
            Loading neural humanoid asset
          </span>
        </div>
      )}

      {/* Intro Vertical Holographic Scan Beam Effect */}
      {introStep === 2 && (
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, rgba(56, 189, 248, 0.35) 45%, rgba(139, 92, 246, 0.45) 50%, transparent 55%)",
            animation: "holo-scan 1.2s ease-out forwards",
          }}
        />
      )}
    </div>
  );
}
