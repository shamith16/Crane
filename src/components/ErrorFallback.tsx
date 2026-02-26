import { type Component } from "solid-js";
import { TriangleAlert } from "lucide-solid";

interface ErrorFallbackProps {
  error: Error;
  reset: () => void;
}

const ErrorFallback: Component<ErrorFallbackProps> = (props) => {
  return (
    <div class="flex flex-col items-center justify-center h-full gap-md p-[32px] text-center">
      <TriangleAlert size={40} class="text-error" />

      <h2 class="text-heading font-extrabold text-primary">
        Something went wrong
      </h2>

      <p class="text-body text-secondary max-w-[400px] font-mono">
        {props.error.message || "An unexpected error occurred."}
      </p>

      <button
        class="mt-sm px-[16px] py-[8px] rounded-lg bg-accent text-inverted text-body font-mono font-extrabold cursor-pointer hover:bg-accent/80 transition-colors"
        onClick={props.reset}
      >
        Try Again
      </button>
    </div>
  );
};

export default ErrorFallback;
