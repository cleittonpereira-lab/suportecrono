import React from 'react';

export const SectionBar = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded border border-[#9ca3af] bg-[#d1d5db] px-2 py-0.5 text-center text-[9px] font-bold uppercase tracking-wide text-[#111827] ${className}`}>
    {children}
  </div>
);
