import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';
import { useLookup } from '../../context/LookupContext';

export interface AccountOption {
  id: string;
  code: string;
  name: string;
  is_group?: boolean;
  type?: string;
  account_type_id?: string;
}

interface AccountAutocompleteProps {
  value: string;
  onChange: (accountId: string, account?: AccountOption) => void;
  accounts: AccountOption[];
  placeholder?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
}

export const AccountAutocomplete: React.FC<AccountAutocompleteProps> = ({
  value,
  onChange,
  accounts,
  placeholder = 'ابحث برقم أو اسم الحساب (F4)',
  onKeyDown,
  inputRef: externalRef,
  disabled = false,
  className = '',
  autoFocus = false,
}) => {
  const { openLookup } = useLookup();
  const internalRef = useRef<HTMLInputElement>(null);
  const inputRef = externalRef || internalRef;
  const containerRef = useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);

  // Selected account
  const selectedAccount = useMemo(() => {
    return accounts.find((a) => a.id === value);
  }, [accounts, value]);

  // Sync display text when value changes
  useEffect(() => {
    if (selectedAccount) {
      setQuery(`${selectedAccount.code} - ${selectedAccount.name}`);
    } else if (!value) {
      setQuery('');
    }
  }, [selectedAccount, value]);

  // Filter leaf accounts based on query
  const filteredAccounts = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    // Only leaf accounts can be posted to
    const leafAccounts = accounts.filter((a) => !a.is_group);

    if (!trimmed || (selectedAccount && `${selectedAccount.code} - ${selectedAccount.name}` === query)) {
      return leafAccounts.slice(0, 15);
    }

    return leafAccounts
      .filter(
        (a) =>
          a.code.toLowerCase().includes(trimmed) ||
          a.name.toLowerCase().includes(trimmed)
      )
      .slice(0, 15);
  }, [accounts, query, selectedAccount]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        // Reset query text to selected account if not empty
        if (selectedAccount) {
          setQuery(`${selectedAccount.code} - ${selectedAccount.name}`);
        } else {
          setQuery('');
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedAccount]);

  const handleSelect = (account: AccountOption) => {
    onChange(account.id, account);
    setQuery(`${account.code} - ${account.name}`);
    setIsOpen(false);
  };

  const handleOpenLookupDialog = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    openLookup('ACCOUNT', (record: any) => {
      if (record && record.id) {
        handleSelect(record);
      }
    });
  };

  const handleKeyDownInternal = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // F4: open lookup dialog
    if (e.key === 'F4') {
      e.preventDefault();
      handleOpenLookupDialog();
      return;
    }

    if (isOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIndex((prev) => Math.min(prev + 1, filteredAccounts.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        if (filteredAccounts.length > 0 && highlightIndex >= 0 && highlightIndex < filteredAccounts.length) {
          e.preventDefault();
          const chosen = filteredAccounts[highlightIndex];
          handleSelect(chosen);
          if (onKeyDown) {
            onKeyDown(e);
          }
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        if (selectedAccount) {
          setQuery(`${selectedAccount.code} - ${selectedAccount.name}`);
        }
        return;
      }
    } else {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setIsOpen(true);
        return;
      }
    }

    // Pass through to external onKeyDown (e.g. for Tab or Enter navigation)
    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={query}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onFocus={() => {
            setIsOpen(true);
            setHighlightIndex(0);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setHighlightIndex(0);
          }}
          onKeyDown={handleKeyDownInternal}
          className="h-8 w-full rounded-control border border-line bg-surface pe-14 ps-2.5 text-xs text-ink transition-colors placeholder:text-ink-muted/60 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50"
        />

        {/* Action icons inside input */}
        <div className="absolute end-1 flex items-center gap-0.5">
          {query && !disabled && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => {
                onChange('');
                setQuery('');
                setIsOpen(true);
                inputRef.current?.focus();
              }}
              className="flex h-5 w-5 items-center justify-center rounded text-ink-muted hover:text-ink"
              title="مسح الحساب"
            >
              <X size={12} />
            </button>
          )}

          <button
            type="button"
            tabIndex={-1}
            onClick={handleOpenLookupDialog}
            disabled={disabled}
            className="flex h-6 w-6 items-center justify-center rounded bg-surface-muted text-ink-muted transition-colors hover:bg-brand-soft hover:text-brand"
            title="بحث في الدليل الشامل (F4)"
          >
            <Search size={12} />
          </button>
        </div>
      </div>

      {/* Autocomplete Dropdown */}
      {isOpen && !disabled && (
        <div className="absolute z-50 mt-1 max-h-60 w-full min-w-[280px] overflow-auto rounded-card border border-line bg-surface py-1 text-xs shadow-k-lg">
          {filteredAccounts.length === 0 ? (
            <div className="px-3 py-2.5 text-center text-[11px] text-ink-muted">
              لا توجد حسابات تفصيلية مطابقة للبحث
            </div>
          ) : (
            filteredAccounts.map((acc, index) => {
              const isSelected = acc.id === value;
              const isHighlighted = index === highlightIndex;

              return (
                <div
                  key={acc.id}
                  onClick={() => handleSelect(acc)}
                  onMouseEnter={() => setHighlightIndex(index)}
                  className={`flex cursor-pointer items-center justify-between px-3 py-1.5 transition-colors ${
                    isHighlighted
                      ? 'bg-brand-soft text-brand font-medium'
                      : isSelected
                      ? 'bg-surface-muted text-ink font-semibold'
                      : 'text-ink hover:bg-surface-hover'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="kayan-numeric font-mono font-bold text-ink-muted text-[11px]">
                      {acc.code}
                    </span>
                    <span className="truncate">{acc.name}</span>
                  </div>

                  {isSelected && <Check size={14} className="shrink-0 text-brand" />}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
