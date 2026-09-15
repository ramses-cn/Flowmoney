/**
 * Apple UI Primitives — Componentes reutilizables del design system
 * ============================================================
 * Centraliza los patrones visuales iOS para uso consistente en toda la app.
 */
import React from 'react';
import { motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';

interface AppleCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  padding?: 'sm' | 'md' | 'lg';
  elevation?: 'flat' | 'sm' | 'md' | 'lg';
}

export const AppleCard: React.FC<AppleCardProps> = ({
  children, className = '', onClick, padding = 'md', elevation = 'sm',
}) => {
  const padMap = { sm: 'p-3', md: 'p-4', lg: 'p-6' };
  const shadowMap = {
    flat: 'none',
    sm: '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)',
    md: '0 4px 12px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04)',
    lg: '0 12px 32px rgba(0,0,0,0.08), 0 4px 8px rgba(0,0,0,0.04)',
  };
  return (
    <div
      onClick={onClick}
      className={`rounded-[16px] ${padMap[padding]} ${onClick ? 'cursor-pointer active:scale-[0.98]' : ''} transition-all ${className}`}
      style={{
        background: 'var(--ios-bg-elevated)',
        border: '0.5px solid var(--ios-separator)',
        boxShadow: shadowMap[elevation],
        transition: 'all 0.2s var(--ease-apple)',
      }}
    >
      {children}
    </div>
  );
};

interface AppleListRowProps {
  icon?: React.ReactNode;
  iconBg?: string;
  title: string;
  subtitle?: string;
  rightText?: string;
  showChevron?: boolean;
  onClick?: () => void;
  destructive?: boolean;
}

export const AppleListRow: React.FC<AppleListRowProps> = ({
  icon, iconBg = 'var(--ios-gray-2)', title, subtitle, rightText,
  showChevron = false, onClick, destructive = false,
}) => {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 ${onClick ? 'cursor-pointer active:bg-[var(--ios-bg-tertiary)]' : ''} transition-colors`}
      style={{ borderBottom: '0.5px solid var(--ios-separator)' }}
    >
      {icon && (
        <div
          className="w-[28px] h-[28px] rounded-[7px] flex items-center justify-center text-white shrink-0"
          style={{ background: iconBg, boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}
        >
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div
          className="text-[15px] font-medium truncate"
          style={{ color: destructive ? 'var(--ios-red)' : 'var(--ios-label)' }}
        >
          {title}
        </div>
        {subtitle && (
          <div className="text-[12px] truncate mt-0.5" style={{ color: 'var(--ios-label-secondary)' }}>
            {subtitle}
          </div>
        )}
      </div>
      {rightText && (
        <span className="text-[14px]" style={{ color: 'var(--ios-label-secondary)' }}>
          {rightText}
        </span>
      )}
      {showChevron && (
        <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--ios-label-tertiary)' }} />
      )}
    </div>
  );
};

interface AppleToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  color?: string;
}

export const AppleToggle: React.FC<AppleToggleProps> = ({ checked, onChange, color = 'var(--ios-green)' }) => {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="relative w-[51px] h-[31px] rounded-full transition-all shrink-0"
      style={{
        background: checked ? color : 'rgba(120, 120, 128, 0.16)',
        transition: 'background 0.2s var(--ease-apple)',
      }}
    >
      <motion.div
        className="absolute top-[2px] w-[27px] h-[27px] bg-white rounded-full"
        style={{ boxShadow: '0 3px 8px rgba(0,0,0,0.15), 0 1px 1px rgba(0,0,0,0.06)' }}
        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        animate={{ left: checked ? 22 : 2 }}
      />
    </button>
  );
};

interface AppleButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'destructive' | 'success';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export const AppleButton: React.FC<AppleButtonProps> = ({
  children, variant = 'primary', size = 'md', fullWidth = false,
  onClick, disabled = false, icon,
}) => {
  const colorMap = {
    primary: 'var(--ios-blue)',
    secondary: 'rgba(120, 120, 128, 0.12)',
    destructive: 'var(--ios-red)',
    success: 'var(--ios-green)',
  };
  const textColorMap = {
    primary: '#FFFFFF', secondary: 'var(--ios-label)',
    destructive: '#FFFFFF', success: '#FFFFFF',
  };
  const glowMap = {
    primary: '0 1px 2px rgba(0,122,255,0.3), 0 4px 12px rgba(0,122,255,0.18)',
    secondary: 'none',
    destructive: '0 1px 2px rgba(255,59,48,0.3), 0 4px 12px rgba(255,59,48,0.18)',
    success: '0 1px 2px rgba(52,199,89,0.3), 0 4px 12px rgba(52,199,89,0.18)',
  };
  const sizeMap = {
    sm: 'text-[13px] font-medium px-4 py-2 rounded-[10px]',
    md: 'text-[15px] font-medium px-5 py-[14px] rounded-[14px]',
    lg: 'text-[17px] font-semibold px-6 py-4 rounded-[14px]',
  };
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      disabled={disabled}
      className={`${sizeMap[size]} ${fullWidth ? 'w-full' : ''} flex items-center justify-center gap-2 transition-all disabled:opacity-50`}
      style={{
        background: colorMap[variant],
        color: textColorMap[variant],
        boxShadow: glowMap[variant],
        letterSpacing: '-0.01em',
      }}
    >
      {icon}
      {children}
    </motion.button>
  );
};

interface AppleLargeTitleProps {
  children: React.ReactNode;
  subtitle?: string;
}

export const AppleLargeTitle: React.FC<AppleLargeTitleProps> = ({ children, subtitle }) => {
  return (
    <div className="mb-4">
      <h1
        className="text-[34px] font-bold tracking-tight"
        style={{ color: 'var(--ios-label)', letterSpacing: '-0.022em', lineHeight: 1.1 }}
      >
        {children}
      </h1>
      {subtitle && (
        <p className="text-[15px] mt-1" style={{ color: 'var(--ios-label-secondary)', letterSpacing: '-0.01em' }}>
          {subtitle}
        </p>
      )}
    </div>
  );
};

interface AppleBadgeProps {
  children: React.ReactNode;
  color?: 'blue' | 'green' | 'red' | 'orange' | 'purple' | 'gray';
}

export const AppleBadge: React.FC<AppleBadgeProps> = ({ children, color = 'gray' }) => {
  const colorMap: Record<NonNullable<AppleBadgeProps['color']>, { bg: string; fg: string }> = {
    blue: { bg: 'rgba(0, 122, 255, 0.12)', fg: 'var(--ios-blue)' },
    green: { bg: 'rgba(52, 199, 89, 0.12)', fg: 'var(--ios-green)' },
    red: { bg: 'rgba(255, 59, 48, 0.12)', fg: 'var(--ios-red)' },
    orange: { bg: 'rgba(255, 149, 0, 0.12)', fg: 'var(--ios-orange)' },
    purple: { bg: 'rgba(175, 82, 222, 0.12)', fg: 'var(--ios-purple)' },
    gray: { bg: 'rgba(142, 142, 147, 0.16)', fg: 'var(--ios-label-secondary)' },
  };
  return (
    <span
      className="text-[11px] font-semibold px-2 py-0.5 rounded-[6px] inline-flex items-center"
      style={{ background: colorMap[color].bg, color: colorMap[color].fg }}
    >
      {children}
    </span>
  );
};

interface AppleStatCardProps {
  icon: React.ReactNode;
  iconColor: string;
  value: string;
  label: string;
  trend?: { value: string; positive: boolean };
}

export const AppleStatCard: React.FC<AppleStatCardProps> = ({ icon, iconColor, value, label, trend }) => {
  return (
    <div
      className="rounded-[16px] p-4"
      style={{
        background: 'var(--ios-bg-elevated)',
        border: '0.5px solid var(--ios-separator)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      <div
        className="w-9 h-9 rounded-[10px] flex items-center justify-center mb-3"
        style={{ background: `${iconColor}1F`, color: iconColor }}
      >
        {icon}
      </div>
      <div
        className="text-[22px] font-bold tracking-tight tabular-nums"
        style={{ color: 'var(--ios-label)', letterSpacing: '-0.015em' }}
      >
        {value}
      </div>
      <div className="text-[12px] mt-0.5" style={{ color: 'var(--ios-label-secondary)' }}>
        {label}
      </div>
      {trend && (
        <div className="flex items-center gap-1 mt-1.5 text-[11px]">
          <span
            style={{ color: trend.positive ? 'var(--ios-green)' : 'var(--ios-red)' }}
            className="font-semibold tabular-nums"
          >
            {trend.positive ? '↑' : '↓'} {trend.value}
          </span>
        </div>
      )}
    </div>
  );
};

interface AppleEmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const AppleEmptyState: React.FC<AppleEmptyStateProps> = ({ icon, title, description, action }) => {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
        style={{ background: 'var(--ios-bg-tertiary)', color: 'var(--ios-label-tertiary)' }}
      >
        {icon}
      </div>
      <div className="text-[17px] font-semibold mb-1" style={{ color: 'var(--ios-label)' }}>
        {title}
      </div>
      {description && (
        <p className="text-[14px] max-w-xs" style={{ color: 'var(--ios-label-secondary)' }}>
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
};
