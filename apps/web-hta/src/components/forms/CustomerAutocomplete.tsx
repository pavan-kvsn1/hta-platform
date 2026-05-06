'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Building2, MapPin, Loader2, Search, User, Star } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface Customer {
  id: string
  companyName: string
  address: string | null
  contactEmail: string | null
  contactPhone: string | null
}

interface CustomerUser {
  id: string
  name: string
  email: string | null
  isPoc: boolean
}

interface CustomerAutocompleteProps {
  value: string
  address: string
  contactName: string
  contactEmail: string
  onCustomerSelect: (customer: { id: string; name: string; address: string }) => void
  onNameChange: (name: string) => void
  onAddressChange: (address: string) => void
  onContactNameChange: (name: string) => void
  onContactEmailChange: (email: string) => void
  disabled?: boolean
  className?: string
}

export function CustomerAutocomplete({
  value,
  address,
  contactName,
  contactEmail: _contactEmail,
  onCustomerSelect,
  onNameChange,
  onAddressChange,
  onContactNameChange,
  onContactEmailChange,
  disabled = false,
  className,
}: CustomerAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Contact users state
  const [isContactOpen, setIsContactOpen] = useState(false)
  const [contactUsers, setContactUsers] = useState<CustomerUser[]>([])
  const [isContactLoading, setIsContactLoading] = useState(false)
  const [contactHighlightedIndex, setContactHighlightedIndex] = useState(-1)
  const contactContainerRef = useRef<HTMLDivElement>(null)
  const contactInputRef = useRef<HTMLInputElement>(null)

  // Debounced search
  const searchCustomers = useCallback(async (query: string) => {
    if (query.length < 2) {
      setCustomers([])
      setIsOpen(false)
      return
    }

    setIsLoading(true)
    try {
      const res = await apiFetch(`/api/customers/search?q=${encodeURIComponent(query)}&limit=5`)
      if (res.ok) {
        const data = await res.json()
        setCustomers(data.customers)
        setHighlightedIndex(-1)
        setIsOpen(data.customers.length > 0)
      }
    } catch (err) {
      console.error('Error searching customers:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Debounce effect for customer search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery !== value) {
        setSearchQuery(value)
      }
      searchCustomers(value)
    }, 300)

    return () => clearTimeout(timer)
  }, [value, searchCustomers, searchQuery])

  // Search customer users (contacts)
  const searchContactUsers = useCallback(async (company: string, query: string, openDropdown: boolean = false) => {
    if (company.length < 2) {
      setContactUsers([])
      setIsContactOpen(false)
      return
    }

    setIsContactLoading(true)
    try {
      const params = new URLSearchParams({ company })
      if (query.length > 0) {
        params.set('q', query)
      }
      const res = await apiFetch(`/api/customers/users?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setContactUsers(data.users)
        setContactHighlightedIndex(-1)
        if (openDropdown && data.users.length > 0) {
          setIsContactOpen(true)
        }
      }
    } catch (err) {
      console.error('Error searching contact users:', err)
    } finally {
      setIsContactLoading(false)
    }
  }, [])

  // Fetch contacts when customer name changes (to pre-populate suggestions)
  useEffect(() => {
    if (value.length >= 2) {
      // Fetch contacts without opening dropdown
      searchContactUsers(value, '', false)
    } else {
      setContactUsers([])
    }
  }, [value, searchContactUsers])

  // Debounce effect for contact name search (when user types in contact field)
  useEffect(() => {
    if (contactName.length === 0) return // Don't search on empty - handled by focus

    const timer = setTimeout(() => {
      searchContactUsers(value, contactName, true)
    }, 300)

    return () => clearTimeout(timer)
  }, [contactName, value, searchContactUsers])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
      if (contactContainerRef.current && !contactContainerRef.current.contains(event.target as Node)) {
        setIsContactOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (customer: Customer) => {
    onCustomerSelect({
      id: customer.id,
      name: customer.companyName,
      address: customer.address || '',
    })
    setIsOpen(false)
    setHighlightedIndex(-1)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onNameChange(e.target.value)
  }

  const handleInputFocus = () => {
    if (customers.length > 0 && value.length >= 2) {
      setIsOpen(true)
    }
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || customers.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) =>
          prev < customers.length - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : customers.length - 1
        )
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < customers.length) {
          handleSelect(customers[highlightedIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        setHighlightedIndex(-1)
        break
    }
  }

  const handleContactSelect = (user: CustomerUser) => {
    onContactNameChange(user.name)
    onContactEmailChange(user.email || '')
    setIsContactOpen(false)
    setContactHighlightedIndex(-1)
  }

  const handleContactInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onContactNameChange(e.target.value)
  }

  const handleContactInputFocus = () => {
    if (value.length < 2) return

    if (contactUsers.length > 0) {
      setIsContactOpen(true)
    } else {
      // Fetch contacts if not already loaded
      searchContactUsers(value, contactName, true)
    }
  }

  const handleContactInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isContactOpen || contactUsers.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setContactHighlightedIndex((prev) =>
          prev < contactUsers.length - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setContactHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : contactUsers.length - 1
        )
        break
      case 'Enter':
        e.preventDefault()
        if (contactHighlightedIndex >= 0 && contactHighlightedIndex < contactUsers.length) {
          handleContactSelect(contactUsers[contactHighlightedIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        setIsContactOpen(false)
        setContactHighlightedIndex(-1)
        break
    }
  }

  return (
    <div ref={containerRef} className={cn('space-y-4', className)}>
      {/* Customer Name Input with Autocomplete */}
      <div>
        <Label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
          Customer Name
        </Label>
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
            <Building2 className="size-5" />
          </div>
          <Input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onKeyDown={handleInputKeyDown}
            placeholder="Start typing customer name..."
            disabled={disabled}
            className="w-full rounded-xl border border-slate-300 bg-white h-12 pl-12 pr-12 focus:ring-2 focus:ring-primary focus:border-primary font-semibold shadow-sm"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            {isLoading ? (
              <Loader2 className="size-5 text-slate-400 animate-spin" />
            ) : (
              <Search className="size-5 text-slate-400" />
            )}
          </div>

        </div>
      </div>

      {/* Dropdown - flows in document, pushing address below */}
      {isOpen && customers.length > 0 && (
        <div className="bg-white border border-slate-300 rounded-xl shadow-lg max-h-64 overflow-auto">
          <div className="p-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b">
            Suggestions
          </div>
          {customers.map((customer, index) => (
            <button
              key={customer.id}
              type="button"
              onClick={() => handleSelect(customer)}
              className={cn(
                "w-full px-4 py-3 text-left flex items-start gap-3 transition-colors border-b border-slate-100 last:border-b-0",
                index === highlightedIndex
                  ? "bg-primary/10 border-l-2 border-l-primary"
                  : "hover:bg-slate-50"
              )}
            >
              <div className="flex-shrink-0 mt-0.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 text-sm truncate">
                  {customer.companyName}
                </p>
                {customer.address && (
                  <p className="text-xs text-slate-500 truncate mt-0.5 flex items-center gap-1">
                    <MapPin className="size-3 flex-shrink-0" />
                    {customer.address}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Address Input */}
      <div>
        <Label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
          Full Address
        </Label>
        <div className="relative">
          <div className="absolute left-4 top-4 text-slate-500">
            <MapPin className="size-5" />
          </div>
          <textarea
            value={address}
            onChange={(e) => onAddressChange(e.target.value)}
            placeholder="Enter customer address"
            disabled={disabled}
            rows={3}
            className="w-full rounded-xl border border-slate-300 bg-white pl-12 pr-4 py-3 focus:ring-2 focus:ring-primary focus:border-primary font-medium resize-none shadow-sm"
          />
        </div>
      </div>

      {/* Customer Contact Name Input with Autocomplete */}
      <div ref={contactContainerRef} className="space-y-0">
        <Label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
          Customer Contact Name
        </Label>
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
            <User className="size-5" />
          </div>
          <Input
            ref={contactInputRef}
            type="text"
            value={contactName}
            onChange={handleContactInputChange}
            onFocus={handleContactInputFocus}
            onKeyDown={handleContactInputKeyDown}
            placeholder={value.length >= 2 ? "Start typing contact name..." : "Enter customer name first"}
            disabled={disabled || value.length < 2}
            className="w-full rounded-xl border border-slate-300 bg-white h-12 pl-12 pr-12 focus:ring-2 focus:ring-primary focus:border-primary font-semibold shadow-sm"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            {isContactLoading ? (
              <Loader2 className="size-5 text-slate-400 animate-spin" />
            ) : (
              <Search className="size-5 text-slate-400" />
            )}
          </div>
        </div>

        {/* Contact Users Dropdown - inside contactContainerRef to prevent outside click issues */}
        {isContactOpen && contactUsers.length > 0 && (
          <div className="mt-2 bg-white border border-slate-300 rounded-xl shadow-lg max-h-64 overflow-auto">
            <div className="p-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b">
              Contact Suggestions
            </div>
            {contactUsers.map((user, index) => (
              <button
                key={user.id}
                type="button"
                onClick={() => handleContactSelect(user)}
                className={cn(
                  "w-full px-4 py-3 text-left flex items-start gap-3 transition-colors border-b border-slate-100 last:border-b-0",
                  index === contactHighlightedIndex
                    ? "bg-primary/10 border-l-2 border-l-primary"
                    : "hover:bg-slate-50"
                )}
              >
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900 text-sm truncate">
                      {user.name}
                    </p>
                    {user.isPoc && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                        <Star className="size-3" />
                        POC
                      </span>
                    )}
                  </div>
                  {user.email && (
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {user.email}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {value.length >= 2 && !isLoading && customers.length === 0 && (
        <div className="flex items-center gap-2 px-1 py-2">
          <Building2 className="size-3.5 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-600 font-medium">
            Customer not found. Ask your admin to create the account first.
          </p>
        </div>
      )}
    </div>
  )
}
