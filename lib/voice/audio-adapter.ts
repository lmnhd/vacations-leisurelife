/**
 * Audio Adapter — Microphone access and audio stream management
 *
 * Handles getUserMedia acquisition and provides a clean teardown.
 * PCM16 is the native WebRTC format; no transcoding needed for
 * the RTCPeerConnection path (OpenAI handles decoding server-side).
 */

export interface AudioAdapterHandle {
    stream: MediaStream;
    stop: () => void;
}

export async function acquireMicrophone(): Promise<AudioAdapterHandle> {
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 24000,
        },
    });

    return {
        stream,
        stop: () => {
            for (const track of stream.getTracks()) {
                track.stop();
            }
        },
    };
}
