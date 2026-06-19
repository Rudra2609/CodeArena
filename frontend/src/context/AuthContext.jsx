import React, { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("access_token") || null);

  useEffect(() => {
    // If we had a /me endpoint we'd fetch the user profile here.
    // Since we don't, we'll just decode the token payload or trust the presence of a token.
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser({ email: payload.sub, id: payload.id });
      } catch(e) {
        setToken(null);
        localStorage.removeItem("access_token");
      }
    } else {
      setUser(null);
    }
  }, [token]);

  const login = (newToken) => {
    setToken(newToken);
    localStorage.setItem("access_token", newToken);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("access_token");
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
