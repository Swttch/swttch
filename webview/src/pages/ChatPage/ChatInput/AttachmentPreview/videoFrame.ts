/** Longest side of the picture taken from a video; the card it lands on is 64px. */
const FRAME_EDGE = 128;

/** A video that has not shown a frame by now is not going to, so the card keeps its icon. */
const FRAME_TIMEOUT_MS = 8000;

/**
 * A picture of a video's opening, as a data URL, or null when the browser cannot
 * decode the video.
 *
 * Whether a given file decodes depends on the codec inside it and on what this
 * browser ships, which cannot be known from the name, so null is an ordinary
 * answer and the caller falls back to the icon.
 */
export function videoFrame(video: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(video);
    const element = document.createElement('video');
    let settled = false;

    const finish = (frame: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      element.onerror = null;
      element.onloadeddata = null;
      element.onseeked = null;
      try {
        element.removeAttribute('src');
        element.load();
      } catch {
        // Releasing the decoder is best effort.
      }
      URL.revokeObjectURL(url);
      resolve(frame);
    };

    const timer = setTimeout(() => finish(null), FRAME_TIMEOUT_MS);

    element.muted = true;
    element.playsInline = true;
    element.preload = 'auto';
    element.onerror = () => finish(null);
    // The very first frame is often black, so look a moment in. The seek is also
    // what makes the browser decode a frame it can then paint.
    element.onloadeddata = () => {
      const duration = Number.isFinite(element.duration) ? element.duration : 0;
      element.currentTime = Math.max(0.01, Math.min(0.1, duration / 2));
    };
    element.onseeked = () => {
      const { videoWidth: width, videoHeight: height } = element;
      if (!width || !height) {
        finish(null);
        return;
      }
      const scale = Math.min(1, FRAME_EDGE / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        finish(null);
        return;
      }
      context.drawImage(element, 0, 0, canvas.width, canvas.height);
      finish(canvas.toDataURL('image/jpeg', 0.7));
    };
    element.src = url;
  });
}
