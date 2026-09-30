interface SettingDescriptionProps {
  children: React.ReactNode;
}

export function SettingDescription({ children }: SettingDescriptionProps) {
  return (
    // pre-line: a description can put a second line, such as the settings key a
    // row writes, under its sentence with a plain "\n" in the translation.
    <p className="text-xs text-text-secondary mt-1.5 whitespace-pre-line">
      {children}
    </p>
  );
}
