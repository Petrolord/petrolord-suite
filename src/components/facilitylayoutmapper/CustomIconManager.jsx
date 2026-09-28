import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { UploadCloud, ImagePlus } from 'lucide-react';

const CustomIconManager = ({ onAddCustomIcon }) => {
  const { toast } = useToast();
  const [iconName, setIconName] = useState('');
  const [iconFile, setIconFile] = useState(null);
  const [preview, setPreview] = useState(null);

  const onDrop = (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (file && (file.type.startsWith('image/svg') || file.type.startsWith('image/png'))) {
      setIconFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result);
      };
      reader.readAsDataURL(file);
    } else {
      toast({
        variant: 'destructive',
        title: 'Invalid File Type',
        description: 'Please upload an SVG or PNG file.',
      });
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/svg+xml': ['.svg'], 'image/png': ['.png'] },
    multiple: false,
  });

  const handleAddIcon = () => {
    if (!iconName.trim()) {
      toast({ variant: 'destructive', title: 'Icon Name Required' });
      return;
    }
    if (!iconFile) {
      toast({ variant: 'destructive', title: 'Icon File Required' });
      return;
    }

    const newIcon = {
      name: iconName,
      type: 'icon',
      isCustom: true,
      iconUrl: preview,
    };

    onAddCustomIcon(newIcon);
    setIconName('');
    setIconFile(null);
    setPreview(null);
  };

  return (
    <div className="space-y-4 p-2">
      <div className="space-y-2">
        <Label htmlFor="icon-name">Icon Name</Label>
        <Input
          id="icon-name"
          placeholder="e.g., Custom Valve"
          value={iconName}
          onChange={(e) => setIconName(e.target.value)}        />
      </div>
      <div className="space-y-2">
        <Label>Icon File (SVG or PNG)</Label>
        <div
          {...getRootProps()}
          className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors
            ${isDragActive ? 'border-pl-primary bg-pl-sunken' : 'border-pl-border-strong hover:border-pl-primary'}`}
        >
          <input {...getInputProps()} />
          {preview ? (
            <img src={preview} alt="Icon preview" className="h-12 w-12 object-contain" />
          ) : (
            <div className="text-center text-pl-muted">
              <UploadCloud className="w-8 h-8 mx-auto mb-2" />
              {isDragActive ? (
                <p>Drop the file here...</p>
              ) : (
                <p>Drag & drop, or click to select</p>
              )}
            </div>
          )}
        </div>
      </div>
      <Button onClick={handleAddIcon} className="w-full">
        <ImagePlus className="w-4 h-4 mr-2" /> Add to Toolbar
      </Button>
    </div>
  );
};

export default CustomIconManager;