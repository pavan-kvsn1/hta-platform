import { render } from '@react-email/components'
import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { Layout } from '../../src/emails/components/Layout'

describe('legacy email Layout', () => {
  it('renders the HTA logo at title scale beside the full company name', async () => {
    const html = await render(
      <Layout preview="Test">
        <p>Content</p>
      </Layout>
    )

    expect(html).toContain('/logo.png')
    expect(html.match(/HTA Instrumentation Pvt\. Ltd\./g)).toHaveLength(3)
    expect(html).toContain('width="32"')
    expect(html).toContain('height="32"')
  })
})
