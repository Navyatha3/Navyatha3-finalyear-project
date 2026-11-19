import React, { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Paperclip, UploadCloud, LoaderCircle } from "lucide-react";

const DocumentUpload = ({
  onUpload,
  isUploading,
  progress,
  variant = "button",
  disabled = false,
}) => {
  const onDrop = useCallback(
    (acceptedFiles) => {
      if (!acceptedFiles.length || disabled || isUploading) {
        return;
      }
      onUpload(acceptedFiles[0]);
    },
    [disabled, isUploading, onUpload]
  );

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    open,
  } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
    },
    multiple: false,
    noClick: variant === "button",
    noKeyboard: variant === "button",
  });

  if (variant === "button") {
    return (
      <div className="flex min-w-[120px] flex-col">
        <input {...getInputProps()} />
        <button
          type="button"
          onClick={open}
          disabled={disabled || isUploading}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-fused-line/70 bg-fused-card/60 px-3 text-sm font-medium text-fused-text transition hover:border-fused-accentStart/40 hover:bg-fused-card disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isUploading ? <LoaderCircle size={16} className="animate-spin" /> : <Paperclip size={16} />}
          <span>{isUploading ? "Uploading" : "Attach PDF"}</span>
        </button>
        {isUploading && (
          <div className="mt-1 text-xs text-fused-muted">{Math.round(progress)}%</div>
        )}
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={`rounded-2xl border border-dashed p-4 text-center transition ${
        isDragActive
          ? "border-fused-accentEnd bg-emerald-500/10"
          : "border-fused-line/80 bg-fused-card/40"
      } ${disabled || isUploading ? "opacity-75" : "cursor-pointer hover:border-fused-accentStart/70"}`}
    >
      <input {...getInputProps()} />
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-fused-accentStart/15 text-fused-accentEnd">
        {isUploading ? <LoaderCircle size={18} className="animate-spin" /> : <UploadCloud size={18} />}
      </div>
      <p className="text-sm font-medium text-fused-text">
        {isDragActive ? "Drop your PDF here" : "Drag and drop a PDF"}
      </p>
      <p className="mt-1 text-xs text-fused-muted">or click to browse from your device</p>
      {isUploading && (
        <p className="mt-2 text-xs text-fused-accentEnd">Upload progress: {Math.round(progress)}%</p>
      )}
    </div>
  );
};

export default DocumentUpload;
