import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function SettingsModal({ onClose }) {
  const [activeTab, setActiveTab] = useState('account');
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  // Change password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to change password');
      }

      setMessage("Password updated successfully!");
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{ maxWidth: '500px', display: 'flex', padding: 0 }}>
        
        {/* Sidebar for settings tabs */}
        <div style={{ width: '150px', borderRight: '1px solid var(--glass-border)', padding: '20px' }}>
          <h3 style={{ marginBottom: '20px', fontSize: '1.2rem' }}>Settings</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button 
              className={`btn-ghost ${activeTab === 'account' ? 'active' : ''}`}
              style={activeTab === 'account' ? { background: 'var(--surface2)' } : {}}
              onClick={() => setActiveTab('account')}
            >
              Account
            </button>
            <button 
              className={`btn-ghost ${activeTab === 'appearance' ? 'active' : ''}`}
              style={activeTab === 'appearance' ? { background: 'var(--surface2)' } : {}}
              onClick={() => setActiveTab('appearance')}
            >
              Appearance
            </button>
          </div>
        </div>

        {/* Main content area */}
        <div style={{ flex: 1, padding: '20px', position: 'relative' }}>
          <button className="modal-close" onClick={onClose}>✕</button>

          {activeTab === 'account' && (
            <div>
              <h3 style={{ marginBottom: '20px' }}>Account Settings</h3>
              
              <div style={{ marginBottom: '30px', padding: '15px', background: 'var(--surface2)', borderRadius: '8px' }}>
                <p style={{ marginBottom: '10px', color: 'var(--text-muted)' }}>Logged in as <strong style={{ color: 'var(--text)' }}>{user?.email}</strong></p>
                <button className="btn outline-btn" onClick={() => { logout(); onClose(); }} style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
                  Log Out
                </button>
              </div>

              <h4 style={{ marginBottom: '15px' }}>Change Password</h4>
              
              {error && <div className="error-box">{error}</div>}
              {message && <div style={{ padding: '10px', background: 'var(--green-dim)', color: 'var(--green)', borderRadius: '6px', marginBottom: '15px' }}>{message}</div>}
              
              <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div>
                  <label className="io-label">Current Password</label>
                  <input type="password" required className="modal-input" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
                </div>
                <div>
                  <label className="io-label">New Password</label>
                  <input type="password" required className="modal-input" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                </div>
                <div>
                  <label className="io-label">Confirm New Password</label>
                  <input type="password" required className="modal-input" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                </div>
                <button type="submit" disabled={loading} className="btn primary-btn">
                  {loading ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div>
              <h3 style={{ marginBottom: '20px' }}>Appearance Settings</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div>
                  <label className="io-label">Theme</label>
                  <select 
                    className="lang-select" 
                    value={theme} 
                    onChange={(e) => setTheme(e.target.value)}
                    style={{ width: '100%', padding: '10px', fontSize: '1rem' }}
                  >
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="dracula">Dracula</option>
                    <option value="github-dark">GitHub Dark</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
