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
  const [loadError, setLoadError] = useState(false);
  const [introStep, setIntroStep] = useState<number>(0); // 0: initial, 1: ring, 2: scan, 3: ready

  const propsRef = useRef({ isSpeaking, isListening, isThinking, userEmotion });
  propsRef.current = { isSpeaking, isListening, isThinking, userEmotion };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hologramTime = { value: 0 };
    const hologramReveal = { value: reducedMotion ? 1 : 0 };

    let width = container.clientWidth || 600;
    let height = container.clientHeight || 700;

    // ── 1. Three.js Scene & Camera ───────────────────────────────────────────
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(30.0, width / height, 0.1, 20.0);
    // Position camera for upper-body/waist-up portrait view
    camera.position.set(0.0, 1.30, 1.55);
    camera.lookAt(0.0, 1.26, 0.0);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 768 ? 1.5 : 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = "block";
    container.appendChild(renderer.domElement);

    // ── 2. Cinematic Hologram Lighting Graph ─────────────────────────────────
    // Soft Ambient Indigo/Cyan Base
    const ambientLight = new THREE.HemisphereLight(0xd5e1ff, 0x253052, 0.75);
    scene.add(ambientLight);

    // Luminous Front Keylight (Soft Electric Violet)
    const keyLight = new THREE.DirectionalLight(0xfff0e8, 0.9);
    keyLight.position.set(0.5, 2.0, 1.5);
    scene.add(keyLight);

    // Cyan Rim / Backlight for Holographic Silhouette Edge
    const rimLight = new THREE.DirectionalLight(0x91baff, 1.5);
    rimLight.position.set(-1.0, 1.8, -1.2);
    scene.add(rimLight);

    // Vertical Uplight from Floor Projection Ring
    const upLight = new THREE.PointLight(0x38bdf8, 0.45, 3.0);
    upLight.position.set(0.0, 0.2, 0.0);
    scene.add(upLight);

    // ── 3. Projection Floor Ring & Ground Particles ──────────────────────────
    const ringGeo = new THREE.RingGeometry(0.36, 0.37, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
    });
    const floorRing = new THREE.Mesh(ringGeo, ringMat);
    floorRing.rotation.x = Math.PI / 2;
    floorRing.position.set(0.0, 0.95, 0.0);
    scene.add(floorRing);

    // Inner glowing projection core
    const innerRingGeo = new THREE.RingGeometry(0.3, 0.303, 48);
    const innerRingMat = new THREE.MeshBasicMaterial({
      color: 0x8b5cf6,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
    });
    const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
    innerRing.rotation.x = Math.PI / 2;
    innerRing.position.set(0.0, 0.946, 0.0);
    scene.add(innerRing);

    // Holographic Vertical Particle Stream
    const particleCount = reducedMotion ? 0 : width < 768 ? 24 : 40;
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
      size: 0.005,
      transparent: true,
      opacity: 0.35,
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
        if (disposed) { VRMUtils.deepDispose(vrm.scene); return; }
        currentVrm = vrm;
        vrmRef.current = vrm;

        // Rotate to face camera
        // Normalize legacy VRM0 orientation; VRM1 already faces +Z.
        VRMUtils.rotateVRM0(vrm);
        vrm.scene.position.set(0.0, 0.0, 0.0);
        scene.add(vrm.scene);
        // Replace the asset's authoring T-pose with a relaxed portrait pose.
        vrm.humanoid.setNormalizedPose({
          leftUpperArm: { rotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, 0, -1.18)).toArray() },
          rightUpperArm: { rotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, 0, 1.18)).toArray() },
          leftLowerArm: { rotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.12, -0.12)).toArray() },
          rightLowerArm: { rotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.12, 0.12)).toArray() },
        });
        vrm.update(0);

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
                // Preserve texture, skinning and expression shaders. Add presence
                // after lighting so eyes and facial detail remain readable.
                mat.opacity = 0.98;
                const previousCompile = mat.onBeforeCompile;
                mat.onBeforeCompile = (shader, renderer) => {
                  previousCompile.call(mat, shader, renderer);
                  shader.uniforms.auraTime = hologramTime;
                  shader.uniforms.auraReveal = hologramReveal;
                  shader.vertexShader = `varying vec3 auraWorld; varying vec3 auraNormal; varying vec3 auraView;\n` + shader.vertexShader;
                  shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>
                    auraWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
                    auraNormal = normalize(normalMatrix * objectNormal);
                    auraView = normalize(-mvPosition.xyz);`);
                  shader.fragmentShader = `uniform float auraTime; uniform float auraReveal; varying vec3 auraWorld; varying vec3 auraNormal; varying vec3 auraView;\n` + shader.fragmentShader;
                  const finish = `
                    float auraRim = pow(1.0 - abs(dot(normalize(auraNormal), normalize(auraView))), 2.8);
                    float auraFace = smoothstep(1.35, 1.55, auraWorld.y);
                    float auraScan = sin(auraWorld.y * 210.0 - auraTime * 0.6) * 0.5 + 0.5;
                    vec3 auraTint = mix(vec3(0.25,0.55,1.0), vec3(0.6,0.36,1.0), auraRim);
                    gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * vec3(0.76,0.9,1.12), 0.3 * (1.0-auraFace));
                    gl_FragColor.rgb += auraTint * auraRim * 0.25;
                    gl_FragColor.rgb *= 1.0 - auraScan * 0.035 * (1.0-auraFace);
                    gl_FragColor.a *= smoothstep(0.87,1.12,auraWorld.y);
                    gl_FragColor.a *= smoothstep(auraWorld.y-0.07,auraWorld.y+0.07,auraReveal*2.0);
                  `;
                  if (shader.fragmentShader.includes("gl_FragColor = vec4( col, diffuseColor.a );")) {
                    shader.fragmentShader = shader.fragmentShader.replace("gl_FragColor = vec4( col, diffuseColor.a );", "gl_FragColor = vec4( col, diffuseColor.a );" + finish);
                  } else {
                    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", "#include <opaque_fragment>" + finish);
                  }
                };
                mat.customProgramCacheKey = () => "aura-presence-v2";
                mat.needsUpdate = true;
              });
            }
          }
        });

        setIsLoaded(true);
        setIntroStep(1);
        materializationStartTime = performance.now();

        // Staggered materialization sequence
        timers.push(setTimeout(() => setIntroStep(2), 500));
        timers.push(setTimeout(() => {
          setIntroStep(3);
          if (onReady) onReady();
        }, reducedMotion ? 0 : 1600));
      },
      (progress) => {
        if (progress.total > 0) {
          setLoadProgress(Math.round((progress.loaded / progress.total) * 100));
        }
      },
      (error) => {
        if (!disposed) setLoadError(true);
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
    let gestureWeight = 0;
    let gestureEnergy = 0;
    let gestureTime = 0;
    let gestureDuration = 2.6;
    let gestureSide = 1;
    let gesturePause = 0;
    let wasSpeaking = false;
    let attentiveWeight = 0;
    let armBones: { left: THREE.Object3D | null; right: THREE.Object3D | null; leftElbow: THREE.Object3D | null; rightElbow: THREE.Object3D | null; leftHand: THREE.Object3D | null; rightHand: THREE.Object3D | null } | null = null;
    const fingerBones: { bone: THREE.Object3D; side: number; curl: number }[] = [];

    const animate = () => {
      const delta = Math.min(clock.getDelta(), 0.05);
      const elapsedTime = clock.getElapsedTime();
      hologramTime.value = elapsedTime;
      if (currentVrm) hologramReveal.value = reducedMotion ? 1 : Math.min(1, (performance.now() - materializationStartTime) / 1500);

      // Rotate Floor Hologram Ring
      floorRing.rotation.z += reducedMotion ? 0 : delta * 0.04;
      innerRing.rotation.z -= reducedMotion ? 0 : delta * 0.03;

      // Animate vertical light particles
      const positions = particleGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        positions[i * 3 + 1] += delta * 0.055;
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

        const expManager = currentVrm.expressionManager;
        if (!armBones) {
          const bone = (name: any) => currentVrm!.humanoid.getNormalizedBoneNode(name);
          armBones = { left: bone("leftUpperArm"), right: bone("rightUpperArm"), leftElbow: bone("leftLowerArm"), rightElbow: bone("rightLowerArm"), leftHand: bone("leftHand"), rightHand: bone("rightHand") };
          for (const side of ["left", "right"]) {
            for (const [finger, curl] of [["Index", 0.12], ["Middle", 0.17], ["Ring", 0.21], ["Little", 0.25]] as const) {
              for (const joint of ["Proximal", "Intermediate", "Distal"]) {
                const node = bone(`${side}${finger}${joint}`);
                if (node) fingerBones.push({ bone: node, side: side === "left" ? -1 : 1, curl });
              }
            }
          }
        }
        // Gestures follow measured speaker output, with quiet pauses between phrases.
        // Cache bones and reuse rotations: no per-frame objects or independent timers.
        const output = audioEngine.getTtsVisemes();
        const speakingNow = audioEngine.hasActivePlayback() && output.rms > 0.008;
        const damping = 1 - Math.exp(-Math.min(delta, 0.05) * 7);
        gestureWeight += ((speakingNow && !reducedMotion ? 1 : 0) - gestureWeight) * damping;
        gestureEnergy += (Math.min(1, output.rms * 12) - gestureEnergy) * damping;
        // One asymmetric open-hand gesture per phrase, with a rest between
        // gestures. Timing is local animation; activation follows real audio.
        if (speakingNow && !wasSpeaking && gesturePause <= 0) {
          gestureTime = 0;
          gestureSide *= -1;
          gestureDuration = 2.3 + Math.random() * 1.2;
        }
        wasSpeaking = speakingNow;
        gestureTime += delta;
        gesturePause = Math.max(0, gesturePause - delta);
        if (gestureTime > gestureDuration && gesturePause === 0) {
          gestureTime = 0;
          gesturePause = 0.9 + Math.random() * 1.4;
          gestureSide *= -1;
        }
        const phase = Math.min(1, gestureTime / gestureDuration);
        const envelope = gesturePause > 0 ? 0 : Math.pow(Math.sin(phase * Math.PI), 2);
        const amount = envelope * gestureWeight * (0.18 + gestureEnergy * 0.35);
        const leftAmount = amount * (gestureSide > 0 ? 1 : 0.28);
        const rightAmount = amount * (gestureSide < 0 ? 1 : 0.28);
        const { left, right, leftElbow, rightElbow, leftHand, rightHand } = armBones;
        if (left) left.rotation.set(0.08 + leftAmount * 0.35, -leftAmount * 0.18, -1.28 + leftAmount * 0.65);
        if (right) right.rotation.set(0.08 + rightAmount * 0.35, rightAmount * 0.18, 1.28 - rightAmount * 0.65);
        if (leftElbow) leftElbow.rotation.set(-leftAmount * 1.6, -0.12, -0.12);
        if (rightElbow) rightElbow.rotation.set(-rightAmount * 1.6, 0.12, 0.12);
        if (leftHand) leftHand.rotation.set(-leftAmount * 0.1, leftAmount * 0.45, leftAmount * 0.15);
        if (rightHand) rightHand.rotation.set(-rightAmount * 0.1, -rightAmount * 0.45, -rightAmount * 0.15);
        // Relaxed fingers gently open with the speaking hand, never a rigid paddle.
        for (const finger of fingerBones) {
          const opening = finger.side < 0 ? leftAmount : rightAmount;
          finger.bone.rotation.z = finger.side * finger.curl * (1 - opening * 0.8);
        }

        // ── A. Natural Life Animation (Breathing & Head Tilt) ───────────────
        const spine = currentVrm.humanoid?.getNormalizedBoneNode("spine");
        const head = currentVrm.humanoid?.getNormalizedBoneNode("head");
        const neck = currentVrm.humanoid?.getNormalizedBoneNode("neck");

        // Subtle calm breathing cycle
        const breath = reducedMotion ? 0 : Math.sin(elapsedTime * 1.25) * 0.009;
        if (spine) {
          spine.rotation.x = breath;
        }

        // Natural micro head stabilization and slight interactive tilt
        if (head) {
          const microTilt = Math.sin(elapsedTime * 0.7) * 0.02;
          attentiveWeight += ((propsRef.current.isThinking ? 1 : 0) - attentiveWeight) * damping;
          const thinkingTilt = reducedMotion ? 0 : attentiveWeight * 0.045;
          head.rotation.y = reducedMotion ? 0 : -currentGazeX * 0.35 + microTilt;
          head.rotation.x = reducedMotion ? 0 : -currentGazeY * 0.3 + breath * 0.5 + thinkingTilt + amount * 0.03;
          head.rotation.z = reducedMotion ? 0 : Math.sin(elapsedTime * 0.5) * 0.012;
        }

        if (neck) {
          neck.rotation.y = reducedMotion ? 0 : -currentGazeX * 0.15;
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
          expManager?.setValue("happy", 0.02);
          expManager?.setValue("lookUp", 0.15);
        } else if (propsRef.current.isListening) {
          expManager?.setValue("relaxed", 0.25);
          expManager?.setValue("happy", 0.06);
          expManager?.setValue("lookUp", 0);
        } else {
          expManager?.setValue("relaxed", 0.15);
          expManager?.setValue("happy", 0.05);
          expManager?.setValue("lookUp", 0);
        }
        // Apply pose and expressions in this frame, after all animation writes.
        currentVrm.update(Math.min(delta, 0.05));
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

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // ── 7. Full Cleanup & Resource Disposal ──────────────────────────────────
    return () => {
      disposed = true;
      timers.forEach(clearTimeout);
      resizeObserver.disconnect();
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
            {loadError ? "Aura’s visual presence could not load" : `Preparing Aura… ${loadProgress}%`}
          </p>
          <span className="text-xs text-slate-400 mt-1">
            {loadError ? "You can continue using voice or text." : "Your AI companion will be ready shortly"}
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
