import React, { useState, useEffect, useRef } from 'react';
import { Mail, KeyRound, X, Loader2, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignInSuccess?: () => void;
  signInWithOtp: (email: string) => Promise<{ success: boolean; error?: string }>;
  verifyOtp: (email: string, token: string) => Promise<{ success: boolean; error?: string }>;
  isMockAuth?: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSignInSuccess,
  signInWithOtp,
  verifyOtp,
  isMockAuth = false,
}) => {
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);

  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const otpInputRef = useRef<HTMLInputElement | null>(null);

  // Reset form khi mở modal
  useEffect(() => {
    if (isOpen) {
      setStep('email');
      setOtp('');
      setErrorMessage(null);
      setTimeout(() => emailInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Bộ đếm ngược gửi lại mã OTP (60s)
  useEffect(() => {
    let timer: any;
    if (step === 'otp' && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            setCanResend(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [step, countdown]);

  // Đóng modal bằng phím Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  // Bước 1: Gửi mã OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setErrorMessage('Vui lòng nhập địa chỉ email hợp lệ.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await signInWithOtp(email.trim());
    setIsSubmitting(false);

    if (res.success) {
      setStep('otp');
      setCountdown(60);
      setCanResend(false);
      setTimeout(() => otpInputRef.current?.focus(), 100);
    } else {
      setErrorMessage(res.error || 'Không thể gửi mã xác nhận. Vui lòng thử lại.');
    }
  };

  // Bước 2: Xác nhận mã OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) {
      setErrorMessage('Vui lòng nhập đầy đủ 6 chữ số mã OTP.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await verifyOtp(email.trim(), otp.trim());
    setIsSubmitting(false);

    if (res.success) {
      onClose();
      if (onSignInSuccess) onSignInSuccess();
    } else {
      setErrorMessage(res.error || 'Mã xác thực không hợp lệ hoặc đã hết hạn.');
    }
  };

  // Gửi lại mã OTP
  const handleResendOtp = async () => {
    if (!canResend || isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await signInWithOtp(email.trim());
    setIsSubmitting(false);

    if (res.success) {
      setCountdown(60);
      setCanResend(false);
    } else {
      setErrorMessage(res.error || 'Lỗi gửi lại mã.');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-card auth-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="modal-header">
          <div className="modal-title-group">
            {step === 'otp' ? (
              <button
                type="button"
                className="auth-back-btn"
                onClick={() => {
                  setStep('email');
                  setErrorMessage(null);
                }}
                disabled={isSubmitting}
                aria-label="Quay lại nhập email"
              >
                <ArrowLeft size={18} />
              </button>
            ) : (
              <div className="auth-icon-wrap">
                <Mail size={20} className="text-amber-600" />
              </div>
            )}
            <h3 id="auth-modal-title" className="modal-title">
              {step === 'email' ? 'Đăng nhập tài khoản' : 'Nhập mã xác thực OTP'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-subtle-btn"
            aria-label="Đóng cửa sổ"
            disabled={isSubmitting}
          >
            <X size={18} />
          </button>
        </div>

        {/* Nội dung form */}
        <div className="modal-body auth-modal-body">
          {/* Thông báo lỗi */}
          {errorMessage && (
            <div className="auth-error-banner" role="alert">
              <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
              <span className="auth-error-text">{errorMessage}</span>
            </div>
          )}

          {/* Chế độ Test Mock Mode */}
          {isMockAuth && (
            <div className="auth-mock-tip">
              <CheckCircle2 size={15} className="text-amber-700 shrink-0" />
              <span>Chế độ thử nghiệm: Nhập bất kỳ email nào và mã OTP <strong>123456</strong> để đăng nhập.</span>
            </div>
          )}

          {step === 'email' ? (
            <form onSubmit={handleSendOtp} className="auth-form" noValidate>
              <p className="auth-desc">
                Nhập email để nhận mã đăng nhập một lần (OTP). Không cần nhớ mật khẩu.
              </p>

              <div className="auth-field-group">
                <label htmlFor="auth-email-input" className="auth-label">
                  Địa chỉ Email
                </label>
                <div className="auth-input-wrapper">
                  <Mail size={16} className="auth-input-icon" />
                  <input
                    id="auth-email-input"
                    ref={emailInputRef}
                    type="email"
                    className="auth-input"
                    placeholder="tenban@congty.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="editorial-primary-btn auth-submit-btn"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Đang gửi mã xác nhận...</span>
                  </>
                ) : (
                  <span>Gửi mã đăng nhập</span>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="auth-form" noValidate>
              <p className="auth-desc">
                Mã xác thực 6 số đã được gửi tới <strong>{email}</strong>. Vui lòng kiểm tra hộp thư đến (hoặc hòm thư rác).
              </p>

              <div className="auth-field-group">
                <label htmlFor="auth-otp-input" className="auth-label">
                  Mã xác thực (6 chữ số)
                </label>
                <div className="auth-input-wrapper">
                  <KeyRound size={16} className="auth-input-icon" />
                  <input
                    id="auth-otp-input"
                    ref={otpInputRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    className="auth-input auth-otp-input"
                    placeholder="123456"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                    autoComplete="one-time-code"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="editorial-primary-btn auth-submit-btn"
                disabled={isSubmitting || otp.length < 6}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Đang xác thực...</span>
                  </>
                ) : (
                  <span>Xác nhận và Đăng nhập</span>
                )}
              </button>

              <div className="auth-resend-row">
                {canResend ? (
                  <button
                    type="button"
                    className="auth-resend-btn"
                    onClick={handleResendOtp}
                    disabled={isSubmitting}
                  >
                    Gửi lại mã OTP
                  </button>
                ) : (
                  <span className="auth-countdown-text">
                    Gửi lại mã sau <strong>{countdown}s</strong>
                  </span>
                )}
                <span className="auth-divider">·</span>
                <button
                  type="button"
                  className="auth-change-email-btn"
                  onClick={() => {
                    setStep('email');
                    setErrorMessage(null);
                  }}
                  disabled={isSubmitting}
                >
                  Đổi email khác
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
