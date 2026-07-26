import React from 'react';
import { IconType } from '@/types/commandPalette';

interface IconProps {
  className?: string;
  style?: React.CSSProperties;
}

export const TerminalIcon: React.FC<IconProps> = ({ className, style }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className={className} style={style}>
    <path d="M2 3.5L6.5 8L2 12.5L3 13.5L8.5 8L3 2.5L2 3.5Z"/>
    <path d="M8.5 12H14V13.5H8.5V12Z"/>
  </svg>
);

export const FileIcon: React.FC<IconProps> = ({ className, style }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className={className} style={style}>
    <path fillRule="evenodd" clipRule="evenodd" d="M3 1H10L14 5V14C14 14.5523 13.5523 15 13 15H3C2.44772 15 2 14.5523 2 14V2C2 1.44772 2.44772 1 3 1ZM9 2H3V14H13V6H10C9.44772 6 9 5.55228 9 5V2ZM10 2.41421V5H12.5858L10 2.41421Z"/>
  </svg>
);

export const LinkIcon: React.FC<IconProps> = ({ className, style }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className={className} style={style}>
    <path d="M4.5 3H8V4.5H4.5C3.67157 4.5 3 5.17157 3 6V11.5C3 12.3284 3.67157 13 4.5 13H10C10.8284 13 11.5 12.3284 11.5 11.5V8H13V11.5C13 13.1569 11.6569 14.5 10 14.5H4.5C2.84315 14.5 1.5 13.1569 1.5 11.5V6C1.5 4.34315 2.84315 3 4.5 3Z"/>
    <path d="M9 1.5H14.5V7L12.5 5L9.25 8.25L7.75 6.75L11 3.5L9 1.5Z"/>
  </svg>
);

export const CommandIcon: React.FC<IconProps> = ({ className, style }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className={className} style={style}>
    <path d="M3 4L7 8L3 12H5L9 8L5 4H3Z"/>
    <path d="M9 11H13V13H9V11Z"/>
  </svg>
);

export const SettingsIcon: React.FC<IconProps> = ({ className, style }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className={className} style={style}>
    <path fillRule="evenodd" clipRule="evenodd" d="M8 10.5C9.38071 10.5 10.5 9.38071 10.5 8C10.5 6.61929 9.38071 5.5 8 5.5C6.61929 5.5 5.5 6.61929 5.5 8C5.5 9.38071 6.61929 10.5 8 10.5ZM8 9.5C8.82843 9.5 9.5 8.82843 9.5 8C9.5 7.17157 8.82843 6.5 8 6.5C7.17157 6.5 6.5 7.17157 6.5 8C6.5 8.82843 7.17157 9.5 8 9.5Z"/>
    <path fillRule="evenodd" clipRule="evenodd" d="M6.5 1H9.5L10 3L11.5 3.5L13.5 2L15 3.5L14 5.5L14.5 7V9L14 10.5L15 12.5L13.5 14L11.5 13L10 13.5L9.5 15H6.5L6 13.5L4.5 13L2.5 14L1 12.5L2 10.5L1.5 9V7L2 5.5L1 3.5L2.5 2L4.5 3L6 2.5L6.5 1ZM7.31 2L6.9 3.64L6.5 3.8L5.14 3.16L5.04 3.1L3.1 5.04L3.16 5.14L3.8 6.5L3.64 6.9L2 7.31V8.69L3.64 9.1L3.8 9.5L3.16 10.86L3.1 10.96L5.04 12.9L5.14 12.84L6.5 12.2L6.9 12.36L7.31 14H8.69L9.1 12.36L9.5 12.2L10.86 12.84L10.96 12.9L12.9 10.96L12.84 10.86L12.2 9.5L12.36 9.1L14 8.69V7.31L12.36 6.9L12.2 6.5L12.84 5.14L12.9 5.04L10.96 3.1L10.86 3.16L9.5 3.8L9.1 3.64L8.69 2H7.31Z"/>
  </svg>
);

export const ClockIcon: React.FC<IconProps> = ({ className, style }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className={className} style={style}>
    <path fillRule="evenodd" clipRule="evenodd" d="M8 14.5C11.5899 14.5 14.5 11.5899 14.5 8C14.5 4.41015 11.5899 1.5 8 1.5C4.41015 1.5 1.5 4.41015 1.5 8C1.5 11.5899 4.41015 14.5 8 14.5ZM8 13C10.7614 13 13 10.7614 13 8C13 5.23858 10.7614 3 8 3C5.23858 3 3 5.23858 3 8C3 10.7614 5.23858 13 8 13Z"/>
    <path d="M7.25 4.5H8.75V7.69L10.78 9.72L9.72 10.78L7.25 8.31V4.5Z"/>
  </svg>
);

export const getIcon = (iconType: IconType | undefined): React.FC<IconProps> | null => {
  switch (iconType) {
    case IconType.Terminal: return TerminalIcon;
    case IconType.File: return FileIcon;
    case IconType.Link: return LinkIcon;
    case IconType.Command: return CommandIcon;
    case IconType.Settings: return SettingsIcon;
    case IconType.Clock: return ClockIcon;
    default: return null;
  }
};
