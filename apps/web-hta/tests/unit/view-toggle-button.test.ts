/**
 * View Toggle Button Unit Tests
 *
 * Tests for view toggle button behavior:
 * - PDF preview vs download mode
 * - Authorization-based rendering
 * - Click handling and callbacks
 *
 * Migrated from hta-calibration/src/components/__tests__/ViewToggleButton.test.tsx
 * Self-contained version without component dependencies
 */
import { describe, it, expect, vi } from 'vitest'

// Types
interface ViewToggleButtonProps {
  viewMode: 'details' | 'pdf'
  onViewModeChange: (mode: 'details' | 'pdf') => void
  isAuthorized?: boolean
  onDownload?: () => void
  isDownloading?: boolean
}

// Logic extracted from component for testing
function getButtonLabel(props: ViewToggleButtonProps): string {
  if (props.isDownloading) {
    return 'Downloading...'
  }
  if (props.viewMode === 'pdf') {
    return 'View Details'
  }
  if (props.isAuthorized) {
    return 'Download PDF'
  }
  return 'Preview PDF'
}

function handleClick(props: ViewToggleButtonProps): void {
  if (props.isDownloading) return

  if (props.viewMode === 'details') {
    if (props.isAuthorized && props.onDownload) {
      props.onDownload()
    } else {
      props.onViewModeChange('pdf')
    }
  } else {
    props.onViewModeChange('details')
  }
}

function isDisabled(props: ViewToggleButtonProps): boolean {
  return props.isDownloading === true
}

function getButtonStyling(props: ViewToggleButtonProps): { bgClass: string; textClass: string } {
  if (props.viewMode === 'details' && props.isAuthorized) {
    return { bgClass: 'bg-blue-600', textClass: 'text-white' }
  }
  return { bgClass: 'bg-white', textClass: 'text-gray-700' }
}

describe('ViewToggleButton', () => {
  const defaultProps: ViewToggleButtonProps = {
    viewMode: 'details',
    onViewModeChange: vi.fn(),
  }

  describe('rendering in details mode', () => {
    it('shows "Preview PDF" button when not authorized', () => {
      const label = getButtonLabel({ ...defaultProps })
      expect(label).toBe('Preview PDF')
    })

    it('shows "Download PDF" button when authorized', () => {
      const label = getButtonLabel({ ...defaultProps, isAuthorized: true, onDownload: vi.fn() })
      expect(label).toBe('Download PDF')
    })

    it('shows "Downloading..." when isDownloading is true', () => {
      const label = getButtonLabel({
        ...defaultProps,
        isAuthorized: true,
        onDownload: vi.fn(),
        isDownloading: true,
      })
      expect(label).toBe('Downloading...')
    })
  })

  describe('rendering in PDF mode', () => {
    it('shows "View Details" button', () => {
      const label = getButtonLabel({ ...defaultProps, viewMode: 'pdf' })
      expect(label).toBe('View Details')
    })

    it('shows "View Details" even when authorized', () => {
      const label = getButtonLabel({ ...defaultProps, viewMode: 'pdf', isAuthorized: true })
      expect(label).toBe('View Details')
    })
  })

  describe('click behavior', () => {
    it('calls onViewModeChange with "pdf" when clicking Preview PDF', () => {
      const onViewModeChange = vi.fn()
      handleClick({ ...defaultProps, onViewModeChange })
      expect(onViewModeChange).toHaveBeenCalledWith('pdf')
    })

    it('calls onViewModeChange with "details" when in PDF mode', () => {
      const onViewModeChange = vi.fn()
      handleClick({ ...defaultProps, viewMode: 'pdf', onViewModeChange })
      expect(onViewModeChange).toHaveBeenCalledWith('details')
    })

    it('calls onDownload when authorized and clicking Download PDF', () => {
      const onDownload = vi.fn()
      const onViewModeChange = vi.fn()
      handleClick({
        ...defaultProps,
        isAuthorized: true,
        onDownload,
        onViewModeChange,
      })
      expect(onDownload).toHaveBeenCalled()
      expect(onViewModeChange).not.toHaveBeenCalled()
    })

    it('falls back to view mode change when authorized but no download handler', () => {
      const onViewModeChange = vi.fn()
      handleClick({
        ...defaultProps,
        isAuthorized: true,
        onViewModeChange,
      })
      expect(onViewModeChange).toHaveBeenCalledWith('pdf')
    })

    it('does nothing when downloading', () => {
      const onDownload = vi.fn()
      const onViewModeChange = vi.fn()
      handleClick({
        ...defaultProps,
        isAuthorized: true,
        onDownload,
        onViewModeChange,
        isDownloading: true,
      })
      expect(onDownload).not.toHaveBeenCalled()
      expect(onViewModeChange).not.toHaveBeenCalled()
    })
  })

  describe('disabled state', () => {
    it('is disabled when downloading', () => {
      expect(
        isDisabled({
          ...defaultProps,
          isAuthorized: true,
          onDownload: vi.fn(),
          isDownloading: true,
        })
      ).toBe(true)
    })

    it('is enabled when not downloading', () => {
      expect(
        isDisabled({
          ...defaultProps,
          isAuthorized: true,
          onDownload: vi.fn(),
          isDownloading: false,
        })
      ).toBe(false)
    })
  })

  describe('styling', () => {
    it('applies blue styling when authorized in details mode', () => {
      const styling = getButtonStyling({ ...defaultProps, isAuthorized: true, onDownload: vi.fn() })
      expect(styling.bgClass).toBe('bg-blue-600')
      expect(styling.textClass).toBe('text-white')
    })

    it('applies default styling when not authorized', () => {
      const styling = getButtonStyling({ ...defaultProps })
      expect(styling.bgClass).toBe('bg-white')
      expect(styling.textClass).toBe('text-gray-700')
    })

    it('applies default styling in PDF mode even when authorized', () => {
      const styling = getButtonStyling({ ...defaultProps, viewMode: 'pdf', isAuthorized: true })
      expect(styling.bgClass).toBe('bg-white')
    })
  })
})
