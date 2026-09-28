import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const PropertiesEditor = ({ selectedLayer, onUpdateLayer }) => {
  const [tag, setTag] = useState('');
  const [lineSize, setLineSize] = useState('');

  useEffect(() => {
    if (selectedLayer) {
      setTag(selectedLayer.tag || '');
      if (selectedLayer.type === 'pipeline') {
        setLineSize(selectedLayer.lineSize || '');
      }
    } else {
      setTag('');
      setLineSize('');
    }
  }, [selectedLayer]);

  const handleUpdate = () => {
    if (!selectedLayer) return;

    const updatedLayer = { ...selectedLayer, tag };
    if (selectedLayer.type === 'pipeline') {
      updatedLayer.lineSize = lineSize;
    }
    onUpdateLayer(updatedLayer);
  };

  if (!selectedLayer) {
    return (
      <div className="text-sm text-pl-muted p-4 text-center bg-pl-sunken rounded-lg">
        Select an item on the map to edit its properties.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-2">
      <div>
        <Label htmlFor="tag-input">Tag / Name</Label>
        <Input
          id="tag-input"
          value={tag}
          onChange={(e) => setTag(e.target.value)}        />
      </div>
      {selectedLayer.type === 'pipeline' && (
        <div>
          <Label htmlFor="linesize-input">Line Size</Label>
          <Input
            id="linesize-input"
            value={lineSize}
            onChange={(e) => setLineSize(e.target.value)}
            placeholder='e.g., 6" or 150mm'          />
        </div>
      )}
      <Button onClick={handleUpdate} className="w-full">
        Update Properties
      </Button>
    </div>
  );
};

export default PropertiesEditor;