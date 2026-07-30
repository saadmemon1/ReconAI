'use client';
import { useEffect, useState, useRef } from 'react';
import { useAuth } from './auth-provider';
import { Button } from './ui/button';
import { Card } from './ui/card';

interface FileItem {
  id: string;
  filename: string;
  created_at: string;
}

export function FileManager({ kbId }: { kbId: string }) {
  const { fetchDocAI } = useAuth();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [parsing, setParsing] = useState<string[]>([]);
  const [jobStatuses, setJobStatuses] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFiles = async () => {
    const res = await fetchDocAI(`/files?kb_id=${kbId}`);
    const data = await res.json();
    setFiles(data.files || data.items || []);
  };

  useEffect(() => { loadFiles(); }, [kbId]);

  const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('knowledge_base_id', kbId);
      formData.append('filename', file.name);

      await fetchDocAI('/files', {
        method: 'POST',
        body: formData,
      });
    }
    
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    loadFiles();
  };

  const deleteFile = async (fileId: string) => {
    if (!confirm('Delete this file?')) return;
    await fetchDocAI(`/files/${fileId}`, { method: 'DELETE' });
    loadFiles();
  };

  const viewFile = (fileId: string) => {
    // Open in new tab -- the proxy will stream the file
    window.open(`/api/docai/files/${fileId}/content`, '_blank');
  };

  const parseFile = async (fileId: string) => {
    setParsing(prev => [...prev, fileId]);
    
    const res = await fetchDocAI('/files/parse/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        file_ids: [fileId],
        options: { backend: 'auto' }
      }),
    });
    
    const data = await res.json();
    console.log('[PARSE] Bulk parse response:', JSON.stringify(data));
    const jobId = data.job_id || data.jobs?.[0]?.id || data.job_ids?.[0];
    
    if (jobId) {
      console.log('[PARSE] Polling job:', jobId);
      // Poll job status
      const poll = setInterval(async () => {
        const statusRes = await fetchDocAI(`/files/${fileId}/jobs/${jobId}`);
        const statusData = await statusRes.json();
        console.log('[PARSE] Job status:', JSON.stringify(statusData));
        const status = statusData.status || statusData.job_status;
        setJobStatuses(prev => ({ ...prev, [fileId]: status }));
        if (status === 'completed' || status === 'failed' || status === 'cancelled') {
          clearInterval(poll);
          setParsing(prev => prev.filter(id => id !== fileId));
          loadFiles();
        }
      }, 2000);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-h3">Files</h2>
        <div>
          <input 
            ref={fileInputRef}
            type="file" 
            multiple
            onChange={uploadFile} 
            className="hidden" 
            id="file-upload"
          />
          <Button variant="secondary" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? 'Uploading...' : 'Upload File'}
          </Button>
        </div>
      </div>

      {files.length === 0 ? (
        <p className="text-sm text-secondary">No files in this knowledge base. Upload a file to begin.</p>
      ) : (
        <div className="space-y-2">
          {files.map(f => (
            <Card key={f.id} className="p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{f.filename}</p>
                {jobStatuses[f.id] && (
                  <span className="text-xs text-secondary">
                    Parse: {jobStatuses[f.id]}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => viewFile(f.id)}>
                  View
                </Button>
                <Button 
                  variant="ghost" size="sm"
                  onClick={() => parseFile(f.id)}
                  disabled={parsing.includes(f.id)}
                >
                  {parsing.includes(f.id) ? 'Parsing...' : 'Parse'}
                </Button>
                <Button 
                  variant="ghost" size="sm"
                  className="text-destructive"
                  onClick={() => deleteFile(f.id)}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
