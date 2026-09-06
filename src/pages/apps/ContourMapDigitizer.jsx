import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import useContourDigitizer from '@/hooks/useContourDigitizer';
import InputPanel from '@/components/contourmap/InputPanel';
import ResultsPanel from '@/components/contourmap/ResultsPanel';
import EmptyState from '@/components/contourmap/EmptyState';
import { Toaster } from '@/components/ui/toaster';

const ContourMapDigitizer = () => {
  const { toast } = useToast();
  const {
    state,
    setState,
    imgCanvasRef,
    ovrCanvasRef,
    handleFileUpload,
    handleGeoref,
    handleAutoTrace,
    handleManualDraw,
    handleDeleteLine,
    handleSetLineValue,
    handleGrid,
    handlePublishSurface,
    handleSaveProject,
    handleLoadProject,
    handleExport,
    isProcessing,
    status,
    isCvReady,
  } = useContourDigitizer(toast);

  const { imagePreview } = state;

  return (
    <>
      <Helmet>
        <title>Contour Map Digitizer - Petrolord</title>
        <meta name="description" content="AI-powered digitization of contour maps, project management, and 3D horizon grid generation." />
      </Helmet>
      <div className="flex flex-col md:flex-row h-screen bg-gray-900 text-white font-sans">
        {/* Mobile & Desktop Responsive Sidebar */}
        <motion.div 
          initial={{ x: -50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          className="w-full md:w-2/5 xl:w-1/3 p-4 sm:p-6 flex flex-col bg-slate-900/50 backdrop-blur-lg border-b md:border-b-0 md:border-r border-white/10 overflow-y-auto md:h-full shrink-0"
        >
          <div className="flex items-center mb-6">
            <Link to="/dashboard/geoscience">
              <Button variant="outline" size="icon" className="h-9 w-9 mr-4 border-lime-400/50 text-lime-300 hover:bg-lime-500/20 hover:text-white">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <h1 className="text-xl font-bold text-white tracking-tight">Contour Map Digitizer</h1>
          </div>
          <div className="flex-grow">
            <InputPanel
              state={state}
              setState={setState}
              onFileUpload={handleFileUpload}
              onGeoref={handleGeoref}
              onAutoTrace={handleAutoTrace}
              onManualDraw={handleManualDraw}
              onDeleteLine={handleDeleteLine}
              onSetLineValue={handleSetLineValue}
              onGrid={handleGrid}
              onPublishSurface={handlePublishSurface}
              onSaveProject={handleSaveProject}
              onLoadProject={handleLoadProject}
              onExport={handleExport}
              isProcessing={isProcessing}
              isCvReady={isCvReady}
            />
          </div>
        </motion.div>
        
        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-6 overflow-y-auto h-full relative">
          {!imagePreview && !isProcessing && (
            <EmptyState onUpload={() => document.getElementById('image-upload-dropzone')?.click()} />
          )}
          {isProcessing && (
            <div className="flex items-center justify-center h-full">
              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center"
              >
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-lime-400 mx-auto"></div>
                <p className="text-white mt-4 text-lg font-semibold">{status || 'Processing...'}</p>
                <p className="text-lime-300">Please wait while the magic happens.</p>
              </motion.div>
            </div>
          )}
          {imagePreview && !isProcessing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="h-full"
            >
              <ResultsPanel
                state={state}
                setState={setState}
                imgCanvasRef={imgCanvasRef}
                ovrCanvasRef={ovrCanvasRef}
                onManualDraw={handleManualDraw}
                onAutoTrace={handleAutoTrace}
              />
            </motion.div>
          )}
        </main>
      </div>
      <Toaster />
    </>
  );
};

export default ContourMapDigitizer;