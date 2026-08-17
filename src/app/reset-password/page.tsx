/**
 * Reset Password Page
 * Features client-side & server-side validation, loading states, password visibility toggle,
 * react-hot-toast notifications, and matching glassmorphism styles with the MyFrontDesk layout.
 * Wrapped in Suspense to prevent build-time static de-optimization.
 */
'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Validation states
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!token) {
      newErrors.token = 'Reset token is missing from the URL. Please request a new link.';
    }

    if (!password) {
      newErrors.password = 'Password is required.';
    } else {
      const passErrors = [];
      if (password.length < 8) passErrors.push('8+ chars');
      if (!/[a-zA-Z]/.test(password)) passErrors.push('1 letter');
      if (!/[0-9]/.test(password)) passErrors.push('1 number');
      if (passErrors.length > 0) {
        newErrors.password = `Must contain: ${passErrors.join(', ')}.`;
      }
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match.';
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      toast.error(newErrors.token || 'Please correct the errors in the form.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    const toastId = toast.loading('Resetting password...');
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'validation_failed') {
          setErrors(data.errors || {});
          toast.error('Invalid details. Check inputs.', { id: toastId });
        } else {
          toast.error(data.message || 'Link may have expired or is invalid.', { id: toastId });
        }
        setLoading(false);
        return;
      }

      toast.success('Password reset successfully!', { id: toastId });
      setSuccess(true);
      setLoading(false);
    } catch (err: any) {
      toast.error('An unexpected error occurred. Please check your connection.', { id: toastId });
      setLoading(false);
    }
  };

  return (
    <div style={styles.glassCard} className="glass-card">
      {/* Brand Header */}
      <div style={styles.header}>
        <div style={styles.logoWrapper}>
          <img src="/logo.png" alt="MyFrontDesk Logo" style={styles.logo} />
          <span style={styles.brandName}>MyFrontDesk</span>
        </div>
        <h1 style={styles.title} className="title">New Password</h1>
        <p style={styles.subtitle}>
          {success
            ? 'Your password has been updated'
            : 'Enter and confirm your new password below.'}
        </p>
      </div>

      {/* Alert if token is missing */}
      {!token && (
        <div style={styles.alertError} id="alert-missing-token">
          <span>Reset token is missing or invalid. Please check the link in your email.</span>
        </div>
      )}

      {success ? (
        <div style={styles.successWrapper}>
          <div style={styles.successIconOuter}>
            <svg style={styles.successIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p style={styles.successText}>
            Your password was changed successfully. You can now securely sign in to your dashboard.
          </p>
          <Link href="/login" style={styles.submitBtn}>
            Sign In
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={styles.form}>
          {/* Password */}
          <div style={styles.inputGroup}>
            <label htmlFor="password" style={styles.label}>New Password</label>
            <div style={styles.passwordWrapper}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) setErrors(prev => ({ ...prev, password: '' }));
                }}
                disabled={loading || !token}
                style={{
                  ...styles.input,
                  ...styles.passwordInput,
                  ...(errors.password ? styles.inputInvalid : {}),
                }}
              />
              <button
                type="button"
                id="toggle-password-visibility"
                onClick={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
                tabIndex={-1}
              >
                {showPassword ? (
                  /* Eye Off SVG */
                  <svg style={styles.eyeIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  /* Eye SVG */
                  <svg style={styles.eyeIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            {errors.password && <span style={styles.errorText}>{errors.password}</span>}
          </div>

          {/* Confirm Password */}
          <div style={styles.inputGroup}>
            <label htmlFor="confirmPassword" style={styles.label}>Confirm New Password</label>
            <input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (errors.confirmPassword) setErrors(prev => ({ ...prev, confirmPassword: '' }));
              }}
              disabled={loading || !token}
              style={{
                ...styles.input,
                ...(errors.confirmPassword ? styles.inputInvalid : {}),
              }}
            />
            {errors.confirmPassword && (
              <span style={styles.errorText}>{errors.confirmPassword}</span>
            )}
          </div>

          {/* Submit Button */}
          <button type="submit" disabled={loading || !token} style={styles.submitBtn}>
            {loading ? (
              <div style={styles.spinnerWrapper}>
                <svg style={styles.spinner} viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="32" />
                </svg>
                <span>Resetting Password...</span>
              </div>
            ) : (
              'Reset Password'
            )}
          </button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
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

      <Suspense fallback={
        <div style={styles.glassCard}>
          <div style={styles.header}>
            <p style={styles.subtitle}>Loading password reset...</p>
          </div>
        </div>
      }>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}

// Inline styles matching others exactly
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
    width: '32px',
    height: '32px',
    objectFit: 'contain',
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
  alertError: {
    background: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: '12px',
    padding: '0.75rem 1rem',
    color: '#DC2626',
    fontSize: '0.875rem',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
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
  passwordWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    width: '100%',
  },
  passwordInput: {
    paddingRight: '3rem',
  },
  eyeButton: {
    position: 'absolute',
    right: '0.75rem',
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 2,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#5C6C7E',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
    outline: 'none',
  },
  eyeIcon: {
    width: '20px',
    height: '20px',
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
    textDecoration: 'none',
    width: '100%',
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
  successWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.25rem',
    textAlign: 'center',
    padding: '1rem 0',
  },
  successIconOuter: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: 'rgba(34, 197, 94, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#22C55E',
  },
  successIcon: {
    width: '32px',
    height: '32px',
  },
  successText: {
    fontSize: '0.95rem',
    color: '#5C6C7E',
    lineHeight: 1.5,
  },
};
