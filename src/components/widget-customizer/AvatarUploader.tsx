'use client';
import React, { useRef, useState, useCallback } from 'react';
import { VoiceWidgetAvatarConfig } from '@/config/voiceWidget/types';

interface AvatarUploaderProps {
  avatar: Partial<VoiceWidgetAvatarConfig>;
  widgetId: string;
  assistantName: string;
  onAvatarChange: (patch: Partial<VoiceWidgetAvatarConfig>) => void;
}

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/gif,image/webp';
const MAX_SIZE_MB = 5;

function getInitials(name: string, fallback?: string): string {
  if (fallback && fallback.trim()) return fallback.trim().substring(0, 2).toUpperCase();
  return (name || 'AI').substring(0, 2).toUpperCase();
}

function getShapeStyle(shape?: string): string {
  if (shape === 'square') return '0px';
  if (shape === 'rounded') return '8px';
  return '50%';
}

export default function AvatarUploader({
  avatar,
  widgetId,
  assistantName,
  onAvatarChange,
}: AvatarUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const borderRadius = getShapeStyle(avatar.shape);
  const initials = getInitials(assistantName, avatar.fallbackText);
  const hasImage = Boolean(avatar.src) && !imgError;
  const primaryColor = 'var(--avatar-uploader-primary, #2563EB)';

  // Reset imgError when src changes
  React.useEffect(() => {
    setImgError(false);
  }, [avatar.src]);

  const uploadFile = useCallback(async (file: File) => {
    setUploadError(null);

    // Client-side pre-validation for instant feedback
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setUploadError(`File type "${file.type.split('/')[1]?.toUpperCase()}" not allowed. Use JPEG, PNG, GIF, or WebP.`);
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setUploadError(`File is ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximum allowed size is ${MAX_SIZE_MB} MB.`);
      return;
    }

    setUploading(true);
    try {
      // Delete old Cloudinary asset before uploading new one
      if (avatar.cloudinaryPublicId) {
        try {
          await fetch(`/api/widgets/${encodeURIComponent(widgetId)}/avatar`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ publicId: avatar.cloudinaryPublicId }),
          });
        } catch {
          // Non-critical — continue with upload even if old delete fails
        }
      }

      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/widgets/${encodeURIComponent(widgetId)}/avatar`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Upload failed');
      }

      onAvatarChange({
        src: data.secure_url,
        cloudinaryPublicId: data.public_id,
      });
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [avatar.cloudinaryPublicId, widgetId, onAvatarChange]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    // Reset so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }, [uploadFile]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleRemove = async () => {
    setUploadError(null);
    setRemoving(true);
    try {
      if (avatar.cloudinaryPublicId) {
        await fetch(`/api/widgets/${encodeURIComponent(widgetId)}/avatar`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ publicId: avatar.cloudinaryPublicId }),
        });
      }
    } catch {
      // Non-critical
    } finally {
      onAvatarChange({ src: undefined, cloudinaryPublicId: undefined });
      setImgError(false);
      setRemoving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Preview + dropzone row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {/* Live avatar preview */}
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius,
            flexShrink: 0,
            overflow: 'hidden',
            background: hasImage ? 'transparent' : '#2F8FE0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid #E5E7EB',
            position: 'relative',
          }}
        >
          {hasImage ? (
            <img
              src={avatar.src}
              alt="Avatar preview"
              onError={() => setImgError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span style={{ color: '#fff', fontWeight: 700, fontSize: '18px', userSelect: 'none' }}>
              {initials}
            </span>
          )}
          {uploading && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'rgba(0,0,0,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius,
            }}>
              <SpinnerIcon />
            </div>
          )}
        </div>

        {/* Dropzone */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => !uploading && fileInputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && !uploading && fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          aria-label="Upload avatar image"
          style={{
            flex: 1,
            border: `2px dashed ${dragOver ? '#2563EB' : uploadError ? '#EF4444' : '#D1D5DB'}`,
            borderRadius: '8px',
            padding: '12px 14px',
            cursor: uploading ? 'wait' : 'pointer',
            background: dragOver ? '#EFF6FF' : uploadError ? '#FEF2F2' : '#F9FAFB',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            transition: 'border-color 0.15s, background 0.15s',
            outline: 'none',
          }}
        >
          {uploading ? (
            <>
              <SpinnerIcon color="#2563EB" />
              <span style={{ fontSize: '11.5px', color: '#6B7280' }}>Uploading…</span>
            </>
          ) : (
            <>
              <UploadIcon color={uploadError ? '#EF4444' : '#6B7280'} />
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: uploadError ? '#DC2626' : '#374151' }}>
                {hasImage ? 'Replace image' : 'Upload image'}
              </span>
              <span style={{ fontSize: '10.5px', color: '#9CA3AF' }}>
                JPEG, PNG, GIF, WebP · Max {MAX_SIZE_MB} MB
              </span>
            </>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          onChange={handleFileChange}
          style={{ display: 'none' }}
          aria-hidden="true"
        />
      </div>

      {/* Inline error message */}
      {uploadError && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: '6px',
          padding: '8px 10px',
          background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px',
          fontSize: '11.5px', color: '#DC2626', lineHeight: 1.4,
        }}>
          <ErrorIcon />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Remove button — shown only when an image is set */}
      {(avatar.src || avatar.cloudinaryPublicId) && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={removing || uploading}
          style={{
            alignSelf: 'flex-start',
            padding: '4px 10px',
            fontSize: '11.5px',
            fontWeight: 500,
            color: '#DC2626',
            background: 'transparent',
            border: '1px solid #FECACA',
            borderRadius: '6px',
            cursor: removing || uploading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            opacity: removing || uploading ? 0.6 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          {removing ? <SpinnerIcon color="#DC2626" size={12} /> : <TrashIcon />}
          {removing ? 'Removing…' : 'Remove avatar'}
        </button>
      )}

      {/* Broken URL notice */}
      {imgError && avatar.src && (
        <div style={{
          fontSize: '11px', color: '#92400E',
          background: '#FFFBEB', border: '1px solid #FDE68A',
          borderRadius: '6px', padding: '6px 10px',
        }}>
          ⚠ Image failed to load. Showing initials fallback. Upload a new image to fix.
        </div>
      )}
    </div>
  );
}

// ── Inline SVG icons (no external dependency) ───────────────────────────────

function UploadIcon({ color = '#6B7280' }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function SpinnerIcon({ color = '#FFFFFF', size = 16 }: { color?: string; size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2.5" strokeLinecap="round"
      style={{ animation: 'spin 0.75s linear infinite' }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}
