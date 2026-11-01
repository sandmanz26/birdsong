/**
 * Bird recorder. Phone voice processing (AGC, noise suppression, echo cancellation) is designed for
 * speech and mangles birdsong, so it is explicitly turned off (PRD F2 user story 2).
 */
export class BirdRecorder {
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private analyser: AnalyserNode | null = null;
  private ctx: AudioContext | null = null;
  private buf = new Float32Array(2048);

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    this.ctx = new AudioContext();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    src.connect(this.analyser);
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime, audioBitsPerSecond: 128000 } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(1000);
  }

  /** Input level 0–1 (RMS, perceptually scaled) for the live meter. */
  level(): number {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.buf);
    let acc = 0;
    for (let i = 0; i < this.buf.length; i++) acc += this.buf[i] * this.buf[i];
    const db = 10 * Math.log10(acc / this.buf.length + 1e-12);
    return Math.min(1, Math.max(0, (db + 70) / 60));
  }

  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.rec) return reject(new Error('not recording'));
      const rec = this.rec;
      rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: rec.mimeType || 'audio/webm' });
        this.cleanup();
        resolve(blob);
      };
      rec.stop();
    });
  }

  cancel() {
    try {
      this.rec?.stop();
    } catch {
      /* already stopped */
    }
    this.cleanup();
  }

  private cleanup() {
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => undefined);
    this.stream = null;
    this.rec = null;
    this.analyser = null;
    this.ctx = null;
  }
}
