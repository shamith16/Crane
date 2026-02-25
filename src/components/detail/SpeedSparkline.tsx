import { onMount, onCleanup, createEffect, createSignal, Show, type Component } from "solid-js";
import { SolidUplot } from "@dschz/solid-uplot";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

interface SpeedSparklineProps {
  /** Current speed in bytes/sec */
  speed: number;
  /** Max number of samples to retain */
  maxSamples?: number;
}

const SAMPLE_INTERVAL = 250;

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  if (bytesPerSec < 1024 * 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(1)} GB/s`;
}

function readAccent(): string {
  if (typeof document === "undefined") return "#22D3EE";
  return getComputedStyle(document.documentElement)
    .getPropertyValue("--color-accent").trim() || "#22D3EE";
}

const SpeedSparkline: Component<SpeedSparklineProps> = (props) => {
  const maxSamples = () => props.maxSamples ?? 120;

  let latestSpeed = 0;
  let timePoints: number[] = [];
  let speedPoints: number[] = [];
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let startTime = Date.now() / 1000;

  const [chartData, setChartData] = createSignal<[number[], number[]]>([[], []]);
  const [displaySpeed, setDisplaySpeed] = createSignal(0);
  const [accentColor, setAccentColor] = createSignal(readAccent());

  // Track reactive speed without pushing samples
  createEffect(() => {
    latestSpeed = props.speed;
  });

  onMount(() => {
    // Sample speed at fixed interval
    intervalId = setInterval(() => {
      const now = Date.now() / 1000 - startTime;
      timePoints.push(now);
      speedPoints.push(latestSpeed);

      if (timePoints.length > maxSamples()) {
        timePoints = timePoints.slice(-maxSamples());
        speedPoints = speedPoints.slice(-maxSamples());
      }

      setDisplaySpeed(latestSpeed);
      setChartData([timePoints.slice(), speedPoints.slice()]);
    }, SAMPLE_INTERVAL);

    // Watch for accent color changes via style mutations on :root
    const observer = new MutationObserver(() => {
      const color = readAccent();
      if (color !== accentColor()) setAccentColor(color);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style"],
    });

    onCleanup(() => {
      if (intervalId != null) clearInterval(intervalId);
      observer.disconnect();
    });
  });

  return (
    <div class="flex flex-col gap-[6px] pt-[4px]">
      <span class="text-caption font-semibold text-tertiary uppercase tracking-[2px]">
        Speed History
      </span>
      <div class="flex items-baseline gap-[6px] pb-[2px]">
        <span class="text-body font-mono font-extrabold text-accent">
          {formatSpeed(displaySpeed())}
        </span>
        <span class="text-caption text-muted">current</span>
      </div>
      <div class="rounded-[10px] bg-inset overflow-hidden uplot-sparkline">
        {/* Keyed on accent so uPlot remounts with fresh series colors */}
        <Show when={accentColor()} keyed>
          {(color) => (
            <SolidUplot
              data={chartData()}
              width={280}
              height={64}
              cursor={{ show: false }}
              legend={{ show: false }}
              scales={{
                x: { time: false },
              }}
              axes={[
                { show: false },
                { show: false },
              ]}
              series={[
                {},
                {
                  stroke: color,
                  fill: (self: uPlot) => {
                    const grad = self.ctx.createLinearGradient(0, 0, 0, self.height);
                    grad.addColorStop(0, color + "30");
                    grad.addColorStop(1, color + "00");
                    return grad;
                  },
                  width: 2,
                  paths: uPlot.paths.spline!(),
                  points: { show: false },
                },
              ]}
            />
          )}
        </Show>
      </div>
    </div>
  );
};

export default SpeedSparkline;
