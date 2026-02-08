import { onMount, onCleanup, createEffect } from "solid-js";

interface Props {
  /** Array of speed samples (bytes/sec), most recent last. Max 240 entries (60s at 250ms). */
  speedHistory: number[];
}

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export default function SpeedGraph(props: Props) {
  let canvasRef!: HTMLCanvasElement;
  let resizeObserver: ResizeObserver | null = null;

  function draw() {
    const canvas = canvasRef;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width;
    const h = rect.height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    const samples = props.speedHistory;
    if (samples.length < 2) {
      // Draw empty state
      ctx.fillStyle = getCssVar("--surface");
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = getCssVar("--text-muted");
      ctx.font = "10px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Waiting for data...", w / 2, h / 2 + 3);
      return;
    }

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Compute max speed for Y-axis scaling (with padding)
    const maxSpeed = Math.max(...samples, 1);
    const yPadding = 4;
    const graphH = h - yPadding * 2;

    // Map samples to points
    const stepX = w / (240 - 1); // Always use full 240-sample width so graph doesn't stretch
    const startX = w - (samples.length - 1) * stepX;
    const points: [number, number][] = samples.map((speed, i) => {
      const x = startX + i * stepX;
      const y = yPadding + graphH - (speed / maxSpeed) * graphH;
      return [x, y];
    });

    // Draw gradient fill
    const activeColor = getCssVar("--active");
    const gradient = ctx.createLinearGradient(0, yPadding, 0, h);
    gradient.addColorStop(0, activeColor + "40"); // ~25% opacity
    gradient.addColorStop(1, activeColor + "05"); // ~2% opacity

    ctx.beginPath();
    ctx.moveTo(points[0][0], h);
    for (const [x, y] of points) {
      ctx.lineTo(x, y);
    }
    ctx.lineTo(points[points.length - 1][0], h);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw line
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      // Smooth curve using quadratic bezier
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev[0] + curr[0]) / 2;
      ctx.quadraticCurveTo(prev[0], prev[1], cpx, (prev[1] + curr[1]) / 2);
    }
    // Final segment
    const last = points[points.length - 1];
    ctx.lineTo(last[0], last[1]);

    ctx.strokeStyle = activeColor;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  onMount(() => {
    resizeObserver = new ResizeObserver(() => draw());
    resizeObserver.observe(canvasRef);
    draw();
  });

  onCleanup(() => {
    resizeObserver?.disconnect();
  });

  createEffect(() => {
    // Re-draw whenever speedHistory changes (tracked via length and last value)
    const _len = props.speedHistory.length;
    const _last = props.speedHistory[props.speedHistory.length - 1];
    void _len;
    void _last;
    draw();
  });

  return (
    <canvas
      ref={canvasRef!}
      class="w-full rounded"
      style={{ height: "80px" }}
    />
  );
}
