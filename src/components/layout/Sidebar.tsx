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
import SidebarItem from "../sidebar/SidebarItem";
import SidebarSection from "../sidebar/SidebarSection";
import SidebarLogo from "../sidebar/SidebarLogo";
import SidebarDiskUsage from "../sidebar/SidebarDiskUsage";

const statusFilters = [
  { id: "all", label: "All Downloads", icon: Loader, count: 24 },
  { id: "active", label: "Active", icon: Loader, count: 3 },
  { id: "queued", label: "Queued", icon: Clock3, count: 5 },
  { id: "completed", label: "Completed", icon: CircleCheck, count: 14 },
  { id: "failed", label: "Failed", icon: CircleX, count: 1 },
  { id: "paused", label: "Paused", icon: CirclePause, count: 1 },
] as const;

const categoryFilters = [
  { id: "documents", label: "Documents", icon: FileText, count: 8 },
  { id: "video", label: "Video", icon: Video, count: 4 },
  { id: "audio", label: "Audio", icon: Music, count: 2 },
  { id: "images", label: "Images", icon: Image, count: 3 },
  { id: "archives", label: "Archives", icon: Archive, count: 5 },
  { id: "software", label: "Software", icon: Package, count: 1 },
  { id: "other", label: "Other", icon: File, count: 1 },
] as const;

const Sidebar: Component = () => {
  const { sidebarExpanded, toggleSidebar } = useLayout();
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
                count={filter.count}
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
                count={filter.count}
                active={activeFilter() === filter.id}
                onClick={() => setActiveFilter(filter.id)}
              />
            ))}
          </SidebarSection>
        </div>
      </div>

      {/* Settings — temp sidebar toggle until keyboard shortcut is added */}
      <div class="px-sm pb-sm">
        <SidebarItem
          icon={() => <Settings size={18} />}
          label="Settings"
          onClick={toggleSidebar}
        />
      </div>

      {/* Disk usage */}
      <SidebarDiskUsage />
    </aside>
  );
};

export default Sidebar;
