import React, { createContext, useContext, useState, ReactNode } from 'react';

export type LookupType = 
  | 'ACCOUNT' 
  | 'ITEM' 
  | 'CUSTOMER' 
  | 'SUPPLIER' 
  | 'CASH_ACCOUNT' 
  | 'BANK_ACCOUNT' 
  | 'WAREHOUSE' 
  | 'COST_CENTER' 
  | 'TAX_CODE' 
  | 'UNIT' 
  | 'BRANCH' 
  | 'ASSET' 
  | 'EXPENSE_CATEGORY';

interface LookupContextType {
  isOpen: boolean;
  lookupType: LookupType | null;
  onSelect: ((record: any) => void) | null;
  openLookup: (type: LookupType, callback: (record: any) => void) => void;
  closeLookup: () => void;
}

const LookupContext = createContext<LookupContextType | undefined>(undefined);

export const LookupProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [lookupType, setLookupType] = useState<LookupType | null>(null);
  const [onSelectCallback, setOnSelectCallback] = useState<((record: any) => void) | null>(null);

  const openLookup = (type: LookupType, callback: (record: any) => void) => {
    setLookupType(type);
    setOnSelectCallback(() => (record: any) => {
      try {
        callback(record);
      } catch (err) {
        console.error('Error executing lookup onSelect callback:', err);
      }
    });
    setIsOpen(true);
  };

  const closeLookup = () => {
    setIsOpen(false);
    setLookupType(null);
    setOnSelectCallback(null);
  };

  return (
    <LookupContext.Provider value={{ isOpen, lookupType, onSelect: onSelectCallback, openLookup, closeLookup }}>
      {children}
    </LookupContext.Provider>
  );
};

export const useLookup = () => {
  const context = useContext(LookupContext);
  if (!context) {
    return {
      isOpen: false,
      lookupType: null,
      onSelect: null,
      openLookup: () => {},
      closeLookup: () => {}
    };
  }
  return context;
};

