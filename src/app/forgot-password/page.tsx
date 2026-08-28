/**
 * Forgot Password Page
 * Features client-side & server-side validation, loading states, success screens,
 * react-hot-toast notifications, and matching responsive glassmorphism styles.
 */
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Validation states
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!email.trim()) {
      newErrors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email address.';
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      toast.error('Please enter a valid email address.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    const toastId = toast.loading('Sending reset link...');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || 'Unable to process request. Please check details.', { id: toastId });
        setLoading(false);
        return;
      }

      toast.success('Reset link sent to your email!', { id: toastId });
      setSuccess(true);
      setLoading(false);
    } catch (err: any) {
      toast.error('An unexpected error occurred. Please check your connection.', { id: toastId });
      setLoading(false);
    }
  };

  return (
    <main style={styles.container}>
      {/* Responsive stylesheet */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes blobDriftA {
          0% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(40px, -60px) scale(1.1); }
          100% { transform: translate(-20px, 20px) scale(0.95); }
        }
        @keyframes blobDriftB {
          0% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-50px, 30px) scale(1.05); }
          100% { transform: translate(30px, -40px) scale(0.9); }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @media (max-width: 600px) {
          .glass-card {
            padding: 1.75rem !important;
            margin: 1rem !important;
            border-radius: 16px !important;
          }
          .title {
            font-size: 1.5rem !important;
          }
        }
      `}} />

      {/* Decorative Blur Blobs */}
      <div style={{ ...styles.blob, ...styles.blob1, animation: 'blobDriftA 25s infinite alternate ease-in-out' }} />
      <div style={{ ...styles.blob, ...styles.blob2, animation: 'blobDriftB 22s infinite alternate ease-in-out' }} />

      <div style={styles.glassCard} className="glass-card">
        {/* Brand Header */}
        <div style={styles.header}>
          <div style={styles.logoWrapper}>
            <img src="/automate.png" alt="AutoMate Logo" style={styles.logo} />
          </div>
          <h1 style={styles.title} className="title">Reset Password</h1>
          <p style={styles.subtitle}>We will send you a secure link to reset your password</p>
        </div>

        {!success ? (
          <form onSubmit={handleSubmit} style={styles.form}>
            {/* Email */}
            <div style={styles.inputGroup}>
              <label htmlFor="email" style={styles.label}>Email Address</label>
              <input
                id="email"
                type="email"
                placeholder="name@clinic.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors(prev => ({ ...prev, email: '' }));
                }}
                disabled={loading}
                style={{
                  ...styles.input,
                  ...(errors.email ? styles.inputInvalid : {}),
                }}
              />
              {errors.email && <span style={styles.errorText}>{errors.email}</span>}
            </div>

            {/* Submit Button */}
            <button type="submit" disabled={loading} style={styles.submitBtn}>
              {loading ? (
                <div style={styles.spinnerWrapper}>
                  <svg style={styles.spinner} viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="32" />
                  </svg>
                  <span>Sending Link...</span>
                </div>
              ) : (
                'Send Password Reset Link'
              )}
            </button>
          </form>
        ) : (
          /* Success Screen */
          <div style={styles.successScreen}>
            <div style={styles.successIconWrapper}>
              <svg style={styles.successIcon} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <h2 style={styles.successTitle}>Check Your Email</h2>
            <p style={styles.successText}>
              We sent a secure password reset link to <strong>{email}</strong>. Please check your inbox and click the link to reset.
            </p>
            <button onClick={() => setSuccess(false)} style={styles.resendBtn}>
              Resend email
            </button>
          </div>
        )}

        {/* Redirect Footer */}
        <div style={styles.footer}>
          <span>Back to </span>
          <Link href="/login" style={styles.link}>Log In</Link>
        </div>
      </div>
    </main>
  );
}

// Inline styles matching others for visual consistency
const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#E9F2FB',
    position: 'relative',
    overflow: 'hidden',
    padding: '2rem 1rem',
  },
  blob: {
    position: 'absolute',
    borderRadius: '50%',
    filter: 'blur(80px)',
    opacity: 0.45,
    pointerEvents: 'none',
  },
  blob1: {
    width: '450px',
    height: '450px',
    background: '#2F8FE0',
    top: '-10%',
    left: '-10%',
  },
  blob2: {
    width: '500px',
    height: '500px',
    background: '#85C1F5',
    bottom: '-15%',
    right: '-10%',
  },
  glassCard: {
    width: '100%',
    maxWidth: '440px',
    background: 'rgba(255, 255, 255, 0.72)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(47, 143, 224, 0.16)',
    borderRadius: '24px',
    padding: '2.5rem',
    boxShadow: '0 20px 48px -12px rgba(14, 27, 42, 0.12)',
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  header: {
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
  },
  logoWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.5rem',
  },
  logo: {
    height: '42px',
    width: 'auto',
    maxWidth: '180px',
    objectFit: 'contain',
    borderRadius: '6px',
  },
  brandName: {
    fontSize: '1.25rem',
    fontWeight: '700',
    color: '#0E1B2A',
    letterSpacing: '-0.02em',
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: '700',
    color: '#0E1B2A',
    letterSpacing: '-0.03em',
    margin: 0,
  },
  subtitle: {
    fontSize: '0.925rem',
    color: '#5C6C7E',
    margin: 0,
    lineHeight: 1.4,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  label: {
    fontSize: '0.85rem',
    fontWeight: '600',
    color: '#0E1B2A',
  },
  input: {
    width: '100%',
    padding: '0.75rem 1rem',
    borderRadius: '12px',
    border: '1px solid rgba(14, 27, 42, 0.15)',
    background: 'rgba(255, 255, 255, 0.8)',
    color: '#0E1B2A',
    fontSize: '0.95rem',
    outline: 'none',
    transition: 'all 0.2s ease',
  },
  inputInvalid: {
    borderColor: '#EF4444',
    background: 'rgba(239, 68, 68, 0.02)',
  },
  errorText: {
    fontSize: '0.8rem',
    color: '#DC2626',
    fontWeight: '500',
    marginTop: '0.125rem',
  },
  submitBtn: {
    background: 'linear-gradient(135deg, #2F8FE0 0%, #1D6FB8 100%)',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '12px',
    padding: '0.875rem',
    fontSize: '0.975rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 12px rgba(47, 143, 224, 0.24)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: '0.5rem',
  },
  spinnerWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
  },
  spinner: {
    width: '20px',
    height: '20px',
    animation: 'spin 1s linear infinite',
  },
  successScreen: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '1rem',
    padding: '1rem 0',
  },
  successIconWrapper: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    background: 'rgba(16, 185, 129, 0.1)',
    color: '#10B981',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successIcon: {
    width: '32px',
    height: '32px',
  },
  successTitle: {
    fontSize: '1.25rem',
    fontWeight: '700',
    color: '#0E1B2A',
    margin: 0,
  },
  successText: {
    fontSize: '0.9rem',
    color: '#5C6C7E',
    lineHeight: 1.5,
    margin: 0,
  },
  resendBtn: {
    background: 'none',
    border: 'none',
    color: '#2F8FE0',
    fontWeight: '600',
    fontSize: '0.875rem',
    cursor: 'pointer',
    padding: '4px 8px',
    outline: 'none',
    marginTop: '0.5rem',
    textDecoration: 'underline',
  },
  footer: {
    textAlign: 'center',
    fontSize: '0.9rem',
    color: '#5C6C7E',
    marginTop: '0.25rem',
  },
  link: {
    color: '#2F8FE0',
    fontWeight: '600',
    textDecoration: 'none',
    transition: 'color 0.2s ease',
  },
};
