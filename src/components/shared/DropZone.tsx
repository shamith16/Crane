import { createSignal, Show } from "solid-js";
import type { JSX } from "solid-js";

interface Props {
  onUrlDrop: (url: string) => void;
  onFileDrop: (urls: string[]) => void;
  children: JSX.Element;
}

export default function DropZone(props: Props) {
  const [dragging, setDragging] = createSignal(false);
  let dragCounter = 0;

  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    dragCounter++;
    setDragging(true);
  }

  function handleDragLeave() {
    dragCounter--;
    if (dragCounter === 0) setDragging(false);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragCounter = 0;
    setDragging(false);

    // Check for dropped text (URL)
    const text = e.dataTransfer?.getData("text/plain");
    if (text) {
      const urls = text.split("\n").map(s => s.trim()).filter(s => {
        try { new URL(s); return true; } catch { return false; }
      });
      if (urls.length === 1) {
        props.onUrlDrop(urls[0]);
      } else if (urls.length > 1) {
        props.onFileDrop(urls);
      }
      return;
    }

    // Check for dropped files (.txt, .csv)
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      for (const file of Array.from(files)) {
        if (file.name.endsWith(".txt") || file.name.endsWith(".csv")) {
          const content = await file.text();
          const urls = content.split("\n").map(s => s.trim()).filter(s => {
            try { new URL(s); return true; } catch { return false; }
          });
          if (urls.length > 0) {
            props.onFileDrop(urls);
          }
        }
      }
    }
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      class="relative h-full"
    >
      {props.children}
      <Show when={dragging()}>
        <div class="absolute inset-0 bg-bg/90 flex items-center justify-center z-50 border-2 border-dashed border-active rounded-lg">
          <div class="text-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-12 h-12 mx-auto mb-3 text-active">
              <path fill-rule="evenodd" d="M12 2.25a.75.75 0 0 1 .75.75v11.69l3.22-3.22a.75.75 0 1 1 1.06 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 1 1 1.06-1.06l3.22 3.22V3a.75.75 0 0 1 .75-.75Zm-9 13.5a.75.75 0 0 1 .75.75v2.25a1.5 1.5 0 0 0 1.5 1.5h13.5a1.5 1.5 0 0 0 1.5-1.5V16.5a.75.75 0 0 1 1.5 0v2.25a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V16.5a.75.75 0 0 1 .75-.75Z" clip-rule="evenodd" />
            </svg>
            <div class="text-lg text-text-primary font-medium">Drop to download</div>
            <div class="text-sm text-text-secondary mt-1">URL or text file with URLs</div>
          </div>
        </div>
      </Show>
    </div>
  );
}
