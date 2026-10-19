"use client";

interface Props {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}

/** The on/off switch used for settings toggles. */
export function Switch({ checked, onChange, label, disabled = false }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-[color,background-color,border-color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50 enabled:hover:ring-2 enabled:hover:ring-accent/30 ${
        checked
          ? "border-accent bg-accent"
          : "border-border bg-surface-2 enabled:hover:border-accent/70"
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full bg-background shadow transition-transform ${
          checked ? "translate-x-[22px]" : "translate-x-0"
        }`}
      />
    </button>
  );
}
