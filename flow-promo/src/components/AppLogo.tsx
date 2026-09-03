import React from 'react';
import logoSet from '@iconify-json/logos/icons.json';

type IconEntry = { body: string; width?: number; height?: number };

const SET = logoSet as unknown as {
  width: number;
  height: number;
  icons: Record<string, IconEntry>;
};

export type LogoKey =
  | 'microsoft-icon'
  | 'adobe-icon'
  | 'adobe-illustrator'
  | 'slack-icon'
  | 'salesforce'
  | 'google-gmail'
  | 'google-calendar'
  | 'google-drive'
  | 'notion-icon'
  | 'jira'
  | 'hubspot'
  | 'zoom-icon'
  | 'dropbox'
  | 'box';

export const hasLogo = (key: string): boolean => Boolean(SET.icons[key]);

/**
 * Renders a mark from the SVG Logos set. Each entry carries only its inner
 * body plus optional per-icon dimensions, so the viewBox falls back to the
 * set defaults when the icon does not override them.
 */
export const AppLogo: React.FC<{ logo: LogoKey | string; size: number }> = ({ logo, size }) => {
  const icon = SET.icons[logo];
  if (!icon) return null;

  const w = icon.width ?? SET.width;
  const h = icon.height ?? SET.height;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${w} ${h}`}
      style={{ display: 'block', overflow: 'visible' }}
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
};
