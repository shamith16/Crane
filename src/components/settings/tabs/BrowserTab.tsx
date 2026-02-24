import type { Component } from "solid-js";
import { Chrome } from "lucide-solid";
import SettingSection from "../SettingSection";
import SettingRow from "../SettingRow";

const BrowserTab: Component = () => {
  return (
    <div class="flex flex-col gap-[24px]">
      <SettingSection title="Browser Extensions" description="Connect Crane to your browser for seamless download interception">
        <SettingRow label="Chrome Extension">
          <div class="flex items-center gap-[8px]">
            <Chrome size={16} class="text-muted" />
            <span class="text-caption font-mono text-secondary">Installed</span>
            <span class="w-[8px] h-[8px] rounded-full bg-success" />
          </div>
        </SettingRow>
        <SettingRow label="Firefox Extension">
          <div class="flex items-center gap-[8px]">
            <span class="text-caption font-mono text-muted">Not Available</span>
            <span class="w-[8px] h-[8px] rounded-full bg-muted/30" />
          </div>
        </SettingRow>
      </SettingSection>

      <SettingSection title="Interception" description="Settings are configured in the browser extension popup">
        <SettingRow label="Min File Size" description="Files smaller than this stay in the browser (default: 1 MB)">
          <span class="text-caption font-mono text-muted">Configure in extension</span>
        </SettingRow>
        <SettingRow label="File Type Filter" description="Choose which file types Crane intercepts">
          <span class="text-caption font-mono text-muted">Configure in extension</span>
        </SettingRow>
      </SettingSection>
    </div>
  );
};

export default BrowserTab;
