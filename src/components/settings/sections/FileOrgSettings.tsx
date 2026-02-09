import { For } from "solid-js";
import type { AppConfig } from "../../../lib/types";

interface Props {
  config: AppConfig;
  onSave: (config: AppConfig) => void;
}

const DEFAULT_CATEGORIES = [
  "documents",
  "video",
  "audio",
  "images",
  "archives",
  "software",
  "other",
];

export default function FileOrgSettings(props: Props) {
  function update(patch: Partial<AppConfig["file_organization"]>) {
    props.onSave({
      ...props.config,
      file_organization: { ...props.config.file_organization, ...patch },
    });
  }

  function updateCategoryFolder(category: string, folder: string) {
    const updated = {
      ...props.config.file_organization.category_folders,
      [category]: folder,
    };
    update({ category_folders: updated });
  }

  return (
    <div class="max-w-2xl space-y-6">
      <h2 class="text-base font-semibold text-text-primary">
        File Organization
      </h2>

      {/* Auto-Categorize */}
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm font-medium text-text-primary">
            Auto-Categorize
          </div>
          <div class="text-xs text-text-muted">
            Automatically sort downloads into category folders
          </div>
        </div>
        <Toggle
          value={props.config.file_organization.auto_categorize}
          onChange={(v) => update({ auto_categorize: v })}
        />
      </div>

      {/* Date Subfolders */}
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm font-medium text-text-primary">
            Date Subfolders
          </div>
          <div class="text-xs text-text-muted">
            Organize downloads into date-based subfolders (e.g., 2026/02)
          </div>
        </div>
        <Toggle
          value={props.config.file_organization.date_subfolders}
          onChange={(v) => update({ date_subfolders: v })}
        />
      </div>

      {/* Duplicate Handling */}
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-text-secondary">
          Duplicate File Handling
        </label>
        <select
          class="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-active"
          value={props.config.file_organization.duplicate_handling}
          onChange={(e) =>
            update({
              duplicate_handling: e.currentTarget.value as
                | "ask"
                | "rename"
                | "overwrite"
                | "skip",
            })
          }
        >
          <option value="ask">Ask</option>
          <option value="rename">Rename</option>
          <option value="overwrite">Overwrite</option>
          <option value="skip">Skip</option>
        </select>
      </div>

      {/* Category Folder Mappings */}
      <div class="space-y-3">
        <label class="text-sm font-medium text-text-secondary">
          Category Folder Mappings
        </label>
        <div class="space-y-2">
          <For each={DEFAULT_CATEGORIES}>
            {(category) => (
              <div class="flex items-center gap-3">
                <span class="w-24 text-sm text-text-secondary capitalize shrink-0">
                  {category}
                </span>
                <input
                  type="text"
                  class="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder-text-muted outline-none focus:border-active"
                  placeholder={category}
                  value={
                    props.config.file_organization.category_folders[category] ??
                    ""
                  }
                  onInput={(e) =>
                    updateCategoryFolder(category, e.currentTarget.value)
                  }
                />
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}

function Toggle(props: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      class={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
        props.value ? "bg-active" : "bg-surface border border-border"
      }`}
      onClick={() => props.onChange(!props.value)}
      role="switch"
      aria-checked={props.value}
    >
      <span
        class={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${
          props.value ? "translate-x-5" : "translate-x-1"
        }`}
      />
    </button>
  );
}
