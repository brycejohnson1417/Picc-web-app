import React, { useState, useEffect, useMemo } from 'react';
import { ClipboardList, History, Wifi, WifiOff, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import { Product, ProposalCustomer, ProposalLineItem, SavedProposal } from '../types';
import { MOCK_PRODUCTS, PROPOSAL_CUSTOMERS, SEED_PROPOSALS } from '../constants';
import { ProposalFilterBar } from './ProposalFilterBar';
import { ProposalProductGrid } from './ProposalProductGrid';
import { ProposalSummary } from './ProposalSummary';
import { ProposalHistory } from './ProposalHistory';
import { ProposalCustomerModal } from './ProposalCustomerModal';
import { exportToPDF, exportToExcel, exportToCSV, copyToClipboard, copyWithQuantities } from '../services/proposalExportService';
import { fetchInventory, InventoryStatus } from '../services/inventoryService';

export const ProposalBuilder: React.FC = () => {
  // Sub-tab navigation
  const [activeSubTab, setActiveSubTab] = useState<'create' | 'history'>('create');

  // Product selection state
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // Proposal metadata
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [proposalTitle, setProposalTitle] = useState('');
  const [proposalNotes, setProposalNotes] = useState('');

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedStrainType, setSelectedStrainType] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);

  // Data state
  const [customers, setCustomers] = useState<ProposalCustomer[]>([]);
  const [savedProposals, setSavedProposals] = useState<SavedProposal[]>([]);

  // Inventory state
  const [products, setProducts] = useState<Product[]>(MOCK_PRODUCTS);
  const [inventoryStatus, setInventoryStatus] = useState<InventoryStatus>('mock');
  const [isLoadingInventory, setIsLoadingInventory] = useState(true);

  // UI state
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Load data from localStorage on mount
  useEffect(() => {
    try {
      const storedCustomers = localStorage.getItem('picc_proposal_customers');
      setCustomers(storedCustomers ? JSON.parse(storedCustomers) : PROPOSAL_CUSTOMERS);

      const storedProposals = localStorage.getItem('picc_saved_proposals');
      setSavedProposals(storedProposals ? JSON.parse(storedProposals) : SEED_PROPOSALS);
    } catch (error) {
      console.error('Error loading proposal data:', error);
      setCustomers(PROPOSAL_CUSTOMERS);
      setSavedProposals(SEED_PROPOSALS);
    }
  }, []);

  // Fetch live inventory on mount and refresh every 5 minutes
  useEffect(() => {
    let mounted = true;

    const loadInventory = async () => {
      try {
        const result = await fetchInventory();
        if (mounted) {
          setProducts(result.products);
          setInventoryStatus(result.status);
          setIsLoadingInventory(false);
        }
      } catch {
        if (mounted) setIsLoadingInventory(false);
      }
    };

    loadInventory();
    const interval = setInterval(loadInventory, 5 * 60 * 1000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Computed values
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          (product.strain_name?.toLowerCase().includes(query) ?? false) ||
          product.brand.toLowerCase().includes(query) ||
          product.product_title.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // Brand filter
      if (selectedBrands.length > 0 && !selectedBrands.includes(product.brand)) {
        return false;
      }

      // Strain type filter
      if (selectedStrainType && product.strain_type !== selectedStrainType) {
        return false;
      }

      // Size filter
      if (selectedSize && product.size !== selectedSize) {
        return false;
      }

      return true;
    });
  }, [searchQuery, selectedBrands, selectedStrainType, selectedSize, products]);

  const lineItems = useMemo((): ProposalLineItem[] => {
    return Object.entries(quantities)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .filter(([_, qty]) => (qty as number) > 0)
      .map(([productId, quantity]) => {
        const product = products.find(p => p.id === productId);
        if (!product) return null;

        const qty = quantity as number;

        return {
          product_id: productId,
          product_title: product.product_title,
          brand: product.brand,
          strain_name: product.strain_name || product.product_title,
          strain_type: product.strain_type || '',
          size: product.size,
          quantity: qty,
          unit_price: product.unit_price,
          line_total: product.unit_price * qty,
        };
      })
      .filter((item): item is ProposalLineItem => item !== null);
  }, [quantities, products]);

  const totalCost = useMemo(() => {
    return lineItems.reduce((sum, item) => sum + item.line_total, 0);
  }, [lineItems]);

  const totalItems = useMemo(() => {
    return lineItems.reduce((sum, item) => sum + item.quantity, 0);
  }, [lineItems]);

  const availableBrands = useMemo(() => {
    const brands = new Set(products.map(p => p.brand));
    return Array.from(brands).sort();
  }, [products]);

  const availableSizes = useMemo(() => {
    const sizes = new Set(products.map(p => p.size));
    return Array.from(sizes).sort();
  }, [products]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery) count++;
    if (selectedBrands.length > 0) count++;
    if (selectedStrainType) count++;
    if (selectedSize) count++;
    return count;
  }, [searchQuery, selectedBrands, selectedStrainType, selectedSize]);

  // Handlers
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSaveProposal = () => {
    if (lineItems.length === 0) {
      showToast('Please add at least one product to the proposal', 'error');
      return;
    }

    const customer = customers.find(c => c.id === selectedCustomerId);
    if (!customer) {
      showToast('Please select a customer', 'error');
      return;
    }

    if (!proposalTitle.trim()) {
      showToast('Please enter a proposal title', 'error');
      return;
    }

    const newProposal: SavedProposal = {
      id: `prop-${Date.now()}`,
      title: proposalTitle,
      customer,
      items: lineItems,
      total_cost: totalCost,
      total_items: totalItems,
      notes: proposalNotes || undefined,
      created_at: new Date().toISOString(),
      status: 'submitted',
    };

    const updated = [newProposal, ...savedProposals];
    setSavedProposals(updated);
    localStorage.setItem('picc_saved_proposals', JSON.stringify(updated));

    // Reset form
    setQuantities({});
    setProposalTitle('');
    setProposalNotes('');
    setSelectedCustomerId(null);

    showToast('Proposal saved successfully!', 'success');
    setActiveSubTab('history');
  };

  const handleExport = async (format: 'pdf' | 'excel' | 'csv' | 'clipboard' | 'clipboard-qty') => {
    if (lineItems.length === 0) {
      showToast('Please add products to export', 'error');
      return;
    }

    const customer = customers.find(c => c.id === selectedCustomerId);
    const proposal: SavedProposal = {
      id: 'temp-export',
      title: proposalTitle || 'New Proposal',
      customer: customer || { id: 'unknown', name: 'Unknown', created_at: new Date().toISOString() },
      items: lineItems,
      total_cost: totalCost,
      total_items: totalItems,
      notes: proposalNotes || undefined,
      created_at: new Date().toISOString(),
      status: 'draft',
    };

    try {
      switch (format) {
        case 'pdf':
          exportToPDF(proposal);
          showToast('PDF exported successfully!', 'success');
          break;
        case 'excel':
          exportToExcel(proposal);
          showToast('Excel file exported successfully!', 'success');
          break;
        case 'csv':
          exportToCSV(proposal);
          showToast('CSV file exported successfully!', 'success');
          break;
        case 'clipboard':
          await copyToClipboard(lineItems);
          showToast('Copied to clipboard!', 'success');
          break;
        case 'clipboard-qty':
          await copyWithQuantities(lineItems);
          showToast('Copied with quantities to clipboard!', 'success');
          break;
      }
    } catch (error) {
      showToast('Export failed. Please try again.', 'error');
      console.error('Export error:', error);
    }
  };

  const handleAddCustomer = (name: string, dba?: string, location?: string) => {
    const newCustomer: ProposalCustomer = {
      id: `cust-${Date.now()}`,
      name,
      dba_name: dba,
      location,
      created_at: new Date().toISOString(),
    };

    const updated = [...customers, newCustomer];
    setCustomers(updated);
    localStorage.setItem('picc_proposal_customers', JSON.stringify(updated));
    setSelectedCustomerId(newCustomer.id);
    setShowCustomerModal(false);
    showToast('Customer added successfully!', 'success');
  };

  const handleDuplicateProposal = (proposal: SavedProposal) => {
    const newQuantities: Record<string, number> = {};
    proposal.items.forEach(item => {
      newQuantities[item.product_id] = item.quantity;
    });

    setQuantities(newQuantities);
    setProposalTitle(`${proposal.title} (Copy)`);
    setProposalNotes(proposal.notes || '');
    setSelectedCustomerId(proposal.customer.id);
    setActiveSubTab('create');
    showToast('Proposal duplicated to builder', 'success');
  };

  const handleClearAll = () => {
    setQuantities({});
    setProposalTitle('');
    setProposalNotes('');
    setSelectedCustomerId(null);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedBrands([]);
    setSelectedStrainType(null);
    setSelectedSize(null);
  };

  return (
    <div className="space-y-6">
      {/* Toast notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top">
          <div className={`px-4 py-3 rounded-lg shadow-lg ${
            toast.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          }`}>
            {toast.message}
          </div>
        </div>
      )}

      {/* Inventory Status Banners */}
      {isLoadingInventory && (
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 px-4 py-2 rounded-lg flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Syncing inventory with Notion...</span>
        </div>
      )}

      {!isLoadingInventory && inventoryStatus === 'live' && (
        <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 px-4 py-2 rounded-lg flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
          <Wifi className="w-4 h-4" />
          <span>Live Inventory Active • {products.length} products loaded</span>
        </div>
      )}

      {!isLoadingInventory && inventoryStatus === 'cached' && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-4 py-2 rounded-lg flex items-center justify-between text-sm text-amber-800 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4" />
            <span>Using Cached Data (Offline Mode) • {products.length} products</span>
          </div>
          <button 
            onClick={async () => {
              setIsLoadingInventory(true);
              const result = await fetchInventory();
              setProducts(result.products);
              setInventoryStatus(result.status);
              setIsLoadingInventory(false);
            }}
            className="flex items-center gap-1 hover:underline"
          >
            <RefreshCw className="w-3 h-3" /> Retry Connection
          </button>
        </div>
      )}

      {!isLoadingInventory && inventoryStatus === 'mock' && (
        <div className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-lg flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>Demo Mode (Mock Data) • {products.length} products</span>
          </div>
          <button 
            onClick={async () => {
              setIsLoadingInventory(true);
              const result = await fetchInventory();
              setProducts(result.products);
              setInventoryStatus(result.status);
              setIsLoadingInventory(false);
            }}
            className="flex items-center gap-1 hover:underline"
          >
            <RefreshCw className="w-3 h-3" /> Connect Live
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Proposal Builder</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Build and export branded proposals for your accounts</p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveSubTab('create')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            activeSubTab === 'create'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <ClipboardList className="w-5 h-5" />
          Create Proposal
        </button>
        <button
          onClick={() => setActiveSubTab('history')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            activeSubTab === 'history'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <History className="w-5 h-5" />
          Saved Proposals ({savedProposals.length})
        </button>
      </div>

      {/* Tab content */}
      {activeSubTab === 'create' ? (
        <>
          <ProposalFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedStrainType={selectedStrainType}
            onStrainTypeChange={setSelectedStrainType}
            selectedBrands={selectedBrands}
            onBrandsChange={setSelectedBrands}
            selectedSize={selectedSize}
            onSizeChange={setSelectedSize}
            availableBrands={availableBrands}
            availableSizes={availableSizes}
            activeFilterCount={activeFilterCount}
            onClearFilters={handleClearFilters}
          />
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1 min-w-0">
              <ProposalProductGrid
                products={filteredProducts}
                quantities={quantities}
                onQuantityChange={(productId, quantity) => {
                  setQuantities(prev => ({
                    ...prev,
                    [productId]: quantity,
                  }));
                }}
              />
            </div>
            <ProposalSummary
              lineItems={lineItems}
              totalCost={totalCost}
              totalItems={totalItems}
              selectedCustomerId={selectedCustomerId}
              onCustomerChange={setSelectedCustomerId}
              proposalTitle={proposalTitle}
              onTitleChange={setProposalTitle}
              proposalNotes={proposalNotes}
              onNotesChange={setProposalNotes}
              customers={customers}
              onShowCustomerModal={() => setShowCustomerModal(true)}
              onSave={handleSaveProposal}
              onExport={handleExport}
              onClear={handleClearAll}
              onRemoveItem={(productId) => {
                setQuantities(prev => {
                  const next = { ...prev };
                  delete next[productId];
                  return next;
                });
              }}
            />
          </div>
        </>
      ) : (
        <ProposalHistory
          proposals={savedProposals}
          onDuplicate={handleDuplicateProposal}
          onExport={(proposal, format) => {
            try {
              switch (format) {
                case 'pdf':
                  exportToPDF(proposal);
                  break;
                case 'excel':
                  exportToExcel(proposal);
                  break;
                case 'csv':
                  exportToCSV(proposal);
                  break;
              }
              showToast('Exported successfully!', 'success');
            } catch (error) {
              showToast('Export failed. Please try again.', 'error');
              console.error('Export error:', error);
            }
          }}
          onDelete={(proposalId) => {
            const updated = savedProposals.filter(p => p.id !== proposalId);
            setSavedProposals(updated);
            localStorage.setItem('picc_saved_proposals', JSON.stringify(updated));
            showToast('Proposal deleted', 'success');
          }}
        />
      )}

      {/* Customer modal */}
      {showCustomerModal && (
        <ProposalCustomerModal
          onClose={() => setShowCustomerModal(false)}
          onAdd={handleAddCustomer}
        />
      )}
    </div>
  );
};