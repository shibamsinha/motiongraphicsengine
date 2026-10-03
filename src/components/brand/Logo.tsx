import React, { useId } from 'react';

export const Mark: React.FC<{ size: number; detailed?: boolean; className?: string }> = ({
  size,
  detailed = false,
  className,
}) => {
  const gradient = `mark-${useId().replace(/[^a-z0-9]/gi, '')}`;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FF4D6D" />
          <stop offset="1" stopColor="#FFB347" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="#151925" />
      <rect x=".5" y=".5" width="63" height="63" rx="14.5" fill="none" stroke="#fff" strokeOpacity=".09" />
      {detailed ? (
        <g className="mark-handles">
          <path d="M13 45H31M51 19H33" stroke="#fff" strokeOpacity=".28" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="31" cy="45" r="2.3" fill="#fff" fillOpacity=".6" />
          <circle cx="33" cy="19" r="2.3" fill="#fff" fillOpacity=".6" />
        </g>
      ) : null}
      <path
        className="mark-curve"
        d="M13 45C36 45 28 19 51 19"
        pathLength={1}
        fill="none"
        stroke={`url(#${gradient})`}
        strokeWidth={detailed ? 4.5 : 5.5}
        strokeLinecap="round"
      />
      <path className="mark-key mark-key-in" d="M13 40 18 45 13 50 8 45Z" fill="#fff" />
      <path className="mark-key mark-key-out" d="M51 14 56 19 51 24 46 19Z" fill="#fff" />
    </svg>
  );
};

export const Logo: React.FC<{ size?: number; className?: string }> = ({ size = 26, className }) => (
  <div className={className ? `logo ${className}` : 'logo'} role="img" aria-label="Motion Graphics Engine">
    <Mark size={size} />
    <span className="logo-word">
      Motion Graphics <span>Engine</span>
    </span>
  </div>
);
