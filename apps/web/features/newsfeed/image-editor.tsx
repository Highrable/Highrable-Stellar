"use client";

import { Button } from "@repo/ui/components/ui/button";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "@repo/ui/responsive-dialog";
import { useEffect, useRef, useState } from "react";

import { MobileDialogClose } from "./composer-ui";

const stickers = ["✨", "🎉", "💡", "❤️", "🙌", "🚀", "😊", "🌿"];

export function ImageEditor({
  file,
  onOpenChange,
  onSave,
}: {
  file: File | null;
  onOpenChange: (open: boolean) => void;
  onSave: (file: File) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [text, setText] = useState("");
  const [sticker, setSticker] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!file) return;
    const source = URL.createObjectURL(file);
    const loaded = new Image();
    loaded.onload = () => {
      image.current = loaded;
      setReady(true);
    };
    loaded.onerror = () => setError("This image could not be opened.");
    loaded.src = source;
    return () => {
      URL.revokeObjectURL(source);
      image.current = null;
      setReady(false);
    };
  }, [file]);

  useEffect(() => {
    const target = canvas.current;
    const source = image.current;
    if (!target || !source || !ready) return;
    const context = target.getContext("2d");
    if (!context) return;
    draw(context, source, target.width, target.height, zoom, panX, panY, text, sticker);
  }, [ready, zoom, panX, panY, text, sticker]);

  async function save() {
    const source = image.current;
    if (!source) return;
    setError("");
    const output = document.createElement("canvas");
    output.width = 1200;
    output.height = 900;
    const context = output.getContext("2d");
    if (!context) {
      setError("The image editor is unavailable in this browser.");
      return;
    }
    draw(context, source, output.width, output.height, zoom, panX, panY, text, sticker);
    const blob = await new Promise<Blob | null>((resolve) =>
      output.toBlob(resolve, "image/webp", 0.9),
    );
    if (!blob) {
      setError("The edited image could not be prepared. Try again.");
      return;
    }
    const base = file?.name.replace(/\.[^.]+$/, "") || "image";
    const extension =
      blob.type === "image/png" ? "png" : blob.type === "image/jpeg" ? "jpg" : "webp";
    onSave(new File([blob], `${base}-edited.${extension}`, { type: blob.type || "image/webp" }));
    onOpenChange(false);
  }

  return (
    <Dialog open={Boolean(file)} onOpenChange={onOpenChange}>
      <DialogContent className="hr-newsfeed-dialog max-h-[min(92dvh,54rem)] max-w-2xl gap-0 overflow-x-hidden overflow-y-auto rounded-[1.75rem] border bg-background p-5 sm:p-7">
        <MobileDialogClose />
        <DialogHeader className="shrink-0 border-b-0 p-0 pr-10 pb-5 text-left">
          <DialogTitle className="text-2xl tracking-tight">Edit image</DialogTitle>
          <DialogDescription className="leading-relaxed">
            Crop the image, add a caption or choose an emoji sticker. Changes are applied before
            upload.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-5">
          <div className="overflow-hidden rounded-2xl bg-black shadow-sm">
            <canvas
              ref={canvas}
              width={720}
              height={540}
              role="img"
              aria-label="Edited image preview"
              className="h-auto max-h-[48dvh] w-full object-contain"
            />
          </div>
          <label className="block text-sm font-medium">
            Crop zoom
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="mt-2 block w-full accent-primary"
              aria-label="Crop zoom"
            />
          </label>
          <div className="grid gap-4 rounded-2xl bg-muted/25 p-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Crop left to right
              <input
                type="range"
                min="-1"
                max="1"
                step="0.05"
                value={panX}
                onChange={(event) => setPanX(Number(event.target.value))}
                className="mt-2 block w-full accent-primary"
                aria-label="Crop left to right"
              />
            </label>
            <label className="block text-sm font-medium">
              Crop top to bottom
              <input
                type="range"
                min="-1"
                max="1"
                step="0.05"
                value={panY}
                onChange={(event) => setPanY(Number(event.target.value))}
                className="mt-2 block w-full accent-primary"
                aria-label="Crop top to bottom"
              />
            </label>
          </div>
          <label className="block text-sm font-medium">
            Image text
            <input
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, 120))}
              maxLength={120}
              className="mt-2 block h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
              placeholder="Add a short caption"
            />
          </label>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Emoji sticker</legend>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Emoji stickers">
              {stickers.map((item) => (
                <Button
                  key={item}
                  type="button"
                  variant={sticker === item ? "secondary" : "ghost"}
                  size="icon"
                  aria-label={`Add ${item} sticker`}
                  aria-pressed={sticker === item}
                  onClick={() => setSticker(sticker === item ? "" : item)}
                  className="text-xl"
                >
                  {item}
                </Button>
              ))}
            </div>
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse justify-end gap-2 border-t pt-4 sm:flex-row">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="rounded-full px-5"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!ready}
              onClick={() => void save()}
              className="hr-v2-button-primary min-h-11 rounded-full px-6"
            >
              Apply edits
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function draw(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  zoom: number,
  panX: number,
  panY: number,
  text: string,
  sticker: string,
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * zoom;
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const x = (width - drawWidth) / 2 + (panX * (drawWidth - width)) / 2;
  const y = (height - drawHeight) / 2 + (panY * (drawHeight - height)) / 2;
  context.clearRect(0, 0, width, height);
  context.drawImage(image, x, y, drawWidth, drawHeight);
  if (sticker) {
    context.font = `${Math.round(height * 0.18)}px sans-serif`;
    context.textAlign = "right";
    context.textBaseline = "top";
    context.shadowColor = "rgba(0,0,0,.55)";
    context.shadowBlur = height * 0.02;
    context.fillText(sticker, width * 0.93, height * 0.08);
  }
  if (text.trim()) {
    const lines = wrap(text.trim(), context, width * 0.86, Math.round(height * 0.08));
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `700 ${Math.round(height * 0.075)}px sans-serif`;
    context.lineJoin = "round";
    context.lineWidth = Math.max(3, height * 0.012);
    context.strokeStyle = "rgba(0,0,0,.8)";
    context.fillStyle = "white";
    const lineHeight = height * 0.095;
    const firstY = height * 0.78 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, index) => {
      context.strokeText(line, width / 2, firstY + index * lineHeight);
      context.fillText(line, width / 2, firstY + index * lineHeight);
    });
  }
}

function wrap(text: string, context: CanvasRenderingContext2D, maxWidth: number, fontSize: number) {
  context.font = `700 ${fontSize}px sans-serif`;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  context.font = `700 ${Math.round(fontSize * (0.075 / 0.08))}px sans-serif`;
  return lines.slice(0, 3);
}
