import React from 'react';

export const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  color: '#6b7280',
  marginBottom: '5px',
};

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: '13px',
  fontWeight: 400,
  borderRadius: '7px',
  border: '1px solid #e5e7eb',
  background: '#ffffff',
  color: '#111827',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s',
  fontFamily: 'inherit',
};

export const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 0',
};

export const sectionTitleStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: '#111827',
  marginBottom: '16px',
};

// CSS-in-JS toggle switch
export const toggleStyle: React.CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  cursor: 'pointer',
  width: '36px',
  height: '20px',
};

export const cardStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '10px',
  padding: '14px',
  boxSizing: 'border-box',
};
