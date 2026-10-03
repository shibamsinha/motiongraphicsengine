import React, { useId, useState } from 'react';

export const Group: React.FC<{
  title: string;
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, summary, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <section className={`section group${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="section-head group-head"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((current) => !current)}
      >
        {title}
        <span className="spacer" />
        {summary !== undefined && summary !== null ? <span>{summary}</span> : null}
        <span className="group-chevron" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className="controls" id={bodyId}>
          {children}
        </div>
      ) : null}
    </section>
  );
};
