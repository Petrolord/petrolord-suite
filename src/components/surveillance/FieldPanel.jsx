// Surveillance Studio field rail: the shared production FieldPicker
// wired to the surveillance context.
import React from 'react';
import FieldPicker from '@/components/production/FieldPicker';
import { useSurveillance } from '@/contexts/ProductionSurveillanceContext';

const FieldPanel = () => {
  const {
    fields, currentField, canEditField, inputs,
    selectField, createField, deleteField, shareCurrentField, unshareCurrentField,
  } = useSurveillance();

  return (
    <FieldPicker
      fields={fields}
      fieldId={inputs.fieldId}
      currentField={currentField}
      canEditField={canEditField}
      onSelect={selectField}
      onCreate={createField}
      onDelete={deleteField}
      onShare={shareCurrentField}
      onUnshare={unshareCurrentField}
    />
  );
};

export default FieldPanel;
