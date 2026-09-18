interface SettingDescriptionProps {
  children: React.ReactNode;
}

export function SettingDescription({ children }: SettingDescriptionProps) {
  return (
    <p className="text-xs text-text-secondary mt-1.5">
      {children}
    </p>
  );
}
