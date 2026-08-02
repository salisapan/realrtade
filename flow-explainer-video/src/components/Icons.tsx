import React from "react";

type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export const MailIcon: React.FC<IconProps> = ({
  size = 20,
  color = "currentColor",
  strokeWidth = 1.8,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect
      x="3"
      y="5"
      width="18"
      height="14"
      rx="2.5"
      stroke={color}
      strokeWidth={strokeWidth}
    />
    <path
      d="M4 7l8 5.5L20 7"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const SheetIcon: React.FC<IconProps> = ({
  size = 20,
  color = "currentColor",
  strokeWidth = 1.8,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect
      x="3.5"
      y="3.5"
      width="17"
      height="17"
      rx="2.5"
      stroke={color}
      strokeWidth={strokeWidth}
    />
    <path
      d="M3.5 10h17M9.5 10v10"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
    />
  </svg>
);

export const FormIcon: React.FC<IconProps> = ({
  size = 20,
  color = "currentColor",
  strokeWidth = 1.8,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect
      x="5.5"
      y="4"
      width="13"
      height="17"
      rx="2.5"
      stroke={color}
      strokeWidth={strokeWidth}
    />
    <rect
      x="9"
      y="2.3"
      width="6"
      height="3.4"
      rx="1"
      stroke={color}
      strokeWidth={strokeWidth}
    />
    <path
      d="M8.5 12.5h7M8.5 16h4.5"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
    />
  </svg>
);

export const LegalIcon: React.FC<IconProps> = ({
  size = 20,
  color = "currentColor",
  strokeWidth = 1.8,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect
      x="5"
      y="3"
      width="14"
      height="18"
      rx="2.5"
      stroke={color}
      strokeWidth={strokeWidth}
    />
    <path
      d="M8.5 8h7M8.5 12h7M8.5 16h4"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
    />
  </svg>
);

export const ShieldIcon: React.FC<IconProps> = ({
  size = 20,
  color = "currentColor",
  strokeWidth = 1.6,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M12 3l7 3.2v5.4c0 5-3.2 7.9-7 9.1-3.8-1.2-7-4.1-7-9.1V6.2z"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
    <path
      d="M9 12l2.2 2.2L15.5 9.5"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const CheckIcon: React.FC<IconProps> = ({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke={color} strokeWidth={strokeWidth} />
    <path
      d="M8 12.5l2.8 2.8L16.2 9"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const BracketsIcon: React.FC<IconProps> = ({
  size = 20,
  color = "currentColor",
  strokeWidth = 1.8,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M9 4L4 12l5 8"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M15 4l5 8-5 8"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const EyeOffIcon: React.FC<IconProps> = ({
  size = 20,
  color = "currentColor",
  strokeWidth = 1.8,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M3 12s3.5-6.5 9-6.5S21 12 21 12s-3.5 6.5-9 6.5S3 12 3 12z"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="2.6" stroke={color} strokeWidth={strokeWidth} />
    <path
      d="M4 4l16 16"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
    />
  </svg>
);

export const BoltIcon: React.FC<IconProps> = ({
  size = 20,
  color = "currentColor",
  strokeWidth = 1.8,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M13 3L5 13.5h5.5L11 21l8-10.5h-5.5z"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  </svg>
);

export const CalendarIcon: React.FC<IconProps> = ({
  size = 20,
  color = "currentColor",
  strokeWidth = 1.8,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect
      x="3.5"
      y="5"
      width="17"
      height="16"
      rx="2.5"
      stroke={color}
      strokeWidth={strokeWidth}
    />
    <path
      d="M3.5 10h17M8 3v4M16 3v4"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
    />
  </svg>
);

export const ChatIcon: React.FC<IconProps> = ({
  size = 20,
  color = "currentColor",
  strokeWidth = 1.8,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M4 5.5h16v10.5H9l-4 4v-4H4z"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
  </svg>
);

export const DatabaseIcon: React.FC<IconProps> = ({
  size = 20,
  color = "currentColor",
  strokeWidth = 1.8,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <ellipse cx="12" cy="5.5" rx="8" ry="3" stroke={color} strokeWidth={strokeWidth} />
    <path
      d="M4 5.5V18.5C4 20.2 7.6 21.5 12 21.5C16.4 21.5 20 20.2 20 18.5V5.5"
      stroke={color}
      strokeWidth={strokeWidth}
    />
    <path
      d="M4 12C4 13.7 7.6 15 12 15C16.4 15 20 13.7 20 12"
      stroke={color}
      strokeWidth={strokeWidth}
    />
  </svg>
);

export const BellIcon: React.FC<IconProps> = ({
  size = 20,
  color = "currentColor",
  strokeWidth = 1.8,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M6 10a6 6 0 1 1 12 0c0 4 1.4 5.6 2 6.4H4c.6-.8 2-2.4 2-6.4z"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
    <path
      d="M10 19.5a2 2 0 0 0 4 0"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
    />
  </svg>
);
