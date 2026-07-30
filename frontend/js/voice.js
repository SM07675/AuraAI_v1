// Voice Engine Client Module

let ws = null;
let audioContext = null;
let mediaStream = null;
let processor = null;
let playQueue = [];
let isPlaying = false;
let audioSourceNode = null;

let isVoiceActive = false;
let callbacks = {
  onStateChange: (state) => {},
  onPartialTranscript: (text) => {},
  onFinalTranscript: (text) => {},
  onPartialResponse: (text) => {},
  onInterrupted: () => {},
  onError: (err) => {},
  onListening: (active) => {},
  onMetrics: (metrics) => {},
  onGenerating: () => {},
  onSpeaking: () => {},
  onCompleted: (data) => {}
};

window.setVoiceCallbacks = function(cb) {
  callbacks = { ...callbacks, ...cb };
};

window.isVoiceRunning = function() {
  return isVoiceActive;
};

window.toggleVoiceSession = async function(token, sessionId) {
  if (isVoiceActive) {
    window.stopVoiceSession();
    return false;
  } else {
    return await startVoiceSession(token, sessionId);
  }
};

async function startVoiceSession(token, sessionId) {
  try {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/api/v1/ws/voice`;
    
    ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    
    return new Promise((resolve, reject) => {
      ws.onopen = async () => {
        try {
          await startAudioCapture();
          ws.send(JSON.stringify({ type: "session_start", token: token, session_id: sessionId }));
          isVoiceActive = true;
          callbacks.onStateChange("CONNECTED");
          resolve(true);
        } catch(e) {
          reject(e);
        }
      };
      
      ws.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        try {
          const msg = JSON.parse(event.data);
          handleMessage(msg);
        } catch(e) {
          console.error("WS parse error:", e);
        }
      };
      
      ws.onclose = () => {
        isVoiceActive = false;
        callbacks.onStateChange("DISCONNECTED");
        stopAudioCapture();
      };
      
      ws.onerror = (err) => {
        isVoiceActive = false;
        callbacks.onError("WebSocket Connection Error");
        reject(err);
      };
    });
  } catch(e) {
    callbacks.onError(e.message);
    return false;
  }
}

function handleMessage(msg) {
  switch (msg.type) {
    case "state_change":
      callbacks.onStateChange(msg.state);
      break;
    case "partial_transcript":
      callbacks.onPartialTranscript(msg.text);
      break;
    case "final_transcript":
      callbacks.onFinalTranscript(msg.text);
      break;
    case "partial_response":
      callbacks.onPartialResponse(msg.text);
      break;
    case "audio_chunk":
      queueAudioChunk(msg.data);
      break;
    case "interrupted":
      stopPlayback();
      callbacks.onInterrupted();
      break;
    case "error":
      callbacks.onError(msg.message);
      break;
    case "listening":
      callbacks.onListening(msg.active);
      break;
    case "metrics":
      callbacks.onMetrics(msg.data);
      break;
    case "generating":
    case "thinking":
      callbacks.onGenerating();
      break;
    case "speaking":
      callbacks.onSpeaking();
      break;
    case "completed":
      callbacks.onCompleted(msg);
      break;
  }
}

async function startAudioCapture() {
  mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }});
  audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  const source = audioContext.createMediaStreamSource(mediaStream);
  processor = audioContext.createScriptProcessor(4096, 1, 1);
  
  source.connect(processor);
  processor.connect(audioContext.destination);
  
  processor.onaudioprocess = (e) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const float32Data = e.inputBuffer.getChannelData(0);
    const pcmData = new Int16Array(float32Data.length);
    for (let i = 0; i < float32Data.length; i++) {
      let s = Math.max(-1, Math.min(1, float32Data[i]));
      pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    ws.send(pcmData.buffer);
  };
}

function stopAudioCapture() {
  if (processor) { processor.disconnect(); processor = null; }
  if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
  if (audioContext && audioContext.state !== 'closed') { audioContext.close(); audioContext = null; }
  stopPlayback();
}

async function queueAudioChunk(base64Data) {
  if (!audioContext) return;
  try {
    const binaryStr = window.atob(base64Data);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryStr.charCodeAt(i);
    const audioBuffer = await audioContext.decodeAudioData(bytes.buffer);
    playQueue.push(audioBuffer);
    if (!isPlaying) playNextChunk();
  } catch (e) {
    console.error("Audio decode error:", e);
  }
}

function playNextChunk() {
  if (playQueue.length === 0) {
    isPlaying = false;
    audioSourceNode = null;
    return;
  }
  isPlaying = true;
  const buffer = playQueue.shift();
  audioSourceNode = audioContext.createBufferSource();
  audioSourceNode.buffer = buffer;
  audioSourceNode.connect(audioContext.destination);
  audioSourceNode.onended = () => playNextChunk();
  audioSourceNode.start(0);
}

window.stopVoiceSession = function() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "stop_session" }));
    setTimeout(() => { if(ws) ws.close(); }, 500);
  }
  stopAudioCapture();
  isVoiceActive = false;
  callbacks.onStateChange("DISCONNECTED");
};
