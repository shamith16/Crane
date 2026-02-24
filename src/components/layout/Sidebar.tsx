import { createSignal, type Component } from "solid-js";
import {
  Loader,
  Clock3,
  CircleCheck,
  CircleX,
  CirclePause,
  FileText,
  Video,
  Music,
  Image,
  Archive,
  Package,
  File,
  Settings,
} from "lucide-solid";
import { useLayout } from "./LayoutContext";
import { useDownloads } from "../../stores/downloads";
import SidebarItem from "../sidebar/SidebarItem";
import SidebarSection from "../sidebar/SidebarSection";
import SidebarLogo from "../sidebar/SidebarLogo";
import SidebarDiskUsage from "../sidebar/SidebarDiskUsage";

const statusFilters = [
  { id: "all", label: "All Downloads", icon: Loader },
  { id: "active", label: "Active", icon: Loader },
  { id: "queued", label: "Queued", icon: Clock3 },
  { id: "completed", label: "Completed", icon: CircleCheck },
  { id: "failed", label: "Failed", icon: CircleX },
  { id: "paused", label: "Paused", icon: CirclePause },
] as const;

const categoryFilters = [
  { id: "documents", label: "Documents", icon: FileText },
  { id: "video", label: "Video", icon: Video },
  { id: "audio", label: "Audio", icon: Music },
  { id: "images", label: "Images", icon: Image },
  { id: "archives", label: "Archives", icon: Archive },
  { id: "software", label: "Software", icon: Package },
  { id: "other", label: "Other", icon: File },
] as const;

const Sidebar: Component = () => {
  const { sidebarExpanded, setCurrentPage } = useLayout();
  const { statusCounts, categoryCounts } = useDownloads();
  const [activeFilter, setActiveFilter] = createSignal<string>("all");

  return (
    <aside
      class="flex flex-col min-h-0 bg-inset border-r border-border transition-all duration-200 ease-in-out shrink-0 overflow-hidden"
      style={{ width: sidebarExpanded() ? "240px" : "64px" }}
    >
      {/* Logo */}
      <div class="px-lg pt-[20px] pb-lg">
        <SidebarLogo />
      </div>

      {/* Divider */}
      <div class="h-px bg-border mx-lg" />

      {/* Scrollable filter sections */}
      <div class="flex-1 min-h-0 overflow-y-auto">
        {/* Status filters */}
        <div class="px-sm pt-lg pb-sm">
          <SidebarSection label="Status">
            {statusFilters.map((filter) => (
              <SidebarItem
                icon={() => <filter.icon size={18} />}
                label={filter.label}
                count={statusCounts()[filter.id] ?? 0}
                active={activeFilter() === filter.id}
                onClick={() => setActiveFilter(filter.id)}
              />
            ))}
          </SidebarSection>
        </div>

        {/* Divider */}
        <div class="h-px bg-border mx-lg" />

        {/* Category filters */}
        <div class="px-sm pt-lg pb-sm">
          <SidebarSection label="Categories">
            {categoryFilters.map((filter) => (
              <SidebarItem
                icon={() => <filter.icon size={18} />}
                label={filter.label}
                count={categoryCounts()[filter.id] ?? 0}
                active={activeFilter() === filter.id}
                onClick={() => setActiveFilter(filter.id)}
              />
            ))}
          </SidebarSection>
        </div>
      </div>

      {/* Settings */}
      <div class="px-sm pb-sm">
        <SidebarItem
          icon={() => <Settings size={18} />}
          label="Settings"
          onClick={() => setCurrentPage("settings")}
        />
      </div>

      {/* Disk usage */}
      <SidebarDiskUsage />
    </aside>
  );
};

export default Sidebar;
