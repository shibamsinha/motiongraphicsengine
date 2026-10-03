import React, { useId, useState } from 'react';

export const Disclosure: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => {
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  return (
    <div className={`disclosure${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="disclosure-toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="disclosure-chevron" aria-hidden>
          ▾
        </span>
        {label}
      </button>
      {open ? (
        <div className="disclosure-body" id={bodyId}>
          {children}
        </div>
      ) : null}
    </div>
  );
};
