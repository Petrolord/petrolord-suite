import React from 'react';

export const StatusBadge = ({ status }) => {
  let colorClass = 'bg-[#A0AEC0]/10 text-[#A0AEC0] border-[#A0AEC0]/20'; // Default / Draft

  switch (status?.toLowerCase()) {
    case 'published':
    case 'approved':
      colorClass = 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20';
      break;
    case 'in review':
    case 'pending':
      colorClass = 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20';
      break;
    case 'superseded':
    case 'obsolete':
    case 'rejected':
      colorClass = 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20';
      break;
  }

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}>
      {status}
    </span>
  );
};

export const ConfidentialityBadge = ({ level }) => {
  let colorClass = 'bg-[#1A1F2E] text-[#A0AEC0] border-[#2D3748]';

  switch (level?.toLowerCase()) {
    case 'public':
      colorClass = 'bg-[#06B6D4]/10 text-[#06B6D4] border-[#06B6D4]/20';
      break;
    case 'internal':
      colorClass = 'bg-[#A0AEC0]/10 text-[#A0AEC0] border-[#A0AEC0]/20';
      break;
    case 'confidential':
      colorClass = 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20';
      break;
    case 'restricted':
      colorClass = 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20';
      break;
  }

  return (
    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold tracking-wider uppercase border ${colorClass}`}>
      {level}
    </span>
  );
};