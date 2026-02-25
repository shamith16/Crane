import { For, type Component } from "solid-js";
import { Inbox } from "lucide-solid";
import { useDownloads } from "../../stores/downloads";
import DownloadRow from "./DownloadRow";
import SectionHeader from "./SectionHeader";

const DownloadList: Component = () => {
  const { downloadsByStatus } = useDownloads();

  return (
    <div class="flex flex-col gap-lg p-[16px_20px]">
      <For each={downloadsByStatus()}>
        {(group) => (
          <SectionHeader label={group.label} count={group.items.length}>
            <div class="flex flex-col gap-[8px]">
              <For each={group.items}>
                {(download) => (
                  <DownloadRow download={download} />
                )}
              </For>
            </div>
          </SectionHeader>
        )}
      </For>

      {/* Zero-state hint */}
      <div class="flex items-center gap-[8px] rounded-md bg-inset p-[10px_12px] border border-inset">
        <Inbox size={14} class="text-muted shrink-0" />
        <span class="text-caption text-muted">
          Queue empty? Paste a URL above or drop a file to start a new download.
        </span>
      </div>
    </div>
  );
};

export default DownloadList;
