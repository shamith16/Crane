import { Show, type Component } from "solid-js";
import { useSettings } from "../../../stores/settings";
import SettingSection from "../SettingSection";
import SettingRow from "../SettingRow";
import SettingButtonGroup from "../SettingButtonGroup";

const NetworkTab: Component = () => {
  const { config, update } = useSettings();

  return (
    <div class="flex flex-col gap-[24px]">
      <SettingSection title="Proxy">
        <SettingRow label="Proxy Mode" description="Route downloads through a proxy server">
          <SettingButtonGroup
            value={config.network.proxy.mode}
            options={[
              { value: "none", label: "None" },
              { value: "system", label: "System" },
              { value: "http", label: "HTTP" },
              { value: "socks5", label: "SOCKS5" },
            ]}
            onChange={(v) => update("network.proxy.mode", v)}
          />
        </SettingRow>

        <Show when={config.network.proxy.mode === "http" || config.network.proxy.mode === "socks5"}>
          <SettingRow label="Host">
            <input
              type="text"
              value={config.network.proxy.host ?? ""}
              onInput={(e) => update("network.proxy.host", e.currentTarget.value || null)}
              placeholder="proxy.example.com"
              class="bg-surface border border-border rounded-md px-[12px] py-[6px] text-caption font-mono text-primary w-[200px] focus:outline-none focus:border-accent transition-colors"
            />
          </SettingRow>
          <SettingRow label="Port">
            <input
              type="number"
              value={config.network.proxy.port ?? ""}
              onInput={(e) => {
                const v = parseInt(e.currentTarget.value);
                update("network.proxy.port", isNaN(v) ? null : v);
              }}
              placeholder="8080"
              class="bg-surface border border-border rounded-md px-[12px] py-[6px] text-caption font-mono text-primary w-[100px] focus:outline-none focus:border-accent transition-colors"
            />
          </SettingRow>
          <SettingRow label="Username">
            <input
              type="text"
              value={config.network.proxy.username ?? ""}
              onInput={(e) => update("network.proxy.username", e.currentTarget.value || null)}
              placeholder="Optional"
              class="bg-surface border border-border rounded-md px-[12px] py-[6px] text-caption font-mono text-primary w-[200px] focus:outline-none focus:border-accent transition-colors"
            />
          </SettingRow>
          <SettingRow label="Password">
            <input
              type="password"
              value={config.network.proxy.password ?? ""}
              onInput={(e) => update("network.proxy.password", e.currentTarget.value || null)}
              placeholder="Optional"
              class="bg-surface border border-border rounded-md px-[12px] py-[6px] text-caption font-mono text-primary w-[200px] focus:outline-none focus:border-accent transition-colors"
            />
          </SettingRow>
        </Show>
      </SettingSection>

      <SettingSection title="User Agent">
        <SettingRow label="Custom User Agent" description="Override the default HTTP User-Agent header">
          <input
            type="text"
            value={config.network.user_agent ?? ""}
            onInput={(e) => update("network.user_agent", e.currentTarget.value || null)}
            placeholder="Default"
            class="bg-surface border border-border rounded-md px-[12px] py-[6px] text-caption font-mono text-primary w-[280px] focus:outline-none focus:border-accent transition-colors"
          />
        </SettingRow>
      </SettingSection>
    </div>
  );
};

export default NetworkTab;
