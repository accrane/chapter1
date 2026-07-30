import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

// ISBN barcodes are EAN-13 (sometimes with an EAN-5 price add-on we ignore).
const hints = new Map();
hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8]);

export function Scanner({
  onResult,
  onClose
}: {
  onResult: (isbn: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const reader = new BrowserMultiFormatReader(hints);
    let controls: { stop: () => void } | undefined;
    let done = false;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
        if (result && !done) {
          const text = result.getText();
          // ISBNs start with 978/979; ignore other retail barcodes.
          if (/^97[89]\d{10}$/.test(text)) {
            done = true;
            controls?.stop();
            onResult(text);
          }
        }
      })
      .then((c) => {
        controls = c;
        if (done) c.stop();
      })
      .catch((err) => {
        console.error(err);
        setError(
          err?.name === 'NotAllowedError'
            ? 'Camera access was denied. Allow camera access and try again.'
            : 'Could not start the camera on this device.'
        );
      });

    return () => {
      done = true;
      controls?.stop();
    };
  }, [onResult]);

  return (
    <div className="scanner-overlay" role="dialog" aria-label="Barcode scanner">
      <div className="scanner-box">
        <video ref={videoRef} className="scanner-video" muted playsInline />
        <div className="scanner-target" aria-hidden />
      </div>
      <p className="scanner-hint">
        {error || 'Point the camera at the barcode on the back of the book.'}
      </p>
      <button className="primary" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}
