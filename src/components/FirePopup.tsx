import React from 'react';

interface FirePopupProps {
  incidentName?: string;
  discoveryDate?: string;
  forestType?: string;
  percentContained?: number;
  dailyAcres?: number;
}

export const FirePopup: React.FC<FirePopupProps> = ({
  incidentName = 'Not Available',
  discoveryDate = 'Not Available',
  forestType = 'Not Available',
  percentContained,
  dailyAcres,
}) => (
  <div className="p-1">
    <h4 className="font-semibold text-base flex items-center">
      🔥 Wildfire Incident
    </h4>
    <div className="mt-2 space-y-1 text-sm">
      <p><strong>Incident Name:</strong> {incidentName}</p>
      <p><strong>Start Date:</strong> {discoveryDate}</p>
      <p><strong>Forest Type:</strong> {forestType}</p>
      <p><strong>Percent Contained:</strong> {percentContained !== undefined ? `${percentContained}%` : 'Not Available'}</p>
      <p><strong>Acres:</strong> {dailyAcres !== undefined ? dailyAcres.toLocaleString() : 'Not Available'}</p>
    </div>
  </div>
);