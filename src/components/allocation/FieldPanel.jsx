// Allocation Studio field rail: the shared production FieldPicker wired
// to the allocation context.
import React from 'react';
import FieldPicker from '@/components/production/FieldPicker';
import { useAllocation } from '@/contexts/ProductionAllocationContext';

const FieldPanel = () => {
  const {
    fields, currentField, canEditField, inputs,
    selectField, createField, deleteField, shareCurrentField, unshareCurrentField,
  } = useAllocation();

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
