import { Show } from "solid-js";
import type { AppConfig, ProxyConfig } from "../../../lib/types";

interface Props {
  config: AppConfig;
  onSave: (config: AppConfig) => void;
}

export default function NetworkSettings(props: Props) {
  function updateNetwork(patch: Partial<AppConfig["network"]>) {
    props.onSave({
      ...props.config,
      network: { ...props.config.network, ...patch },
    });
  }

  function updateProxy(patch: Partial<ProxyConfig>) {
    updateNetwork({
      proxy: { ...props.config.network.proxy, ...patch },
    });
  }

  const proxyMode = () => props.config.network.proxy.mode;
  const showProxyFields = () =>
    proxyMode() === "http" || proxyMode() === "socks5";

  return (
    <div class="max-w-2xl space-y-6">
      <h2 class="text-base font-semibold text-text-primary">Network</h2>

      {/* Proxy Mode */}
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-text-secondary">
          Proxy Mode
        </label>
        <select
          class="w-full bg-surface border border-border rounded-full px-3 py-2 text-sm text-text-primary outline-none focus:border-active"
          value={proxyMode()}
          onChange={(e) =>
            updateProxy({
              mode: e.currentTarget.value as ProxyConfig["mode"],
            })
          }
        >
          <option value="none">None</option>
          <option value="system">System</option>
          <option value="http">HTTP</option>
          <option value="socks5">SOCKS5</option>
        </select>
      </div>

      {/* Proxy Host & Port */}
      <Show when={showProxyFields()}>
        <div class="grid grid-cols-3 gap-3">
          <div class="col-span-2 space-y-1.5">
            <label class="text-sm font-medium text-text-secondary">
              Proxy Host
            </label>
            <input
              type="text"
              class="w-full bg-surface border border-border rounded-full px-3 py-2 text-sm text-text-primary placeholder-text-muted outline-none focus:border-active"
              placeholder="127.0.0.1"
              value={props.config.network.proxy.host ?? ""}
              onInput={(e) =>
                updateProxy({ host: e.currentTarget.value || null })
              }
            />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-text-secondary">Port</label>
            <input
              type="number"
              class="w-full bg-surface border border-border rounded-full px-3 py-2 text-sm text-text-primary placeholder-text-muted outline-none focus:border-active tabular-nums"
              placeholder="8080"
              value={props.config.network.proxy.port ?? ""}
              onInput={(e) => {
                const val = parseInt(e.currentTarget.value);
                updateProxy({ port: isNaN(val) ? null : val });
              }}
            />
          </div>
        </div>

        {/* Proxy Auth */}
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-text-secondary">
              Username
            </label>
            <input
              type="text"
              class="w-full bg-surface border border-border rounded-full px-3 py-2 text-sm text-text-primary placeholder-text-muted outline-none focus:border-active"
              placeholder="Optional"
              value={props.config.network.proxy.username ?? ""}
              onInput={(e) =>
                updateProxy({ username: e.currentTarget.value || null })
              }
            />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-text-secondary">
              Password
            </label>
            <input
              type="password"
              class="w-full bg-surface border border-border rounded-full px-3 py-2 text-sm text-text-primary placeholder-text-muted outline-none focus:border-active"
              placeholder="Optional"
              value={props.config.network.proxy.password ?? ""}
              onInput={(e) =>
                updateProxy({ password: e.currentTarget.value || null })
              }
            />
          </div>
        </div>
      </Show>

      {/* Custom User-Agent */}
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-text-secondary">
          Custom User-Agent
        </label>
        <input
          type="text"
          class="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted outline-none focus:border-active"
          placeholder="Leave empty for default"
          value={props.config.network.user_agent ?? ""}
          onInput={(e) =>
            updateNetwork({ user_agent: e.currentTarget.value || null })
          }
        />
        <div class="text-xs text-text-muted">
          Override the default user-agent string for download requests
        </div>
      </div>

      {/* Speed Schedule */}
      <div class="space-y-3">
        <div>
          <div class="text-sm font-medium text-text-primary">
            Speed Schedule
          </div>
          <div class="text-xs text-text-muted">
            Set bandwidth limits for specific time periods
          </div>
        </div>
        <div class="bg-surface border border-border rounded-lg p-4">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-text-muted text-xs">
                <th class="text-left pb-2 font-medium">Start Hour</th>
                <th class="text-left pb-2 font-medium">End Hour</th>
                <th class="text-left pb-2 font-medium">Limit (KB/s)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  colspan={3}
                  class="text-center text-text-muted italic py-4 text-xs"
                >
                  No speed schedule entries configured. This feature will be
                  available in a future update.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
