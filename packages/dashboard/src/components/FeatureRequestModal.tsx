import { useId, useRef, useState, useEffect, type RefObject } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useRestoreFocus } from '@/hooks/useRestoreFocus';
function X({ className = '' }: { className?: string }) {
  return <span className={`material-symbols-outlined leading-none select-none ${className}`} aria-hidden="true">close</span>;
}
function Upload({ className = '' }: { className?: string }) {
  return <span className={`material-symbols-outlined leading-none select-none ${className}`} aria-hidden="true">upload</span>;
}
function CheckCircle2({ className = '' }: { className?: string }) {
  return <span className={`material-symbols-outlined leading-none select-none ${className}`} aria-hidden="true" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>;
}

interface ImageAttachment {
  filename: string;
  dataUrl: string;
  previewUrl: string;
}

interface FeatureRequestModalProps {
  open: boolean;
  onClose: () => void;
  restoreFocusRef?: RefObject<HTMLElement | null>;
}

export function FeatureRequestModal({ open, onClose, restoreFocusRef }: FeatureRequestModalProps) {
  const id = useId();
  const nameId = `${id}-name`;
  const requestId = `${id}-request`;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const { handleCloseAutoFocus } = useRestoreFocus(open, restoreFocusRef);

  const [tokenConfigured, setTokenConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch('/api/feature-request/status')
      .then(r => r.json())
      .then((data: { configured: boolean }) => setTokenConfigured(data.configured))
      .catch(() => setTokenConfigured(false));
  }, [open]);

  const [name, setName] = useState('');
  const [request, setRequest] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [issueUrl, setIssueUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName('');
    setRequest('');
    setImages([]);
    setSubmitting(false);
    setSubmitted(false);
    setIssueUrl(null);
    setError(null);
  }

  function handleOpenChange(open: boolean) {
    if (!open) { onClose(); reset(); }
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const dataUrl = ev.target?.result as string;
        setImages(prev => [...prev, { filename: file.name, dataUrl, previewUrl: dataUrl }]);
      };
      reader.readAsDataURL(file);
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  }

  async function handleSubmit() {
    if (!name.trim() || !request.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/feature-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          request: request.trim(),
          images: images.map(img => ({ filename: img.filename, dataUrl: img.dataUrl })),
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Failed to send');
      }
      const json = await res.json().catch(() => ({}));
      setIssueUrl(json.issueUrl ?? null);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="text-foreground flex flex-col max-h-[90dvh] overflow-hidden p-0 sm:max-w-lg"
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <div className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <DialogHeader>
            <DialogTitle>Request a Feature</DialogTitle>
            <DialogDescription>
              Got an idea to make Seymour better? We&apos;d love to hear it.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
          {submitted ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-500" aria-hidden="true" />
              <p className="text-base font-medium">Request submitted — thanks, {name}!</p>
              <p className="text-sm text-muted-foreground">A GitHub issue has been created for your idea.</p>
              {issueUrl && (
                <a
                  href={issueUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-link hover:underline"
                >
                  View issue on GitHub
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {tokenConfigured === false && (
                <div className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Setup required</p>
                  <p>
                    Add a GitHub personal access token to{' '}
                    <code className="text-xs bg-background rounded px-1 py-0.5">packages/scanner/.env</code>:
                  </p>
                  <pre className="mt-2 text-xs bg-background rounded px-3 py-2 overflow-x-auto select-all">GITHUB_TOKEN=ghp_your_token_here</pre>
                  <p className="mt-2">
                    Create one at{' '}
                    <a
                      href="https://github.com/settings/tokens"
                      target="_blank"
                      rel="noreferrer"
                      className="text-link hover:underline font-mono text-xs"
                    >
                      github.com/settings/tokens
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                    {' '}with <span className="font-medium text-foreground">Issues: Read and write</span> permission on this repo.
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={nameId}>Your name</Label>
                <Input
                  id={nameId}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={requestId}>Feature request</Label>
                <Textarea
                  id={requestId}
                  value={request}
                  onChange={e => setRequest(e.target.value)}
                  rows={5}
                  className="resize-y"
                />
              </div>

              {/* Image attachments */}
              <div className="flex flex-col gap-1.5">
                <Label>Screenshots <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Drop images here or click to upload"
                  className="border-2 border-dashed border-border rounded-md px-4 py-5 text-center text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                  onDrop={handleDrop}
                  onDragOver={e => e.preventDefault()}
                >
                  <Upload className="h-4 w-4 mx-auto mb-1.5" aria-hidden="true" />
                  Drop images here or click to upload
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={e => addFiles(e.target.files)}
                />
                {images.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {images.map((img, i) => (
                      <div key={i} className="relative group w-16 h-16 rounded border border-border overflow-hidden shrink-0">
                        <img src={img.previewUrl} alt={img.filename} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          aria-label={`Remove ${img.filename}`}
                          onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))}
                          className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity text-white"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <p ref={errorRef} tabIndex={-1} role="alert" className="text-sm text-destructive rounded-md bg-zinc-300 px-4 py-3 focus:outline-none">
                  {/bad credentials/i.test(error) ? (
                    <>
                      Your GitHub token is invalid or expired.{' '}
                      <a
                        href="https://github.com/settings/tokens"
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:no-underline"
                      >
                        Create or update your token
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                      , then update <code className="text-xs">packages/scanner/.env</code> and restart the server.
                    </>
                  ) : /not found/i.test(error) ? (
                    <>
                      Your GitHub token doesn&apos;t have permission to create issues on this repo. Make sure it has{' '}
                      <strong>Issues: Read and write</strong> access.{' '}
                      <a
                        href="https://github.com/settings/tokens"
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:no-underline"
                      >
                        Update your token
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                      , then update <code className="text-xs">packages/scanner/.env</code> and restart the server.
                    </>
                  ) : error}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border shrink-0">
          <DialogFooter className="gap-2">
            {submitted ? (
              <Button type="button" onClick={() => { onClose(); reset(); }}>Close</Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => { onClose(); reset(); }}>Cancel</Button>
                <Button
                  type="button"
                  disabled={submitting || !name.trim() || !request.trim()}
                  onClick={handleSubmit}
                >
                  {submitting ? 'Sending…' : 'Send Request'}
                </Button>
              </>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
