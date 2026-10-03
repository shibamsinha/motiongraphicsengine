import React, { useEffect, useRef } from 'react';
import { Mark } from '../brand/Logo';

const DURATION = 2400;

export const Splash: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => done.current(), still ? 600 : DURATION);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="splash" role="status" aria-label="Motion Graphics Engine">
      <div className="splash-lockup">
        <Mark size={88} detailed className="splash-mark" />
        <div className="splash-word" aria-hidden>
          <span>Motion</span> <span>Graphics</span> <span>Engine</span>
        </div>
      </div>
    </div>
  );
};
