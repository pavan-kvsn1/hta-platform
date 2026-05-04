import { describe, it, expect } from 'vitest'
import { render } from '@react-email/components'
import * as React from 'react'
import { Button } from '../src/components/Button.js'
import { Layout } from '../src/components/Layout.js'

// Helper to render a React Email component to HTML string
async function renderHtml(element: React.ReactElement): Promise<string> {
  return render(element)
}

describe('Button component', () => {
  it('renders with href as a link', async () => {
    const html = await renderHtml(
      <Button href="https://example.com/action">Click Me</Button>
    )
    expect(html).toContain('https://example.com/action')
    expect(html).toContain('Click Me')
  })

  it('renders children text content', async () => {
    const html = await renderHtml(
      <Button href="https://example.com">My Button Text</Button>
    )
    expect(html).toContain('My Button Text')
  })

  it('renders primary variant by default with primary background color', async () => {
    const html = await renderHtml(
      <Button href="https://example.com">Primary</Button>
    )
    // Primary default color is #1e40af
    expect(html).toContain('#1e40af')
  })

  it('renders primary variant with custom color', async () => {
    const html = await renderHtml(
      <Button href="https://example.com" color="#ff0000">Red Button</Button>
    )
    expect(html).toContain('#ff0000')
    expect(html).toContain('Red Button')
  })

  it('renders secondary variant with white background', async () => {
    const html = await renderHtml(
      <Button href="https://example.com" variant="secondary">Secondary</Button>
    )
    // Secondary has border style and white background
    expect(html).toContain('Secondary')
    // Secondary uses #374151 text color
    expect(html).toContain('#374151')
  })

  it('renders as an anchor element', async () => {
    const html = await renderHtml(
      <Button href="https://example.com/link">Link</Button>
    )
    // React Email Button renders as <a> tag
    expect(html).toContain('<a')
    expect(html).toContain('href="https://example.com/link"')
  })
})

describe('Layout component', () => {
  it('renders with preview text', async () => {
    const html = await renderHtml(
      <Layout preview="Preview text here">
        <p>Content</p>
      </Layout>
    )
    expect(html).toContain('Preview text here')
  })

  it('renders children content', async () => {
    const html = await renderHtml(
      <Layout preview="Test">
        <p>Hello World Content</p>
      </Layout>
    )
    expect(html).toContain('Hello World Content')
  })

  it('uses default branding when no tenant provided', async () => {
    const html = await renderHtml(
      <Layout preview="Test">
        <p>Content</p>
      </Layout>
    )
    expect(html).toContain('HTA Instrumentation')
    expect(html).toContain('Calibration &amp; Testing Services')
  })

  it('displays custom tenant name', async () => {
    const html = await renderHtml(
      <Layout preview="Test" tenant={{ name: 'Custom Lab Inc' }}>
        <p>Content</p>
      </Layout>
    )
    expect(html).toContain('Custom Lab Inc')
  })

  it('applies custom primary color from tenant', async () => {
    const html = await renderHtml(
      <Layout preview="Test" tenant={{ name: 'Lab', primaryColor: '#ff6600' }}>
        <p>Content</p>
      </Layout>
    )
    expect(html).toContain('#ff6600')
  })

  it('renders logo image when logoUrl is provided', async () => {
    const html = await renderHtml(
      <Layout
        preview="Test"
        tenant={{ name: 'Logo Lab', logoUrl: 'https://example.com/logo.png' }}
      >
        <p>Content</p>
      </Layout>
    )
    expect(html).toContain('https://example.com/logo.png')
    expect(html).toContain('Logo Lab')
  })

  it('renders text heading when no logoUrl', async () => {
    const html = await renderHtml(
      <Layout preview="Test" tenant={{ name: 'Text Lab' }}>
        <p>Content</p>
      </Layout>
    )
    // Without logo, the name appears as text in the header
    expect(html).toContain('Text Lab')
  })

  it('renders support email link when provided', async () => {
    const html = await renderHtml(
      <Layout
        preview="Test"
        tenant={{ name: 'Support Lab', supportEmail: 'help@lab.com' }}
      >
        <p>Content</p>
      </Layout>
    )
    expect(html).toContain('mailto:help@lab.com')
    expect(html).toContain('Contact Support')
  })

  it('renders default support email', async () => {
    const html = await renderHtml(
      <Layout preview="Test">
        <p>Content</p>
      </Layout>
    )
    expect(html).toContain('mailto:support@htainstrumentation.com')
  })

  it('renders Visit Portal link', async () => {
    const html = await renderHtml(
      <Layout preview="Test">
        <p>Content</p>
      </Layout>
    )
    expect(html).toContain('Visit Portal')
  })

  it('renders copyright with current year and tenant name', async () => {
    const html = await renderHtml(
      <Layout preview="Test">
        <p>Content</p>
      </Layout>
    )
    const currentYear = new Date().getFullYear().toString()
    expect(html).toContain(currentYear)
    expect(html).toContain('All rights reserved')
  })

  it('uses custom websiteUrl from tenant', async () => {
    const html = await renderHtml(
      <Layout
        preview="Test"
        tenant={{ name: 'URL Lab', websiteUrl: 'https://custom-lab.example.com' }}
      >
        <p>Content</p>
      </Layout>
    )
    expect(html).toContain('https://custom-lab.example.com')
  })

  it('renders full HTML document structure', async () => {
    const html = await renderHtml(
      <Layout preview="Test">
        <p>Body content</p>
      </Layout>
    )
    expect(html).toContain('<!DOCTYPE html')
    expect(html).toContain('<html')
    expect(html).toContain('<head')
    expect(html).toContain('<body')
  })
})
