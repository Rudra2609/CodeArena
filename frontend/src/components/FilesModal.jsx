import React, { useState, useEffect } from 'react';
import { fetchCodeFiles, deleteCodeFile } from '../api/judgeApi';

export default function FilesModal({ onClose, onLoadFile }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    try {
      setLoading(true);
      const data = await fetchCodeFiles();
      setFiles(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this file?")) return;
    
    try {
      await deleteCodeFile(id);
      setFiles(files.filter(f => f.id !== id));
    } catch (err) {
      alert("Failed to delete file: " + err.message);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content auth-modal" style={{ maxWidth: '600px' }}>
        <button className="modal-close" onClick={onClose}>&times;</button>
        <h2>Saved Files</h2>

        {error && <div className="auth-error">{error}</div>}

        {loading ? (
          <p>Loading files...</p>
        ) : files.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>You haven't saved any files yet.</p>
        ) : (
          <div className="files-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px', maxHeight: '60vh', overflowY: 'auto', paddingRight: '10px' }}>
            {files.map(file => (
              <div 
                key={file.id} 
                className="file-item" 
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 16px', background: 'var(--surface2)', borderRadius: '8px',
                  cursor: 'pointer', border: '1px solid var(--glass-border)'
                }}
                onClick={() => onLoadFile(file)}
              >
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', color: 'var(--text)' }}>{file.title}</h4>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {file.language} &middot; {new Date(file.updated_at).toLocaleString()}
                  </div>
                </div>
                <button 
                  className="btn-delete" 
                  onClick={(e) => handleDelete(e, file.id)}
                  style={{ background: 'transparent', border: 'none', color: '#dc3545', cursor: 'pointer', fontSize: '16px' }}
                  title="Delete File"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
