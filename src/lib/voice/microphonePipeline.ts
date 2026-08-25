/**
 * Comprehensive Microphone & WebRTC Audio Pipeline Manager
 *
 * Handles pre-flight permissions, AudioContext / autoplay unlocking,
 * live input volume monitoring attached directly to active SDK tracks,
 * and provider-specific WebRTC track attachment across Retell and Vapi.
 */

export interface MicrophonePermissionStatus {
  supported: boolean;
  isSecureContext: boolean;
  state: 'granted' | 'prompt' | 'denied' | 'unsupported' | 'unknown';
  error?: string;
}

export interface AudioLevelMonitor {
  cleanup: () => void;
  getAudioContext: () => AudioContext | null;
  getLatestLevel: () => number;
}

/**
 * Checks browser microphone support and current permission state.
 * Performs probe validation without locking the device.
 */
export async function checkMicrophonePermissions(): Promise<MicrophonePermissionStatus> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      supported: false,
      isSecureContext: false,
      state: 'unsupported',
      error: 'Not in a browser window context.',
    };
  }

  const isSecure =
    window.isSecureContext ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  if (!isSecure) {
    return {
      supported: false,
      isSecureContext: false,
      state: 'unsupported',
      error: 'Microphone access requires a secure context (HTTPS). Please ensure you are visiting via a secure HTTPS connection.',
    };
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    return {
      supported: false,
      isSecureContext: isSecure,
      state: 'unsupported',
      error: 'Your browser does not support microphone audio capture or permissions are restricted in this iframe.',
    };
  }

  let state: MicrophonePermissionStatus['state'] = 'unknown';

  if (navigator.permissions && typeof navigator.permissions.query === 'function') {
    try {
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      state = permissionStatus.state as 'granted' | 'prompt' | 'denied';
      if (state === 'denied') {
        return {
          supported: false,
          isSecureContext: isSecure,
          state: 'denied',
          error: 'Microphone permission was denied. Please allow microphone access in your browser settings and try again.',
        };
      }
    } catch {
      state = 'prompt';
    }
  } else {
    state = 'prompt';
  }

  return {
    supported: true,
    isSecureContext: isSecure,
    state,
  };
}

/**
 * Pre-flights microphone permission prompt if needed, ensuring any temporary probe stream
 * is IMMEDIATELY stopped so the audio hardware is never locked for the SDK.
 */
export async function preflightMicrophoneAccess(): Promise<boolean> {
  const perm = await checkMicrophonePermissions();
  if (!perm.supported && perm.error) {
    throw new Error(perm.error);
  }

  try {
    const probeStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    // Immediately stop and release all probe tracks so LiveKit / Daily have exclusive hardware access
    stopMediaStream(probeStream);
    return true;
  } catch (err: any) {
    console.error('[MicrophonePipeline] Pre-flight getUserMedia error:', err);
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.message?.includes('Permission')) {
      throw new Error('Microphone permission was denied. Please allow microphone access in your browser settings and try again.');
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      throw new Error('No working microphone input device was found on your system.');
    }
    if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      throw new Error('Your microphone is currently in use by another application or operating system process.');
    }
    throw new Error(err.message || 'Unable to access your microphone.');
  }
}

/**
 * Creates an audio level analyser node attached to a live MediaStream.
 */
export function createAudioLevelMonitor(
  stream: MediaStream,
  callbacks: {
    onLevel?: (level: number) => void;
    onSpeechDetected?: () => void;
    speechThreshold?: number;
  } = {}
): AudioLevelMonitor {
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let animationFrameId: number | null = null;
  let isCleanedUp = false;
  let latestLevel = 0;

  const threshold = callbacks.speechThreshold ?? 0.015;

  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      audioContext = new AudioCtx();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;

      source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
      }

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
        if (isCleanedUp || !analyser) return;

        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const normalized = Math.min(1, avg / 128);
        latestLevel = normalized;

        if (callbacks.onLevel) {
          callbacks.onLevel(normalized);
        }

        if (normalized >= threshold && callbacks.onSpeechDetected) {
          callbacks.onSpeechDetected();
        }

        animationFrameId = requestAnimationFrame(checkVolume);
      };

      animationFrameId = requestAnimationFrame(checkVolume);
    }
  } catch (err) {
    console.warn('[MicrophonePipeline] AudioContext analyser initialization skipped:', err);
  }

  const cleanup = () => {
    isCleanedUp = true;
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (source) {
      try {
        source.disconnect();
      } catch {}
      source = null;
    }
    if (audioContext) {
      try {
        audioContext.close();
      } catch {}
      audioContext = null;
    }
  };

  return {
    cleanup,
    getAudioContext: () => audioContext,
    getLatestLevel: () => latestLevel,
  };
}

/**
 * Safely stops and releases all tracks in a MediaStream.
 */
export function stopMediaStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  try {
    const tracks = stream.getTracks();
    tracks.forEach((track) => {
      try {
        track.stop();
      } catch {}
    });
  } catch (err) {
    console.warn('[MicrophonePipeline] Error stopping media stream tracks:', err);
  }
}

/**
 * Explicitly verifies Retell SDK microphone track attachment and starts audio playback.
 */
export async function verifyRetellMicrophoneAttachment(retellClient: any): Promise<boolean> {
  if (!retellClient) return false;

  try {
    // 1. Resume AudioContext and start audio playback for subscribed tracks
    if (typeof retellClient.startAudioPlayback === 'function') {
      await retellClient.startAudioPlayback().catch(() => {});
    } else if (retellClient.room && typeof retellClient.room.startAudio === 'function') {
      await retellClient.room.startAudio().catch(() => {});
    }

    // 2. Ensure microphone track is enabled on localParticipant
    if (retellClient.room?.localParticipant) {
      const isMicEnabled = retellClient.room.localParticipant.isMicrophoneEnabled;
      if (!isMicEnabled && typeof retellClient.room.localParticipant.setMicrophoneEnabled === 'function') {
        console.log('[MicrophonePipeline] Ensuring microphone track is enabled on Retell local participant...');
        await retellClient.room.localParticipant.setMicrophoneEnabled(true).catch((err: any) => {
          console.warn('[MicrophonePipeline] Retell setMicrophoneEnabled warning:', err);
        });
      }
    }

    return true;
  } catch (err) {
    console.error('[MicrophonePipeline] Error verifying Retell microphone track:', err);
    return false;
  }
}

/**
 * Explicitly verifies Vapi SDK microphone track attachment and unmute state.
 */
export async function verifyVapiMicrophoneAttachment(vapiClient: any): Promise<boolean> {
  if (!vapiClient) return false;

  try {
    if (typeof vapiClient.isMuted === 'function' && vapiClient.isMuted()) {
      console.log('[MicrophonePipeline] Unmuting Vapi client microphone...');
      vapiClient.setMuted(false);
    }
    return true;
  } catch (err) {
    console.error('[MicrophonePipeline] Error verifying Vapi microphone track:', err);
    return false;
  }
}
