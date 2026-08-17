/**
 * Sign Up Page with 4-Digit Email OTP Verification
 * Features client-side & server-side validation, loading states, password visibility toggle,
 * react-hot-toast notifications, and a responsive glassmorphism layout.
 */
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1); // 1: Enter details, 2: Enter OTP code
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Validation states
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Client-side quick checks for Step 1
  const validateStep1 = () => {
    const newErrors: Record<string, string> = {};

    if (!email.trim()) {
      newErrors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email address.';
    }

    if (!fullName.trim()) {
      newErrors.fullName = 'Full name is required.';
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
      toast.error('Please correct the errors in the form.');
      return false;
    }
    return true;
  };

  // Request 4-digit verification OTP
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!validateStep1()) return;

    setLoading(true);
    const toastId = toast.loading('Sending verification code...');
    try {
      const res = await fetch('/api/auth/signup/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || 'Failed to send verification code.', { id: toastId });
        setLoading(false);
        return;
      }

      toast.success('Verification code sent to your email!', { id: toastId });
      setStep(2);
    } catch (err: any) {
      toast.error('Network error. Failed to send verification code.', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  // Submit complete signup details + OTP verification code
  const handleSubmitSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!code || code.trim().length !== 4) {
      setErrors({ code: 'Please enter the 4-digit code.' });
      toast.error('Verification code must be exactly 4 digits.');
      return;
    }

    setLoading(true);
    const toastId = toast.loading('Verifying code & creating account...');
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, fullName, password, confirmPassword, code }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'validation_failed' && data.errors) {
          setErrors(data.errors);
          if (data.errors.code) {
            toast.error(data.errors.code, { id: toastId });
          } else {
            toast.error('Registration failed. Please check form inputs.', { id: toastId });
            setStep(1); // Go back to fix details if validation errors on details
          }
        } else {
          toast.error(data.message || 'Failed to create account.', { id: toastId });
        }
        setLoading(false);
        return;
      }

      toast.success('Account created successfully!', { id: toastId });
      // Redirect to main dashboard
      router.push('/');
      router.refresh();
    } catch (err: any) {
      toast.error('An unexpected error occurred. Please try again.', { id: toastId });
      setLoading(false);
    }
  };

  return (
    <main style={styles.container}>
      {/* Responsive stylesheet */}
      <style dangerouslySetInnerHTML={{
        __html: `
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
            <img src="/logo.png" alt="MyFrontDesk Logo" style={styles.logo} />
          </div>
          <h1 style={styles.title} className="title">
            {step === 1 ? 'Create Your Account' : 'Verify Email'}
          </h1>
          <p style={styles.subtitle}>
            {step === 1
              ? 'Get started with your dedicated AI Voice Desk Agent'
              : `We sent a 4-digit code to ${email}`
            }
          </p>
        </div>

        {step === 1 ? (
          /* STEP 1: Details form */
          <form onSubmit={handleSendOtp} style={styles.form}>
            {/* Full Name */}
            <div style={styles.inputGroup}>
              <label htmlFor="fullName" style={styles.label}>Full Name</label>
              <input
                id="fullName"
                type="text"
                placeholder="John Doe"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (errors.fullName) setErrors(prev => ({ ...prev, fullName: '' }));
                }}
                disabled={loading}
                style={{
                  ...styles.input,
                  ...(errors.fullName ? styles.inputInvalid : {}),
                }}
              />
              {errors.fullName && <span style={styles.errorText}>{errors.fullName}</span>}
            </div>

            {/* Email */}
            <div style={styles.inputGroup}>
              <label htmlFor="email" style={styles.label}>Email Address</label>
              <input
                id="email"
                type="email"
                placeholder="name@gmail.com"
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

            {/* Password */}
            <div style={styles.inputGroup}>
              <label htmlFor="password" style={styles.label}>Password</label>
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
                  disabled={loading}
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
              <label htmlFor="confirmPassword" style={styles.label}>Confirm Password</label>
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errors.confirmPassword) setErrors(prev => ({ ...prev, confirmPassword: '' }));
                }}
                disabled={loading}
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
            <button type="submit" disabled={loading} style={styles.submitBtn}>
              {loading ? (
                <div style={styles.spinnerWrapper}>
                  <svg style={styles.spinner} viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="32" />
                  </svg>
                  <span>Sending Verification Code...</span>
                </div>
              ) : (
                'Send Verification Code'
              )}
            </button>
          </form>
        ) : (
          /* STEP 2: Verification Code Form */
          <form onSubmit={handleSubmitSignup} style={styles.form}>
            <div style={styles.inputGroup}>
              <label htmlFor="code" style={styles.label}>Enter 4-Digit Code</label>
              <input
                id="code"
                type="text"
                maxLength={4}
                placeholder="1234"
                value={code}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  setCode(val);
                  if (errors.code) setErrors(prev => ({ ...prev, code: '' }));
                }}
                disabled={loading}
                style={{
                  ...styles.input,
                  textAlign: 'center',
                  fontSize: '1.75rem',
                  letterSpacing: '0.75rem',
                  paddingLeft: '1.5rem',
                  fontFamily: 'monospace',
                  ...(errors.code ? styles.inputInvalid : {}),
                }}
              />
              {errors.code && <span style={styles.errorText}>{errors.code}</span>}
            </div>

            <button type="submit" disabled={loading} style={styles.submitBtn}>
              {loading ? (
                <div style={styles.spinnerWrapper}>
                  <svg style={styles.spinner} viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="32" />
                  </svg>
                  <span>Creating Account...</span>
                </div>
              ) : (
                'Verify & Create Account'
              )}
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={loading}
                style={styles.backBtn}
              >
                Go Back
              </button>

              <button
                type="button"
                onClick={() => handleSendOtp()}
                disabled={loading}
                style={styles.resendBtn}
              >
                Resend Code
              </button>
            </div>
          </form>
        )}

        {/* Redirect Footer */}
        <div style={styles.footer}>
          <span>Already have an account? </span>
          <Link href="/login" style={styles.link}>Log In</Link>
        </div>
      </div>
    </main>
  );
}

// Inline styles matching MyFrontDesk aesthetics
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
    maxWidth: '480px',
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
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.125rem',
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
    marginTop: '0.5rem',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#5C6C7E',
    fontWeight: '600',
    fontSize: '0.875rem',
    cursor: 'pointer',
    padding: '4px 8px',
    outline: 'none',
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
