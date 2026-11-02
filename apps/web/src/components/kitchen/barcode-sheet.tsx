"use client";

import { normalizeBarcode, type ScannedProduct } from "@kitchen-pantry/integrations";
import { Camera, ScanBarcode } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { lookupBarcodeAction } from "@/app/(app)/kitchen/actions";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/sheet";

/** The browser's built-in barcode reader (Chrome, Edge, Android); not in every browser. */
interface DetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string; format?: string }>>;
}
type DetectorCtor = new (options: { formats: string[] }) => DetectorLike;
const Detector = (): DetectorCtor | null => (typeof window !== "undefined" && "BarcodeDetector" in window ? ((window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector) : null);

/**
 * Add by barcode: type the numbers under the bars, or scan with the camera
 * where the browser can read barcodes. The product is looked up in Open
 * Food Facts (through the server) and opens the usual add form, filled in,
 * so the household can check it before saving.
 */
export function BarcodeSheet({
  open,
  onClose,
  onFound,
}: {
  open: boolean;
  onClose: () => void;
  /** `available` is false when product lookups aren't set up on the server. */
  onFound: (code: string, product: ScannedProduct | null, available: boolean) => void;
}) {
  const id = useId();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => {
    if (!open) {
      stop();
      setCode("");
      setError(null);
    }
    return stop;
  }, [open, stop]);

  const look = useCallback(
    async (raw: string, format?: string) => {
      const normalized = normalizeBarcode(raw, format);
      if (!normalized) {
        setError("That doesn't look like a product barcode. Check the numbers under the bars.");
        return;
      }
      setBusy(true);
      setError(null);
      const r = await lookupBarcodeAction(normalized);
      setBusy(false);
      if (!r.ok) return setError(r.message);
      onFound(normalized, r.data.product, r.data.available);
    },
    [onFound],
  );

  async function startCamera() {
    const D = Detector();
    if (!D || !navigator.mediaDevices?.getUserMedia) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      setScanning(true);
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      const detector = new D({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
      const tick = async () => {
        if (!streamRef.current) return;
        try {
          const found = await detector.detect(video);
          const hit = found.find((f) => normalizeBarcode(f.rawValue, f.format));
          if (hit) {
            stop();
            const valid = normalizeBarcode(hit.rawValue, hit.format)!;
            setCode(valid);
            void look(valid);
            return;
          }
        } catch {
          // keep trying until a code is read or the sheet closes
        }
        setTimeout(() => void tick(), 300);
      };
      void tick();
    } catch {
      stop();
      setError("The camera isn't available. Type the numbers under the barcode instead.");
    }
  }

  const canScan = Boolean(Detector());

  return (
    <Sheet open={open} onClose={onClose} title="Add by barcode" description="Product details come from Open Food Facts, a free open database. You can change anything before saving.">
      <div className="space-y-4">
        <div className={scanning ? "overflow-hidden rounded-2xl bg-black" : "hidden"}>
          <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full object-cover" aria-label="Camera view: point it at the barcode" />
        </div>
        {canScan && !scanning ? (
          <Button variant="secondary" className="w-full" onClick={() => void startCamera()} icon={<Camera className="size-4" aria-hidden />}>
            Scan with the camera
          </Button>
        ) : null}
        {scanning ? (
          <Button variant="ghost" className="w-full" onClick={stop}>
            Stop scanning
          </Button>
        ) : null}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void look(code);
          }}
        >
          <label htmlFor={id} className="sr-only">
            Barcode number
          </label>
          <TextInput id={id} inputMode="numeric" autoComplete="off" placeholder="Numbers under the barcode" value={code} maxLength={16} onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, ""))} />
          <Button type="submit" className="h-13 shrink-0" disabled={busy || code.replace(/\D/g, "").length < 8} icon={<ScanBarcode className="size-4" aria-hidden />}>
            {busy ? "Looking…" : "Look up"}
          </Button>
        </form>
        {error ? (
          <p role="alert" className="text-[15px] text-danger">
            {error}
          </p>
        ) : null}
        <p className="text-[13px] text-subtle">Data © Open Food Facts contributors, under the Open Database Licence.</p>
        {!canScan ? <p className="text-[14px] text-muted">This browser can&apos;t read barcodes with the camera — type the numbers, or scan with the phone app.</p> : null}
      </div>
    </Sheet>
  );
}
