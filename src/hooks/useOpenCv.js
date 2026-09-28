import { useState, useEffect, useCallback } from 'react';

export const useOpenCv = (onReady) => {
    const [isCvReady, setIsCvReady] = useState(false);
    const [error, setError] = useState(null);

    const msg = useCallback((text, isError = false) => {
        const m = document.getElementById('ld-msg');
        if (m) {
            m.textContent = text;
            m.className = `text-center min-h-[1.5rem] mt-2 ${isError ? 'text-pl-danger-text' : 'text-pl-success-text'}`;
        }
    }, []);

    useEffect(() => {
        if (window.cv && window.cv.imread) {
            setIsCvReady(true);
            msg('OpenCV Ready.');
            if(onReady) onReady();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://docs.opencv.org/4.9.0/opencv.js';
        script.async = true;
        script.onload = () => {
             const checkCv = () => {
                if (window.cv && window.cv.imread) {
                    setIsCvReady(true);
                    msg('OpenCV Ready. You can now use Auto Digitize.');
                    if(onReady) onReady();
                } else {
                    setTimeout(checkCv, 100);
                }
            };
            checkCv();
        };
        script.onerror = () => {
            const errorMsg = 'Failed to load OpenCV library. Please check your internet connection.';
            setError(errorMsg);
            msg(errorMsg, true);
        };
        document.body.appendChild(script);

        return () => {
            document.body.removeChild(script);
        };
    }, [msg, onReady]);

    return { isCvReady, error, msg };
};