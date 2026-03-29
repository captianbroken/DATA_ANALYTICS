import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
}

export const Modal = ({ isOpen, onClose, title, children, maxWidth = 'max-w-lg' }: ModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <div
        className={`relative bg-white rounded-xl shadow-2xl w-full ${maxWidth} max-h-[90vh] overflow-y-auto text-slate-800 [&_input]:text-slate-800 [&_input]:placeholder:text-slate-400 [&_select]:text-slate-800 [&_textarea]:text-slate-800`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

interface FormFieldProps {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
}

export const FormField = ({ label, type = 'text', value, onChange, placeholder, required, options }: FormFieldProps) => (
  <div>
    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
      {label}{required && <span className="text-red-500 ml-1">*</span>}
    </label>
    {options ? (
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2.5 text-sm text-slate-800 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white"
      >
        <option value="">Select {label}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    ) : (
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full px-3 py-2.5 text-sm text-slate-800 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
      />
    )}
  </div>
);

interface FormActionsProps {
  onCancel: () => void;
  loading?: boolean;
  submitLabel?: string;
  disabled?: boolean;
  secondaryLabel?: string;
  secondaryLoading?: boolean;
  secondaryDisabled?: boolean;
  onSecondaryAction?: () => void;
}

export const FormActions = ({
  onCancel,
  loading,
  submitLabel = 'Save',
  disabled,
  secondaryLabel = 'Test Connection',
  secondaryLoading,
  secondaryDisabled,
  onSecondaryAction,
}: FormActionsProps) => (
  <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
    <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
      Cancel
    </button>
    {onSecondaryAction && (
      <button
        type="button"
        onClick={onSecondaryAction}
        disabled={secondaryLoading || secondaryDisabled}
        className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
      >
        {secondaryLoading ? 'Testing...' : secondaryLabel}
      </button>
    )}
    <button
      type="submit"
      disabled={loading || disabled}
      style={{ backgroundColor: '#005baa' }}
      className="px-5 py-2 text-sm text-white rounded-lg hover:opacity-90 transition-opacity font-medium disabled:opacity-50"
    >
      {loading ? 'Saving...' : submitLabel}
    </button>
  </div>
);
