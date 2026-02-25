import { For, type Component } from "solid-js";
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
    </div>
  );
};

export default DownloadList;
