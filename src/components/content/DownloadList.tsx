import { For, Show, type Component } from "solid-js";
import { Inbox } from "lucide-solid";
import type { Download } from "../../types/download";
import { mockDownloads } from "../../data/mockDownloads";
import DownloadRow from "./DownloadRow";
import SectionHeader from "./SectionHeader";

type StatusGroup = {
  key: string;
  label: string;
  items: Download[];
};

function groupByStatus(downloads: Download[]): StatusGroup[] {
  const order: { key: Download["status"]; label: string }[] = [
    { key: "downloading", label: "Active" },
    { key: "analyzing", label: "Analyzing" },
    { key: "paused", label: "Paused" },
    { key: "queued", label: "Queued" },
    { key: "failed", label: "Failed" },
    { key: "completed", label: "Completed" },
  ];

  return order
    .map((group) => ({
      key: group.key,
      label: group.label,
      items: downloads.filter((d) => d.status === group.key),
    }))
    .filter((group) => group.items.length > 0);
}

const DownloadList: Component = () => {
  const groups = () => groupByStatus(mockDownloads);

  return (
    <div class="flex flex-col gap-lg p-[16px_20px]">
      <For each={groups()}>
        {(group) => (
          <SectionHeader label={group.label} count={group.items.length}>
            <div class="flex flex-col gap-[8px]">
              <For each={group.items}>
                {(download) => <DownloadRow download={download} />}
              </For>
            </div>
          </SectionHeader>
        )}
      </For>

      {/* Zero-state hint */}
      <div class="flex items-center gap-[8px] rounded-md bg-inset p-[10px_12px] border border-border">
        <Inbox size={14} class="text-muted shrink-0" />
        <span class="text-caption text-muted">
          Queue empty? Paste a URL above or drop a file to start a new download.
        </span>
      </div>
    </div>
  );
};

export default DownloadList;
