import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

// All requests go through Nginx at the same origin (/api/*)
const API_BASE = "/api/auth";

export default function AuthModals({ mode, onClose, onSwitchMode }) {
  const { login } = useAuth();
  
  // States
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "register") {
        const res = await fetch(`${API_BASE}/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Registration failed");
        onSwitchMode("verify");
      } 
      else if (mode === "verify") {
        const res = await fetch(`${API_BASE}/verify-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, otp })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Verification failed");
        onSwitchMode("login");
      } 
      else if (mode === "login") {
        const res = await fetch(`${API_BASE}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: email, email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Login failed");
        login(data.access_token);
        onClose();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content auth-modal">
        <button className="modal-close" onClick={onClose}>&times;</button>
        <h2>{mode === 'register' ? 'Create Account' : mode === 'verify' ? 'Verify OTP' : 'Welcome Back'}</h2>
        
        {error && <div className="auth-error">{error}</div>}
        {mode === 'verify' && <div className="auth-info">Please check your server logs for the OTP sent to {email}</div>}
        
        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'register' && (
            <div className="form-group">
              <label>Username</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)} required />
            </div>
          )}
          
          {(mode === 'register' || mode === 'login' || mode === 'verify') && (
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required disabled={mode === 'verify'} />
            </div>
          )}

          {(mode === 'register' || mode === 'login') && (
            <div className="form-group">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
          )}

          {mode === 'verify' && (
            <div className="form-group">
              <label>6-Digit OTP</label>
              <input type="text" maxLength={6} value={otp} onChange={e => setOtp(e.target.value)} required />
            </div>
          )}

          <button type="submit" disabled={loading} className="btn primary-btn full-width">
            {loading ? "Please wait..." : mode === 'register' ? 'Sign Up' : mode === 'verify' ? 'Verify' : 'Log In'}
          </button>
        </form>

        <div className="auth-switch">
          {mode === 'login' ? (
            <p>Don't have an account? <span onClick={() => onSwitchMode("register")}>Sign up</span></p>
          ) : mode === 'register' ? (
            <p>Already have an account? <span onClick={() => onSwitchMode("login")}>Log in</span></p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
