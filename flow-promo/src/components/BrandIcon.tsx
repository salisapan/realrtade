import React from 'react';
import * as simpleIcons from 'simple-icons';

export type BrandKey = 'gmail' | 'calendar' | 'notion' | 'jira' | 'hubspot' | 'zoom';

type IconData = { path: string; hex: string; title: string };

const ICONS: Record<BrandKey, IconData> = {
  gmail: simpleIcons.siGmail,
  calendar: simpleIcons.siGooglecalendar,
  notion: simpleIcons.siNotion,
  jira: simpleIcons.siJira,
  hubspot: simpleIcons.siHubspot,
  zoom: simpleIcons.siZoom,
};

export const brandColor = (brand: BrandKey) => `#${ICONS[brand].hex}`;
export const brandTitle = (brand: BrandKey) => ICONS[brand].title;

export const BrandIcon: React.FC<{ brand: BrandKey; size: number; color?: string }> = ({
  brand,
  size,
  color,
}) => {
  const icon = ICONS[brand];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block' }}>
      <path d={icon.path} fill={color ?? `#${icon.hex}`} />
    </svg>
  );
};
