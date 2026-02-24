import { onMount, onCleanup, createEffect, type Component } from "solid-js";

interface SpeedSparklineProps {
  /** Current speed in bytes/sec — push a new sample each time this changes */
  speed: number;
  /** Max number of samples to retain */
  maxSamples?: number;
}

const CANVAS_W = 280;
const CANVAS_H = 100;
const DPR = typeof window !== "undefined" ? window.devicePixelRatio ?? 1 : 1;

const SpeedSparkline: Component<SpeedSparklineProps> = (props) => {
  const maxSamples = () => props.maxSamples ?? 60;

  let canvasRef!: HTMLCanvasElement;
  let samples: number[] = [];
  let rafId: number | undefined;

  function draw() {
    const ctx = canvasRef.getContext("2d");
    if (!ctx) return;

    const w = CANVAS_W * DPR;
    const h = CANVAS_H * DPR;
    ctx.clearRect(0, 0, w, h);

    if (samples.length < 2) return;

    const peak = Math.max(...samples, 1);
    const stepX = w / (maxSamples() - 1);

    // Offset so the line starts from the right if we have fewer samples
    const offsetX = (maxSamples() - samples.length) * stepX;

    const toY = (val: number) => h - (val / peak) * (h - 8 * DPR) - 4 * DPR;

    // Build path
    ctx.beginPath();
    ctx.moveTo(offsetX, toY(samples[0]));
    for (let i = 1; i < samples.length; i++) {
      ctx.lineTo(offsetX + i * stepX, toY(samples[i]));
    }

    // Stroke line
    ctx.strokeStyle = getComputedStyle(canvasRef).getPropertyValue("--color-accent").trim() || "#6366f1";
    ctx.lineWidth = 2 * DPR;
    ctx.lineJoin = "round";
    ctx.stroke();

    // Fill gradient under the line
    const fillPath = new Path2D();
    fillPath.moveTo(offsetX, h);
    fillPath.lineTo(offsetX, toY(samples[0]));
    for (let i = 1; i < samples.length; i++) {
      fillPath.lineTo(offsetX + i * stepX, toY(samples[i]));
    }
    fillPath.lineTo(offsetX + (samples.length - 1) * stepX, h);
    fillPath.closePath();

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    const accent = getComputedStyle(canvasRef).getPropertyValue("--color-accent").trim() || "#6366f1";
    grad.addColorStop(0, accent + "40");
    grad.addColorStop(1, accent + "00");
    ctx.fillStyle = grad;
    ctx.fill(fillPath);

    // Live dot on the last point
    const lastX = offsetX + (samples.length - 1) * stepX;
    const lastY = toY(samples[samples.length - 1]);
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3 * DPR, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
  }

  onMount(() => {
    canvasRef.width = CANVAS_W * DPR;
    canvasRef.height = CANVAS_H * DPR;
  });

  createEffect(() => {
    const speed = props.speed;
    samples.push(speed);
    if (samples.length > maxSamples()) {
      samples = samples.slice(-maxSamples());
    }
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(draw);
  });

  onCleanup(() => {
    if (rafId != null) cancelAnimationFrame(rafId);
  });

  return (
    <div class="flex flex-col gap-[6px] pt-[4px]">
      <span class="text-caption font-semibold text-tertiary uppercase tracking-wider">
        Speed History
      </span>
      <canvas
        ref={canvasRef}
        style={{ width: `${CANVAS_W}px`, height: `${CANVAS_H}px` }}
        class="rounded-[10px] bg-inset"
      />
    </div>
  );
};

export default SpeedSparkline;
