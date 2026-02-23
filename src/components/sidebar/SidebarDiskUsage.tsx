import { createSignal, createResource, type Component } from "solid-js";
import { useLayout } from "../layout/LayoutContext";
import { isTauri, getDiskSpace } from "../../lib/tauri";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(0)} GB`;
}

function formatTotal(bytes: number): string {
  const tb = bytes / (1024 * 1024 * 1024 * 1024);
  if (tb >= 0.9) return `${tb.toFixed(1)} TB`;
  return `${Math.round(bytes / (1024 * 1024 * 1024))} GB`;
}

const SidebarDiskUsage: Component = () => {
  const { sidebarExpanded } = useLayout();

  const [diskSpace] = createResource(async () => {
    if (!isTauri()) return { free_bytes: 342_000_000_000, total_bytes: 1_000_000_000_000 };
    return getDiskSpace();
  });

  const usedBytes = () => {
    const ds = diskSpace();
    if (!ds) return 0;
    return ds.total_bytes - ds.free_bytes;
  };

  const usedPercent = () => {
    const ds = diskSpace();
    if (!ds || ds.total_bytes === 0) return 0;
    return Math.round((usedBytes() / ds.total_bytes) * 100);
  };

  return (
    <div class="border-t border-border p-lg">
      {sidebarExpanded() ? (
        <div class="flex flex-col gap-xs">
          <span class="text-caption text-muted uppercase tracking-wider">Disk Usage</span>
          <div class="h-[4px] rounded-full bg-surface overflow-hidden">
            <div
              class="h-full rounded-full bg-accent transition-[width] duration-500"
              style={{ width: `${usedPercent()}%` }}
            />
          </div>
          <div class="flex justify-between">
            <span class="text-caption text-secondary">{formatBytes(usedBytes())}</span>
            <span class="text-caption text-muted">{diskSpace() ? formatTotal(diskSpace()!.total_bytes) : ""}</span>
          </div>
        </div>
      ) : (
        <div class="flex flex-col items-center gap-xs">
          <span class="text-body-sm font-semibold text-secondary">
            {Math.round(usedBytes() / (1024 * 1024 * 1024))}
          </span>
          <span class="text-caption text-muted">GB</span>
        </div>
      )}
    </div>
  );
};

export default SidebarDiskUsage;
